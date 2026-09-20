import type {
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface PreferDatabaseJoinOptions {
  threshold?: number;
  minConfidence?: number;
  databaseCallPatterns?: RegExp[];
  collectionOperationPatterns?: RegExp[];
}

export type RelationalDatabasesPlugin = ScruplePlugin<{
  "prefer-database-join": RuleFactory<PreferDatabaseJoinOptions>;
}>;

const defaultDatabaseCallPatterns = [
  /(?:^|\.)(?:findMany|findAll|select|query|aggregate|execute|getMany|all)$/iu,
  /(?:^|\.)(?:db|database|prisma|knex|sequelize|mongoose|repository|repo)\./iu,
];
const defaultCollectionOperationPatterns = [
  /(?:^|\.)(?:map|filter|find|reduce|forEach|some|every)$/u,
];

export function relationalDatabases(): RelationalDatabasesPlugin {
  return definePlugin({ rules: { "prefer-database-join": preferDatabaseJoin } });
}

function preferDatabaseJoin(options: PreferDatabaseJoinOptions = {}): SemanticRule {
  const threshold = options.threshold ?? 0.8;
  const minConfidence = options.minConfidence ?? 0.5;
  const databasePatterns = options.databaseCallPatterns ?? defaultDatabaseCallPatterns;
  const collectionPatterns =
    options.collectionOperationPatterns ?? defaultCollectionOperationPatterns;

  return {
    description: "Prefer combining database-backed collections in the database.",
    collect(document) {
      return document.functions.filter(isImplementationFunction).flatMap((fn) => {
        const databaseCalls = fn.calls.filter((call) => matchesAny(call.callee, databasePatterns));
        const collectionOperations = fn.calls.filter((call) =>
          matchesAny(call.callee, collectionPatterns),
        );
        if (databaseCalls.length < 2 || collectionOperations.length === 0) {
          return [];
        }

        return [
          {
            target: fn,
            state: functionState(fn, document),
            data: {
              databaseCalls: databaseCalls.map((call) => call.callee),
              collectionOperations: collectionOperations.map((call) => call.callee),
            },
            question: {
              type: "choice" as const,
              instructions:
                "How should the database-backed collections in this function be combined? Consider whether a database join, relation include, aggregation, subquery, or filtered query can reasonably replace the in-memory combination without changing behavior.",
              criteria: {
                database_pushdown:
                  "The function fetches database-backed collections and combines or searches them in memory even though the work can reasonably be expressed by the available database layer.",
                intentionally_in_memory:
                  "The data is appropriately bounded, is not all database-backed, requires application-only semantics, or has another visible reason to be combined in memory.",
                insufficient_context:
                  "The function and imports do not establish data provenance or whether the database abstraction supports the equivalent operation.",
              },
            },
          },
        ];
      });
    },
    diagnose(answer, candidate) {
      if (answer.type !== "choice") {
        return null;
      }
      const probability = answer.probabilities["database_pushdown"] ?? 0;
      if (
        answer.choice !== "database_pushdown" ||
        probability < threshold ||
        answer.confidence < minConfidence
      ) {
        return null;
      }
      return {
        message:
          "This function appears to perform an in-memory join that should be pushed into the database.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  };
}

function functionState(fn: FunctionTarget, document: ParsedDocument): JsonValue {
  return {
    language: document.language,
    imports: document.imports,
    function: fn.source,
    calls: fn.calls.map((call) => call.callee),
  };
}

function isImplementationFunction(fn: FunctionTarget): boolean {
  return fn.kind === "function" && fn.source.length > 0;
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}
