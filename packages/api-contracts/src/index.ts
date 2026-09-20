import type {
  ApiBoundaryTarget,
  DecisionAnswer,
  DecisionRuleOptions,
  DecisionThreshold,
  DecisionThresholds,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions, resolveDiagnosticSeverity } from "@scruple/core";

export interface ApiContractRuleOptions extends DecisionRuleOptions {
  /** Functions or route handlers larger than this are skipped. */
  maxFunctionCharacters?: number;
  /** Maximum total import-source characters included in evidence. */
  maxImportCharacters?: number;
  /** Maximum call sites included in evidence. */
  maxCallSites?: number;
}

export type ApiContractsPlugin = ScruplePlugin<{
  "no-misleading-function-names": RuleFactory<ApiContractRuleOptions>;
  "no-ambiguous-failure-contracts": RuleFactory<ApiContractRuleOptions>;
  "require-input-validation": RuleFactory<ApiContractRuleOptions>;
  "no-side-effects-in-safe-http-methods": RuleFactory<ApiContractRuleOptions>;
  "no-misleading-http-status": RuleFactory<ApiContractRuleOptions>;
  "no-ignored-significant-results": RuleFactory<ApiContractRuleOptions>;
}>;

const contextCharacters = 600;

export const apiContracts = (): ApiContractsPlugin => {
  return definePlugin({
    rules: {
      "no-misleading-function-names": noMisleadingFunctionNames,
      "no-ambiguous-failure-contracts": noAmbiguousFailureContracts,
      "require-input-validation": requireInputValidation,
      "no-side-effects-in-safe-http-methods": noSideEffectsInSafeHttpMethods,
      "no-misleading-http-status": noMisleadingHttpStatus,
      "no-ignored-significant-results": noIgnoredSignificantResults,
    },
  });
};

const significantResultCallee =
  /(?:^|\.)(?:compareAndSet|create|delete|insert|parse|remove|safeParse|save|try[A-Z]\w*|update|validate)$/u;

const noIgnoredSignificantResults = (options: ApiContractRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, {
    threshold: { warning: 0.9, error: 0.97 },
    minConfidence: 0.7,
  });
  const { threshold, minConfidence } = resolved;
  const finding = "ignored_significant_result";
  return {
    description: "Results carrying meaningful outcome information should not be discarded.",
    collect(document) {
      return (document.facts?.calls ?? [])
        .filter(
          (call) =>
            call.usage === "expression" &&
            call.callee !== undefined &&
            significantResultCallee.test(call.callee),
        )
        .flatMap((call) => {
          const enclosingFunction = smallestEnclosingFunction(call.range, document.functions);
          if (
            enclosingFunction !== undefined &&
            !isBoundedImplementation(enclosingFunction, resolved.maxFunctionCharacters)
          ) {
            return [];
          }
          const imports = boundedImports(document.imports, resolved.maxImportCharacters);
          const calls = (enclosingFunction?.calls ?? [])
            .toSorted((left, right) => left.range.start - right.range.start)
            .slice(0, resolved.maxCallSites);
          return [
            {
              target: {
                kind: "expression" as const,
                filename: document.filename,
                language: document.language,
                range: call.range,
                location: sourceLocation(document.source, call.range),
                source: call.source,
              },
              state: {
                language: document.language,
                imports: imports.values,
                imports_truncated: imports.truncated,
                call: { callee: call.callee ?? null, source: call.source, usage: call.usage },
                surrounding_function: enclosingFunction?.source ?? null,
                calls: calls.map((entry) => ({ callee: entry.callee, source: entry.source })),
                calls_truncated: calls.length < (enclosingFunction?.calls.length ?? 0),
                evidence_scope:
                  "The call, syntactic usage, bounded imports, enclosing function, and bounded calls are visible; unresolved return contracts are not evidence.",
              },
              data: {
                usage: call.usage,
                total_imports: document.imports.length,
                total_calls: enclosingFunction?.calls.length ?? 0,
                imports_truncated: imports.truncated,
                calls_truncated: calls.length < (enclosingFunction?.calls.length ?? 0),
              },
              question: {
                type: "choice" as const,
                instructions:
                  "Does this bare call discard a result that conveys success, failure, validation, affected state, or another outcome the caller must observe? Diagnose only when the visible contract or strong API convention establishes significance. Choose insufficient_context for opaque return contracts.",
                criteria: {
                  ignored_significant_result:
                    "The discarded result carries outcome information that is required for correct handling.",
                  result_intentionally_ignored:
                    "The result is explicitly optional or intentionally irrelevant at this call site.",
                  no_significant_result:
                    "The operation has no meaningful return value or communicates its complete outcome another way.",
                  insufficient_context:
                    "The available evidence does not establish the return contract or whether the result matters.",
                },
              },
            },
          ];
        });
    },
    diagnose(answer, candidate) {
      return findingDiagnostic(
        answer,
        candidate,
        finding,
        threshold,
        minConfidence,
        "This call appears to ignore a result that carries significant outcome information.",
      );
    },
  };
};

const noMisleadingFunctionNames = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return choiceRule({
    description: "Function names should accurately describe behavior visible in their bodies.",
    options,
    defaults: { threshold: { warning: 0.9, error: 0.97 }, minConfidence: 0.7 },
    select: namedFunctions,
    question: {
      instructions:
        "Does the function name make a concrete behavioral promise that its visible implementation contradicts? Judge direct effects, returned values, predicates, units, and clear operation verbs. Treat unfamiliar domain terminology, overloaded business verbs, thin delegation, and behavior hidden behind calls as ambiguous rather than misleading. Do not infer caller expectations or callee behavior that the evidence does not show.",
      criteria: {
        accurate_name:
          "The visible implementation is consistent with the concrete promise in the name.",
        misleading_name:
          "The visible implementation clearly performs or returns something contrary to a concrete promise in the name.",
        domain_specific_or_ambiguous:
          "The name uses domain language or has multiple reasonable meanings, so the visible code does not prove a contradiction.",
        insufficient_context:
          "The implementation delegates behavior or otherwise lacks enough visible evidence to judge the name.",
      },
    },
    finding: "misleading_name",
    message: "This function name appears to contradict its visible behavior.",
  });
};

const noAmbiguousFailureContracts = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return choiceRule({
    description: "Public functions should expose a coherent, distinguishable failure contract.",
    options,
    defaults: { threshold: { warning: 0.8, error: 0.95 }, minConfidence: 0.7 },
    select: directlyExportedFunctions,
    question: {
      instructions:
        "Does this directly exported function visibly expose multiple overlapping or indistinguishable failure representations, such as nullable or sentinel returns mixed with Result/error values or thrown errors? Judge only its signature and implementation. Different channels are acceptable when their roles are visibly distinct (for example, a thrown programmer invariant and a Result for domain failure). Do not infer how callers interpret the contract.",
      criteria: {
        coherent_failure_contract:
          "The function has one failure representation, or visibly separates multiple representations by distinct roles.",
        ambiguous_failure_contract:
          "The function visibly represents overlapping failures through multiple channels without a clear distinction.",
        insufficient_context:
          "The visible signature and body do not establish the function's failure behavior or the roles of its channels.",
      },
    },
    finding: "ambiguous_failure_contract",
    message: "This exported function appears to expose an ambiguous failure contract.",
  });
};

const requireInputValidation = (options: ApiContractRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, {
    threshold: { warning: 0.85, error: 0.95 },
    minConfidence: 0.7,
  });
  const { threshold, minConfidence } = resolved;
  const question = {
    type: "choice" as const,
    instructions:
      "Does this visible API boundary use untrusted request or raw payload data without runtime validation? Treat the normalized request sources as untrusted. An attached inline framework schema is validation evidence only for the request parts it visibly covers. Captured middleware or referenced schemas whose behavior is not shown do not prove validation. Schema parsing, explicit guards, and validated domain types are counter-evidence. Type annotations and type assertions alone are not runtime validation. Choose insufficient_context when validation behavior or coverage is hidden.",
    criteria: {
      validation_present:
        "The visible handler validates or parses each used untrusted input before consequential use.",
      framework_validation_present:
        "An attached framework schema or middleware visibly validates every used request source before the handler uses it.",
      validation_required:
        "The boundary visibly uses untrusted request or raw payload data without visible runtime validation.",
      trusted_input:
        "The fallback function explicitly receives a validated or trusted domain value rather than raw boundary data.",
      insufficient_context:
        "Referenced schema, middleware, caller, or helper behavior is needed to establish validation or input trust.",
    },
  };
  return {
    description: "Untrusted API inputs should be validated before they are used.",
    collect(document) {
      const boundaries = (document.apiBoundaries ?? []).filter(
        (boundary) =>
          boundary.requestSources.length > 0 &&
          boundary.handlerSource.length <= resolved.maxFunctionCharacters,
      );
      const representedHandlers = new Set(
        boundaries.map((boundary) => `${boundary.handlerRange.start}:${boundary.handlerRange.end}`),
      );
      const routeCandidates: RuleCandidate[] = boundaries.map((boundary) => ({
        target: boundary,
        state: boundaryState(boundary, document, resolved),
        question,
        data: { evidenceKind: "normalized_api_boundary" },
      }));
      const fallbackCandidates: RuleCandidate[] = explicitRawBoundaryFunctions(document, resolved)
        .filter(({ fn }) => !representedHandlers.has(`${fn.range.start}:${fn.range.end}`))
        .map(({ fn, exportEvidence }) => ({
          target: fn,
          state: functionState(fn, document, exportEvidence, resolved),
          question,
          data: { evidenceKind: "explicit_raw_export", exportEvidence: exportEvidence ?? "" },
        }));
      return [...routeCandidates, ...fallbackCandidates];
    },
    diagnose(answer, candidate) {
      return findingDiagnostic(
        answer,
        candidate,
        "validation_required",
        threshold,
        minConfidence,
        "This API boundary appears to use untrusted input without runtime validation.",
      );
    },
  };
};

const noSideEffectsInSafeHttpMethods = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return boundaryChoiceRule({
    description: "Safe HTTP methods should not implement requested state-changing behavior.",
    options,
    defaults: { threshold: { warning: 0.9, error: 0.97 }, minConfidence: 0.75 },
    select: (document) =>
      (document.apiBoundaries ?? []).filter(
        (boundary) => safeHttpMethods.has(boundary.method) && hasPossibleStateChange(boundary),
      ),
    instructions:
      "Does this GET, HEAD, OPTIONS, or TRACE operation visibly perform a state change requested by the client? Distinguish the operation's intended effect from incidental logging, metrics, tracing, cache population, or audit recording. Do not infer effects hidden inside unfamiliar callees. Choose insufficient_context when a call name or incomplete handler evidence does not establish the effect.",
    criteria: {
      requested_side_effect:
        "The safe-method operation visibly creates, changes, deletes, charges, dispatches, publishes, or enqueues domain state as an intended request effect.",
      incidental_side_effect:
        "Visible writes are incidental logging, metrics, tracing, auditing, or cache maintenance rather than requested resource changes.",
      read_only: "The operation only reads or computes a response.",
      insufficient_context:
        "The supplied handler and call evidence does not establish whether the operation changes domain state.",
    },
    finding: "requested_side_effect",
    message: "This safe-method route appears to perform a requested state change.",
  });
};

const noMisleadingHttpStatus = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return boundaryChoiceRule({
    description: "Explicit HTTP status codes should match the visible operation outcome.",
    options,
    defaults: { threshold: { warning: 0.9, error: 0.97 }, minConfidence: 0.75 },
    select: (document) =>
      (document.apiBoundaries ?? []).filter((boundary) =>
        boundary.responseExits.some((exit) => exit.status !== undefined),
      ),
    instructions:
      "Does an explicitly emitted HTTP status code contradict the visible outcome on that response path? Judge standard status semantics together with the operation method, path, body, and visible control flow. 202 for accepted asynchronous work, 204 without content, and deliberate privacy-preserving 404 responses can be coherent. Do not invent framework defaults or outcomes hidden in callees, global error handlers, or middleware.",
    criteria: {
      aligned_status:
        "Each explicit status is consistent with the visible outcome and response body on its path.",
      misleading_status:
        "An explicit status clearly represents failure as success, success as the wrong outcome, or otherwise contradicts the visible response path.",
      deliberate_policy:
        "The unusual status is visibly explained by asynchronous processing, privacy policy, or another deliberate contract.",
      insufficient_context:
        "Hidden callee, middleware, framework, or error-handler behavior is needed to determine the outcome.",
    },
    finding: "misleading_status",
    message: "This route appears to emit an HTTP status that contradicts its visible outcome.",
  });
};

interface ChoiceRuleDefinition {
  description: string;
  options: ApiContractRuleOptions;
  defaults: DecisionThresholds;
  select(document: ParsedDocument, options: ResolvedOptions): SelectedFunction[];
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  finding: string;
  message: string;
}

interface BoundaryChoiceRuleDefinition {
  description: string;
  options: ApiContractRuleOptions;
  defaults: DecisionThresholds;
  select(document: ParsedDocument, options: ResolvedOptions): ApiBoundaryTarget[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  message: string;
}

interface SelectedFunction {
  fn: FunctionTarget;
  exportEvidence?: string;
}

interface ResolvedOptions {
  threshold: DecisionThreshold;
  minConfidence: number;
  maxFunctionCharacters: number;
  maxImportCharacters: number;
  maxCallSites: number;
}

const choiceRule = (definition: ChoiceRuleDefinition): SemanticRule => {
  const resolved = resolveOptions(definition.options, definition.defaults);
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document, resolved).map(({ fn, exportEvidence }) => {
        const candidate: RuleCandidate = {
          target: fn,
          state: functionState(fn, document, exportEvidence, resolved),
          question: {
            type: "choice",
            instructions: definition.question.instructions,
            criteria: definition.question.criteria,
          },
        };
        if (exportEvidence !== undefined) {
          candidate.data = { exportEvidence };
        }
        return candidate;
      });
    },
    diagnose(answer, candidate) {
      if (answer.type !== "choice" || answer.choice !== definition.finding) {
        return null;
      }
      const probability = answer.probabilities[definition.finding] ?? 0;
      const severity = resolveDiagnosticSeverity(probability, answer.confidence, resolved);
      if (severity === null) {
        return null;
      }
      return diagnostic(candidate, definition.message, probability, answer.confidence, severity);
    },
  };
};

const boundaryChoiceRule = (definition: BoundaryChoiceRuleDefinition): SemanticRule => {
  const resolved = resolveOptions(definition.options, definition.defaults);
  return {
    description: definition.description,
    collect(document) {
      return definition
        .select(document, resolved)
        .filter((boundary) => boundary.handlerSource.length <= resolved.maxFunctionCharacters)
        .map((boundary) => ({
          target: boundary,
          state: boundaryState(boundary, document, resolved),
          question: {
            type: "choice" as const,
            instructions: definition.instructions,
            criteria: definition.criteria,
          },
          data: { evidenceKind: "normalized_api_boundary" },
        }));
    },
    diagnose(answer, candidate) {
      if (answer.type !== "choice" || answer.choice !== definition.finding) {
        return null;
      }
      const probability = answer.probabilities[definition.finding] ?? 0;
      const severity = resolveDiagnosticSeverity(probability, answer.confidence, resolved);
      if (severity === null) {
        return null;
      }
      return diagnostic(candidate, definition.message, probability, answer.confidence, severity);
    },
  };
};

const findingDiagnostic = (
  answer: DecisionAnswer,
  candidate: RuleCandidate,
  finding: string,
  threshold: DecisionThreshold,
  minConfidence: number,
  message: string,
) => {
  if (answer.type !== "choice" || answer.choice !== finding) {
    return null;
  }
  const probability = answer.probabilities[finding] ?? 0;
  const severity = resolveDiagnosticSeverity(probability, answer.confidence, {
    threshold,
    minConfidence,
  });
  return severity === null
    ? null
    : diagnostic(candidate, message, probability, answer.confidence, severity);
};

const safeHttpMethods = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
const possibleStateChangePattern =
  /(?:^|\.)(?:add|append|charge|create|delete|destroy|dispatch|enqueue|insert|mutate|publish|remove|save|set|update|write)(?:$|[A-Z_])/u;
const incidentalCallRootPattern = /^(?:console|log|logger|metrics|reply|res|response)(?:\.|$)/u;

const hasPossibleStateChange = (boundary: ApiBoundaryTarget): boolean => {
  return boundary.calls.some(
    (call) =>
      possibleStateChangePattern.test(call.callee) && !incidentalCallRootPattern.test(call.callee),
  );
};

const explicitRawBoundaryFunctions = (
  document: ParsedDocument,
  options: ResolvedOptions,
): SelectedFunction[] => {
  return directlyExportedFunctions(document, options).filter(({ fn }) => {
    const evidence = fn.source;
    return (
      /\bunknown\b/u.test(evidence) ||
      /\b(?:raw|payload|webhook)\b/iu.test(evidence) ||
      /\b(?:req|request)\s*\.\s*(?:body|cookies|headers|params|query|raw)\b/u.test(evidence)
    );
  });
};

const boundaryState = (
  boundary: ApiBoundaryTarget,
  document: ParsedDocument,
  options: ResolvedOptions,
): JsonValue => ({
  language: document.language,
  imports: boundedImports(document.imports, options.maxImportCharacters).values,
  imports_truncated: boundedImports(document.imports, options.maxImportCharacters).truncated,
  apiBoundary: {
    framework: boundary.framework,
    method: boundary.method,
    path: boundary.path,
    registration: boundary.source,
    handler: boundary.handlerSource,
    requestSources: boundary.requestSources.map((source) => ({
      kind: source.kind,
      source: source.source,
    })),
    attachments: boundary.attachments.map((attachment) => ({
      kind: attachment.kind,
      source: attachment.source,
    })),
    responseExits: boundary.responseExits.map((exit) => ({
      kind: exit.kind,
      status: exit.status ?? null,
      body: exit.bodySource ?? null,
      headers: exit.headerSources,
      source: exit.source,
    })),
    calls: boundary.calls.slice(0, options.maxCallSites).map((call) => ({
      callee: call.callee,
      source: call.source,
    })),
    completeness: {
      handler: boundary.completeness.handler,
      requestSources: boundary.completeness.requestSources,
      attachments: boundary.completeness.attachments,
      responseExits: boundary.completeness.responseExits,
      reasons: boundary.completeness.reasons,
    },
    calls_truncated: boundary.calls.length > options.maxCallSites,
  },
  evidenceLimitations: [
    "Only this route registration and a locally resolvable handler are shown.",
    "Attached middleware and referenced schemas are captured but their behavior is not resolved.",
    "Callee effects, mounted routers, plugins, global hooks, and global error handling are not established.",
  ],
});

const namedFunctions = (document: ParsedDocument, options: ResolvedOptions): SelectedFunction[] => {
  return document.functions.flatMap((fn) => {
    if (
      !isBoundedImplementation(fn, options.maxFunctionCharacters) ||
      fn.name === undefined ||
      fn.name.length === 0
    ) {
      return [];
    }
    const exportEvidence = directExportEvidence(fn, document);
    return [{ fn, ...(exportEvidence === undefined ? {} : { exportEvidence }) }];
  });
};

const directlyExportedFunctions = (
  document: ParsedDocument,
  options: ResolvedOptions,
): SelectedFunction[] => {
  return document.functions.flatMap((fn) => {
    if (!isBoundedImplementation(fn, options.maxFunctionCharacters)) {
      return [];
    }
    const exportEvidence = directExportEvidence(fn, document);
    return exportEvidence === undefined ? [] : [{ fn, exportEvidence }];
  });
};

const isBoundedImplementation = (fn: FunctionTarget, maximumCharacters: number): boolean => {
  return fn.kind === "function" && fn.source.length > 0 && fn.source.length <= maximumCharacters;
};

const directExportEvidence = (fn: FunctionTarget, document: ParsedDocument): string | undefined => {
  const prefixStart = Math.max(0, fn.range.start - 300);
  const prefix = document.source.slice(prefixStart, fn.range.start);
  const declaration = prefix.match(/(?:^|[;}\n])\s*(export\s+(?:default\s+)?)$/u)?.[1];
  if (declaration !== undefined) {
    return declaration.trim();
  }
  const variable = prefix.match(/(?:^|[;}\n])\s*(export\s+(?:const|let|var)\s+[^;\n]*=\s*)$/u)?.[1];
  return variable?.trim();
};

const functionState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  exportEvidence: string | undefined,
  options: ResolvedOptions,
): JsonValue => {
  const imports = boundedImports(document.imports, options.maxImportCharacters);
  const calls = fn.calls
    .toSorted((left, right) => left.range.start - right.range.start)
    .slice(0, options.maxCallSites);
  return {
    language: document.language,
    imports: imports.values,
    imports_truncated: imports.truncated,
    function: {
      name: fn.name ?? null,
      async: fn.async,
      source: fn.source,
      calls: calls.map((call) => call.callee),
      calls_truncated: calls.length < fn.calls.length,
    },
    public_contract: {
      directly_exported: exportEvidence !== undefined,
      evidence: exportEvidence ?? null,
      limitation:
        "This file does not establish all callers, call-site validation, middleware, or behavior inside callees.",
    },
    surrounding_code: document.source.slice(
      Math.max(0, fn.range.start - contextCharacters),
      Math.min(document.source.length, fn.range.end + contextCharacters),
    ),
  };
};

const smallestEnclosingFunction = (
  range: { start: number; end: number },
  functions: readonly FunctionTarget[],
): FunctionTarget | undefined => {
  return functions
    .filter((fn) => fn.range.start <= range.start && fn.range.end >= range.end)
    .toSorted(
      (left, right) => left.range.end - left.range.start - (right.range.end - right.range.start),
    )[0];
};

const boundedImports = (
  imports: readonly string[],
  maximumCharacters: number,
): { values: string[]; truncated: boolean } => {
  const values: string[] = [];
  let characters = 0;
  for (const statement of imports) {
    const next = characters + (values.length === 0 ? 0 : 1) + statement.length;
    if (next > maximumCharacters) {
      return { values, truncated: true };
    }
    values.push(statement);
    characters = next;
  }
  return { values, truncated: false };
};

const resolveOptions = (
  options: ApiContractRuleOptions,
  defaults: DecisionThresholds,
): ResolvedOptions => {
  return {
    ...resolveDecisionOptions(options, defaults),
    maxFunctionCharacters: integerOption(
      "maxFunctionCharacters",
      options.maxFunctionCharacters,
      12_000,
      1,
    ),
    maxImportCharacters: integerOption(
      "maxImportCharacters",
      options.maxImportCharacters,
      2_000,
      0,
    ),
    maxCallSites: integerOption("maxCallSites", options.maxCallSites, 50, 0),
  };
};

const integerOption = (
  name: string,
  value: number | undefined,
  fallback: number,
  minimum: number,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
  return resolved;
};

const sourceLocation = (source: string, range: { start: number; end: number }) => {
  const position = (offset: number) => {
    const lines = source.slice(0, offset).split("\n");
    return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
  };
  return { start: position(range.start), end: position(range.end) };
};

const diagnostic = (
  candidate: RuleCandidate,
  message: string,
  probability: number,
  confidence: number,
  severity: "warning" | "error",
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    probability,
    confidence,
    severity,
  };
};
