import type {
  CallCapture,
  ChoiceAnswer,
  DecisionAnswer,
  DecisionRuleOptions,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export interface DatabaseRuleOptions extends DecisionRuleOptions {
  databaseCallPatterns?: RegExp[];
}

export interface PreferDatabaseJoinOptions extends DatabaseRuleOptions {
  collectionOperationPatterns?: RegExp[];
}

export type RelationalDatabasesPlugin = ScruplePlugin<{
  "prefer-database-join": RuleFactory<PreferDatabaseJoinOptions>;
  "no-query-in-loop": RuleFactory<DatabaseRuleOptions>;
  "require-transaction-scoped-client": RuleFactory<DatabaseRuleOptions>;
  "require-deterministic-pagination-order": RuleFactory<DatabaseRuleOptions>;
}>;

const defaultDatabaseCallPatterns = [
  /(?:^|\.)(?:createMany|deleteMany|findMany|findAll|getMany|updateMany)$/u,
  /^(?:db|database|knex|sql)$/iu,
  /(?:^|\.)(?:db|database|prisma|knex|sequelize|repository|repo|dataSource|entityManager|pool)\./iu,
  /(?:^|\.)[\p{L}_$][\p{L}\p{N}_$]*Repository\.(?:count|createQueryBuilder|delete|find|findAndCount|findBy|findOne|insert|query|remove|save|update)$/u,
];
const databaseImportPatterns = [
  /["'](?:@prisma\/client|better-sqlite3|drizzle-orm|knex|kysely|mysql2?|pg|sequelize|sqlite3|typeorm)["']/iu,
];
const importedDatabaseReceiverPatterns = [
  /(?:^|\.)(?:client|connection|driver|entityManager|manager|pool|queryRunner)\.(?:aggregate|all|count|delete|execute|find|findBy|findOne|insert|query|remove|save|select|update)$/u,
];
const defaultCollectionOperationPatterns = [
  /(?:^|\.)(?:map|filter|find|reduce|forEach|some|every)$/u,
];
const iterationCallPatterns = [/(?:^|\.)(?:flatMap|forEach|map|reduce)$/u];
const loopSourcePattern =
  /\b(?:for\s*(?:await\s*)?\(|for\s+(?:await\s+)?(?:const|let|var)\b|while\s*\()/u;
const transactionCallPatterns = [/(?:^|\.)(?:\$transaction|transaction)$/u];
const paginationOptionNames = new Set(["limit", "offset", "skip", "take"]);
const orderingOptionNames = new Set(["orderby", "order_by"]);
const maxEvidenceItems = 20;
const maxFunctionCharacters = 12_000;

export const relationalDatabases = (): RelationalDatabasesPlugin => {
  return definePlugin({
    rules: {
      "prefer-database-join": preferDatabaseJoin,
      "no-query-in-loop": noQueryInLoop,
      "require-transaction-scoped-client": requireTransactionScopedClient,
      "require-deterministic-pagination-order": requireDeterministicPaginationOrder,
    },
  });
};

const preferDatabaseJoin = (options: PreferDatabaseJoinOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, 0.85, 0.7);
  const databasePatterns = databasePatternsFor(options);
  const collectionPatterns =
    options.collectionOperationPatterns ?? defaultCollectionOperationPatterns;
  validatePatterns("collectionOperationPatterns", collectionPatterns);

  return {
    description: "Prefer combining related relational query results in the database.",
    collect(document) {
      return implementationFunctions(document).flatMap((fn) => {
        const databaseCalls = directDatabaseCalls(fn, document, databasePatterns, options);
        const collectionOperations = fn.calls.filter((call) =>
          matchesAny(call.callee, collectionPatterns),
        );
        if (databaseCalls.length < 2 || collectionOperations.length === 0) {
          return [];
        }

        return [
          functionCandidate({
            fn,
            document,
            evidence: {
              database_calls: callEvidenceList(databaseCalls),
              database_sources: uniqueSources(databaseCalls).slice(0, maxEvidenceItems),
              collection_operations: callEvidenceList(collectionOperations),
            },
            instructions:
              "Does this function combine results from multiple queries to the same relational database in application memory when that database layer could reasonably do the work? Verify that the selected calls produce the relevant query results, target a compatible store, and are actually combined by the collection operation. Consider joins, relation includes, aggregations, subqueries, and filtered queries. Do not infer database provenance or backend capabilities that the supplied file does not establish.",
            criteria: {
              database_pushdown:
                "The function visibly fetches related results from a compatible relational database and combines or searches across them in memory even though the available database layer can reasonably express that work.",
              intentionally_in_memory:
                "The operation does not combine multiple query results, is an independent post-query transformation, operates on non-database data, uses separate database systems, or visibly requires application-only semantics.",
              insufficient_context:
                "The file does not establish query provenance, store compatibility, the relationship between results and collection operations, or support for an equivalent database operation.",
            },
          }),
        ];
      });
    },
    diagnose: choiceDiagnostic({
      finding: "database_pushdown",
      threshold,
      minConfidence,
      message:
        "This function appears to combine relational query results in memory when that work should be pushed into the database.",
    }),
  };
};

const noQueryInLoop = (options: DatabaseRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, 0.9, 0.7);
  const databasePatterns = databasePatternsFor(options);

  return {
    description: "Avoid issuing one relational database query per iterated item.",
    collect(document) {
      return implementationFunctions(document).flatMap((fn) => {
        const directCalls = directDatabaseCalls(fn, document, databasePatterns, options);
        const nestedCalls = descendantDatabaseCalls(fn, document, databasePatterns, options);
        const iterationCalls = fn.calls.filter((call) =>
          matchesAny(call.callee, iterationCallPatterns),
        );
        const lexicalLoop = loopSourcePattern.test(fn.source);
        const suspectedCalls =
          document.facts === undefined
            ? lexicalLoop
              ? callsAfterFirstLoop(fn, directCalls)
              : nestedCalls
            : [...directCalls, ...nestedCalls].filter((call) => isCallInIteration(call, document));
        const hasLoop =
          document.facts === undefined
            ? lexicalLoop
            : suspectedCalls.some(
                (call) =>
                  structuredCall(call, document)?.control.some(
                    (region) => region.kind === "loop",
                  ) === true,
              );
        if (suspectedCalls.length === 0 || (!hasLoop && iterationCalls.length === 0)) {
          return [];
        }

        return [
          functionCandidate({
            fn,
            document,
            evidence: {
              database_calls_in_iteration: callEvidenceList(suspectedCalls),
              iteration_calls: callEvidenceList(iterationCalls),
              loop_syntax_present: hasLoop,
            },
            instructions:
              "Does this function issue a relational database query once per iterated item, creating N+1 or repeated-query behavior that should reasonably be replaced by a join, relation include, bulk query, IN filter, or supported batching? Confirm that the query executes inside the iteration and depends on an iterated item. Allow visibly small bounded inputs, automatic ORM batching, chunked or streaming work, and operations that must run sequentially.",
            criteria: {
              query_in_loop:
                "A database query visibly executes per iterated item and a set-based, joined, included, bulk, or batched operation can reasonably preserve the behavior.",
              batched_or_bounded:
                "The calls are visibly batched by the database layer, operate on a deliberately small bounded input, or are chunked or streamed appropriately.",
              required_sequential:
                "The per-item operations visibly require sequential ordering, locking, or application-only behavior that cannot reasonably be batched.",
              not_per_item_query:
                "The database call is not executed by the iteration or does not depend on an iterated item.",
              insufficient_context:
                "The file does not establish execution nesting, input bounds, batching behavior, or whether a set-based equivalent is available.",
            },
          }),
        ];
      });
    },
    diagnose: choiceDiagnostic({
      finding: "query_in_loop",
      threshold,
      minConfidence,
      message:
        "This function appears to issue a database query per iterated item; use a set-based or batched operation.",
    }),
  };
};

const requireTransactionScopedClient = (options: DatabaseRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, 0.9, 0.75);
  const databasePatterns = databasePatternsFor(options);

  return {
    description: "Database work in a transaction should use its transaction-scoped client.",
    collect(document) {
      return implementationFunctions(document).flatMap((fn) => {
        const callbackCandidates = fn.calls.flatMap((call) => {
          if (!matchesAny(call.callee, transactionCallPatterns)) {
            return [];
          }
          const bindings = transactionBindings(call, document);
          if (bindings.length === 0) {
            return [];
          }
          const aliases = receiverAliases(call.range, document);
          const databaseCalls = databaseCallsWithin(
            call.range,
            document,
            databasePatterns,
            options,
            new Set(bindings),
            aliases,
          ).filter((candidate) => candidate.range.start !== call.range.start);
          const escapedCalls = databaseCalls.filter(
            (candidate) => !bindings.includes(resolveReceiver(callRoot(candidate.callee), aliases)),
          );
          return escapedCalls.length === 0
            ? []
            : [{ transactionCall: call, binding: bindings[0]!, escapedCalls, databaseCalls }];
        });
        const manualCandidates = manualTransactionEscapes(fn, document, databasePatterns, options);

        return [...callbackCandidates, ...manualCandidates].map((evidence) =>
          functionCandidate({
            fn,
            document,
            evidence: {
              transaction_call: callEvidence(evidence.transactionCall),
              transaction_binding: evidence.binding,
              database_calls: callEvidenceList(evidence.databaseCalls),
              suspected_escaped_calls: callEvidenceList(evidence.escapedCalls),
            },
            instructions:
              "Does this function execute database work through a global, pooled, or otherwise different client while a transaction is open, causing that work to escape the transaction? For callback transactions, operations that must roll back together should use the supplied transaction binding. For manual transactions, BEGIN, work, COMMIT, and ROLLBACK must use the same checked-out client. Allow a visibly intentional operation outside the atomic unit, and abstain when receiver aliases or helper contracts are not established.",
            criteria: {
              escaped_transaction:
                "Database work that belongs to the atomic operation visibly uses a client other than the transaction-scoped binding or the client that began the transaction.",
              transaction_scoped:
                "All visible work that belongs to the transaction uses its scoped binding or checked-out client.",
              intentional_external_operation:
                "The different-client operation is visibly intended to remain outside the transaction and does not need to roll back with it.",
              insufficient_context:
                "The file does not establish receiver identity, helper behavior, or whether the operation belongs to the atomic unit.",
            },
          }),
        );
      });
    },
    diagnose: choiceDiagnostic({
      finding: "escaped_transaction",
      threshold,
      minConfidence,
      message:
        "This database operation appears to escape the active transaction; use its transaction-scoped client.",
    }),
  };
};

const requireDeterministicPaginationOrder = (options: DatabaseRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, 0.9, 0.75);
  const databasePatterns = databasePatternsFor(options);

  return {
    description: "Paginated relational queries should define a deterministic order.",
    collect(document) {
      return implementationFunctions(document).flatMap((fn) => {
        const unorderedCalls = directDatabaseCalls(fn, document, databasePatterns, options).filter(
          (call) => {
            const evidence = paginationEvidence(call, document);
            return evidence?.paginated === true && !evidence.ordered;
          },
        );
        if (unorderedCalls.length === 0) {
          return [];
        }

        return [
          functionCandidate({
            fn,
            document,
            evidence: {
              unordered_paginated_calls: callEvidenceList(unorderedCalls),
            },
            instructions:
              "Does this function use LIMIT/OFFSET, skip/take, or an equivalent mechanism to return pages of relational query results without an explicit deterministic ordering? Flag only actual pagination where repeatable page membership matters. Allow deliberate unordered sampling, aggregate or singleton queries, and limits used only as safety caps. Do not claim an ordering is unique without schema evidence.",
            criteria: {
              missing_order:
                "A query is used for pagination or stable page traversal but has no explicit ordering, so page membership can be inconsistent.",
              deterministic_order:
                "The paginated query visibly defines an ordering appropriate to its cursor or page traversal.",
              unordered_by_design:
                "The limited result is deliberately unordered or sampled and stable page membership is not required.",
              not_pagination:
                "The limit is a safety cap, aggregate, singleton bound, or another operation that does not traverse pages.",
              insufficient_context:
                "The file does not establish whether the limit represents pagination or whether ordering is supplied externally.",
            },
          }),
        ];
      });
    },
    diagnose: choiceDiagnostic({
      finding: "missing_order",
      threshold,
      minConfidence,
      message: "This paginated query appears to lack an explicit deterministic ordering.",
    }),
  };
};

interface FunctionCandidateDefinition {
  fn: FunctionTarget;
  document: ParsedDocument;
  evidence: Record<string, JsonValue>;
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
}

const functionCandidate = (definition: FunctionCandidateDefinition): RuleCandidate => {
  return {
    target: definition.fn,
    state: {
      language: definition.document.language,
      imports: boundedUnique(definition.document.imports, (entry) => entry),
      function: definition.fn.source,
      evidence: definition.evidence,
      context: { evidence_boundary: "current_file" },
    },
    question: {
      type: "choice",
      instructions: definition.instructions,
      criteria: definition.criteria,
    },
  };
};

interface DiagnosticDefinition {
  finding: string;
  threshold: number;
  minConfidence: number;
  message: string;
}

const choiceDiagnostic = (definition: DiagnosticDefinition) => {
  return (answer: DecisionAnswer, candidate: RuleCandidate) => {
    if (!isFinding(answer, definition.finding, definition.threshold, definition.minConfidence)) {
      return null;
    }
    return {
      message: definition.message,
      filename: candidate.target.filename,
      location: candidate.target.location,
      probability: answer.probabilities[definition.finding] ?? 0,
      confidence: answer.confidence,
    };
  };
};

const databasePatternsFor = (options: DatabaseRuleOptions): RegExp[] => {
  const patterns = options.databaseCallPatterns ?? defaultDatabaseCallPatterns;
  validatePatterns("databaseCallPatterns", patterns);
  return patterns;
};

const directDatabaseCalls = (
  fn: FunctionTarget,
  document: ParsedDocument,
  patterns: RegExp[],
  options: DatabaseRuleOptions,
): CallCapture[] => {
  return fn.calls.filter((call) => isDatabaseCall(call, document, patterns, options));
};

const descendantDatabaseCalls = (
  fn: FunctionTarget,
  document: ParsedDocument,
  patterns: RegExp[],
  options: DatabaseRuleOptions,
): CallCapture[] => {
  return document.functions
    .filter(
      (candidate) =>
        candidate !== fn &&
        candidate.range.start >= fn.range.start &&
        candidate.range.end <= fn.range.end,
    )
    .flatMap((candidate) => directDatabaseCalls(candidate, document, patterns, options));
};

const databaseCallsWithin = (
  range: { start: number; end: number },
  document: ParsedDocument,
  patterns: RegExp[],
  options: DatabaseRuleOptions,
  scopedReceivers: Set<string>,
  aliases: Map<string, string>,
): CallCapture[] => {
  return document.functions
    .flatMap((fn) => fn.calls)
    .filter(
      (call) =>
        call.range.start >= range.start &&
        call.range.end <= range.end &&
        (scopedReceivers.has(resolveReceiver(callRoot(call.callee), aliases)) ||
          isDatabaseCallWithAliases(call, document, patterns, options, aliases)),
    );
};

const isDatabaseCallWithAliases = (
  call: CallCapture,
  document: ParsedDocument,
  patterns: RegExp[],
  options: DatabaseRuleOptions,
  aliases: Map<string, string>,
): boolean => {
  if (isDatabaseCall(call, document, patterns, options)) {
    return true;
  }
  const root = callRoot(call.callee);
  const resolved = resolveReceiver(root, aliases);
  if (resolved === root) {
    return false;
  }
  const resolvedCallee = `${resolved}${call.callee.slice(root.length)}`;
  return (
    matchesAny(resolvedCallee, patterns) ||
    (options.databaseCallPatterns === undefined &&
      matchesAny(document.imports.join("\n"), databaseImportPatterns) &&
      matchesAny(resolvedCallee, importedDatabaseReceiverPatterns))
  );
};

const callsAfterFirstLoop = (fn: FunctionTarget, calls: CallCapture[]): CallCapture[] => {
  const match = loopSourcePattern.exec(fn.source);
  if (match === null) {
    return [];
  }
  const loopStart = fn.range.start + match.index;
  return calls.filter((call) => call.range.start >= loopStart);
};

const isCallInIteration = (call: CallCapture, document: ParsedDocument): boolean => {
  return (
    structuredCall(call, document)?.control.some(
      (region) =>
        region.kind === "loop" ||
        (region.kind === "callback" &&
          region.callee !== undefined &&
          matchesAny(region.callee, iterationCallPatterns)),
    ) ?? false
  );
};

const structuredCall = (call: CallCapture, document: ParsedDocument) => {
  return document.facts?.calls.find(
    (fact) => fact.range.start === call.range.start && fact.range.end === call.range.end,
  );
};

const isDatabaseCall = (
  call: CallCapture,
  document: ParsedDocument,
  patterns: RegExp[],
  options: DatabaseRuleOptions,
): boolean => {
  if (matchesAny(call.callee, patterns)) {
    return true;
  }
  return (
    options.databaseCallPatterns === undefined &&
    matchesAny(document.imports.join("\n"), databaseImportPatterns) &&
    matchesAny(call.callee, importedDatabaseReceiverPatterns)
  );
};

interface TransactionEvidence {
  transactionCall: CallCapture;
  binding: string;
  databaseCalls: CallCapture[];
  escapedCalls: CallCapture[];
}

const manualTransactionEscapes = (
  fn: FunctionTarget,
  document: ParsedDocument,
  patterns: RegExp[],
  options: DatabaseRuleOptions,
): TransactionEvidence[] => {
  const beginCall = fn.calls.find((call) => /["'`]\s*BEGIN\s*["'`]/iu.test(call.source));
  if (beginCall === undefined) {
    return [];
  }
  const binding = callRoot(beginCall.callee);
  const aliases = receiverAliases(fn.range, document);
  const databaseCalls = fn.calls.filter((call) =>
    isDatabaseCallWithAliases(call, document, patterns, options, aliases),
  );
  const resolvedBinding = resolveReceiver(binding, aliases);
  const escapedCalls = databaseCalls.filter(
    (call) => resolveReceiver(callRoot(call.callee), aliases) !== resolvedBinding,
  );
  return escapedCalls.length === 0
    ? []
    : [{ transactionCall: beginCall, binding, databaseCalls, escapedCalls }];
};

const transactionBinding = (source: string): string | undefined => {
  return /(?:async\s*)?(?:\(\s*([\p{L}_$][\p{L}\p{N}_$]*)\s*\)|([\p{L}_$][\p{L}\p{N}_$]*))\s*=>/u
    .exec(source)
    ?.slice(1)
    .find((binding) => binding !== undefined);
};

const transactionBindings = (call: CallCapture, document: ParsedDocument): string[] => {
  const fact = structuredCall(call, document);
  const bindings = fact?.arguments.find((argument) => argument.kind === "function")?.bindings?.[0];
  if (bindings !== undefined && bindings.length > 0) {
    return bindings;
  }
  const fallback = transactionBinding(call.source);
  return fallback === undefined ? [] : [fallback];
};

const receiverAliases = (
  range: { start: number; end: number },
  document: ParsedDocument,
): Map<string, string> => {
  const grouped = new Map<string, Set<string>>();
  for (const alias of document.facts?.aliases ?? []) {
    if (alias.range.start < range.start || alias.range.end > range.end) {
      continue;
    }
    const targets = grouped.get(alias.binding) ?? new Set<string>();
    targets.add(callRoot(alias.target));
    grouped.set(alias.binding, targets);
  }
  const aliases = new Map<string, string>();
  for (const [binding, targets] of grouped) {
    const target = [...targets][0];
    if (targets.size === 1 && target !== undefined && binding !== target) {
      aliases.set(binding, target);
    }
  }
  return aliases;
};

const resolveReceiver = (receiver: string, aliases: Map<string, string>): string => {
  const seen = new Set<string>();
  let current = receiver;
  while (!seen.has(current)) {
    seen.add(current);
    const target = aliases.get(current);
    if (target === undefined) {
      return current;
    }
    current = target;
  }
  return receiver;
};

const paginationEvidence = (
  call: CallCapture,
  document: ParsedDocument,
): { paginated: boolean; ordered: boolean } | undefined => {
  const fact = structuredCall(call, document);
  if (fact === undefined) {
    return undefined;
  }
  for (const argument of fact.arguments) {
    if (argument.kind === "object") {
      const properties = (argument.properties ?? []).map((property) => property.toLowerCase());
      if (properties.some((property) => paginationOptionNames.has(property))) {
        return {
          paginated: true,
          ordered: properties.some((property) => orderingOptionNames.has(property)),
        };
      }
    }
  }
  const query = fact.arguments[0]?.value;
  if (typeof query !== "string" || !/(?:^|\.)query$/iu.test(call.callee)) {
    return undefined;
  }
  const tokens = sqlStructure(query);
  return {
    paginated: /\b(?:limit|offset)\b/iu.test(tokens),
    ordered: /\border\s+by\b/iu.test(tokens),
  };
};

const sqlStructure = (query: string): string => {
  return query.replaceAll(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/gu, " ");
};

const callEvidence = (call: CallCapture): JsonValue => {
  return { callee: call.callee, source: call.source };
};

const callEvidenceList = (calls: CallCapture[]): JsonValue[] => {
  return boundedUnique(calls, (call) => `${call.callee}:${call.source}`).map((call) =>
    callEvidence(call),
  );
};

const callRoot = (callee: string): string => {
  return callee.split(".")[0] ?? callee;
};

const uniqueSources = (calls: CallCapture[]): JsonValue[] => {
  return [...new Set(calls.map((call) => callRoot(call.callee)))];
};

const boundedUnique = <Value>(values: Value[], key: (value: Value) => string): Value[] => {
  const seen = new Set<string>();
  const result: Value[] = [];
  for (const value of values) {
    const identity = key(value);
    if (!seen.has(identity)) {
      seen.add(identity);
      result.push(value);
    }
    if (result.length === maxEvidenceItems) {
      break;
    }
  }
  return result;
};

const implementationFunctions = (document: ParsedDocument): FunctionTarget[] => {
  return document.functions.filter(
    (fn) =>
      fn.kind === "function" && fn.source.length > 0 && fn.source.length <= maxFunctionCharacters,
  );
};

const decisionOptions = (
  options: { threshold?: number; minConfidence?: number },
  defaultThreshold: number,
  defaultMinConfidence: number,
): { threshold: number; minConfidence: number } => {
  return resolveDecisionOptions(options, {
    threshold: defaultThreshold,
    minConfidence: defaultMinConfidence,
  });
};

const validatePatterns = (name: string, patterns: RegExp[]): void => {
  if (!Array.isArray(patterns) || patterns.some((pattern) => !(pattern instanceof RegExp))) {
    throw new TypeError(`${name} must be an array of regular expressions`);
  }
};

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};

const isFinding = (
  answer: DecisionAnswer,
  finding: string,
  threshold: number,
  minConfidence: number,
): answer is ChoiceAnswer => {
  return (
    answer.type === "choice" &&
    answer.choice === finding &&
    (answer.probabilities[finding] ?? 0) >= threshold &&
    answer.confidence >= minConfidence
  );
};
