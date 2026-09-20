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
  /(?:^|\.)(?:findMany|findAll|getMany)$/u,
  /^(?:db|database|knex|sql)$/iu,
  /(?:^|\.)(?:db|database|prisma|knex|sequelize|mongoose|repository|repo|dataSource|entityManager|pool)\./iu,
  /(?:^|\.)[\p{L}_$][\p{L}\p{N}_$]*Repository\.(?:find|findAndCount|findBy|findOne|query|createQueryBuilder)$/u,
];
const databaseImportPatterns = [
  /["'](?:@prisma\/client|better-sqlite3|drizzle-orm|knex|mongoose|mysql2?|pg|sequelize|sqlite3|typeorm)["']/iu,
];
const databaseImportCallPatterns = [
  /(?:^|\.)(?:aggregate|all|execute|find|findBy|findOne|query|select)$/u,
];
const defaultCollectionOperationPatterns = [
  /(?:^|\.)(?:map|filter|find|reduce|forEach|some|every)$/u,
];

export const relationalDatabases = (): RelationalDatabasesPlugin => {
  return definePlugin({ rules: { "prefer-database-join": preferDatabaseJoin } });
};

const preferDatabaseJoin = (options: PreferDatabaseJoinOptions = {}): SemanticRule => {
  const threshold = options.threshold ?? 0.8;
  const minConfidence = options.minConfidence ?? 0.5;
  const databasePatterns = options.databaseCallPatterns ?? defaultDatabaseCallPatterns;
  const collectionPatterns =
    options.collectionOperationPatterns ?? defaultCollectionOperationPatterns;

  return {
    description: "Prefer combining database-backed collections in the database.",
    collect(document) {
      return document.functions.filter(isImplementationFunction).flatMap((fn) => {
        const hasDatabaseImport = matchesAny(document.imports.join("\n"), databaseImportPatterns);
        const databaseCalls = fn.calls.filter(
          (call) =>
            matchesAny(call.callee, databasePatterns) ||
            (options.databaseCallPatterns === undefined &&
              hasDatabaseImport &&
              matchesAny(call.callee, databaseImportCallPatterns)),
        );
        const collectionOperations = fn.calls.filter((call) =>
          matchesAny(call.callee, collectionPatterns),
        );
        if (databaseCalls.length < 2 || collectionOperations.length === 0) {
          return [];
        }

        return [
          {
            target: fn,
            state: functionState(fn, document, databaseCalls, collectionOperations),
            data: {
              databaseCalls: databaseCalls.map((call) => call.callee),
              collectionOperations: collectionOperations.map((call) => call.callee),
            },
            question: {
              type: "choice" as const,
              instructions:
                "Does this function combine results from multiple database queries in application memory when the database layer could reasonably do that work? Consider joins, relation includes, aggregations, subqueries, and filtered queries. First verify from the function and imports that the relevant calls are database queries and that the collection operation actually combines their results.",
              criteria: {
                database_pushdown:
                  "The function fetches multiple database-backed collections and combines or searches across their results in memory even though the work can reasonably be expressed by the available database layer.",
                intentionally_in_memory:
                  "The collection operation does not combine multiple database query results, is a legitimate post-query transformation, operates on non-database data, combines separate database systems, or requires application-only semantics or intentionally bounded data.",
                insufficient_context:
                  "The function and imports do not establish database provenance, whether multiple query results are being combined, or whether the database abstraction supports the equivalent operation.",
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
          "This function appears to combine database query results in memory when that work should be pushed into the database.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  };
};

const functionState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  databaseCalls: FunctionTarget["calls"],
  collectionOperations: FunctionTarget["calls"],
): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    function: fn.source,
    evidence: {
      database_calls: databaseCalls.map((call) => callEvidence(call)),
      collection_operations: collectionOperations.map((call) => callEvidence(call)),
    },
  };
};

const callEvidence = (call: FunctionTarget["calls"][number]): JsonValue => {
  return { callee: call.callee, source: call.source };
};

const isImplementationFunction = (fn: FunctionTarget): boolean => {
  return fn.kind === "function" && fn.source.length > 0;
};

const matchesAny = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};
