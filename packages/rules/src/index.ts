import type {
  ChoiceAnswer,
  CommentTarget,
  DecisionAnswer,
  DiagnosticSeverity,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  SemanticRule,
} from "@scruple/core";

export interface RuleOptions {
  severity?: DiagnosticSeverity;
}

export interface ProbabilityRuleOptions extends RuleOptions {
  threshold?: number;
}

export interface ChoiceRuleOptions extends ProbabilityRuleOptions {
  minConfidence?: number;
}

export function unhelpfulCommentRule(options: ProbabilityRuleOptions = {}): SemanticRule {
  const threshold = options.threshold ?? 0.95;
  const severity = options.severity ?? "warning";

  return {
    id: "unhelpful-comment",
    description: "Comments should add useful information rather than restating obvious code.",

    collect(document) {
      return document.comments.filter(isCommentCandidate).map((comment) => ({
        target: comment,
        state: commentState(comment, document),
        question: {
          type: "noul",
          instructions:
            "Is `comment` clearly unhelpful because it merely restates obvious code, uses generic section-heading prose, narrates a straightforward next step, or contains AI-assistant meta commentary? Judge only maintainability value, not writing style.",
          criteria: {
            true: "The comment adds no useful rationale, constraint, warning, domain knowledge, or non-obvious explanation.",
            false:
              "The comment explains why, documents a constraint or edge case, warns about a hazard, provides domain context, or otherwise helps a maintainer.",
          },
        },
      }));
    },

    diagnose(answer, candidate) {
      if (answer.type !== "noul" || answer.noul < threshold) {
        return null;
      }
      return {
        severity,
        message: "This comment appears to add no useful information.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability: answer.noul,
      };
    },
  };
}

export function vacuousTestRule(options: ChoiceRuleOptions = {}): SemanticRule {
  const threshold = options.threshold ?? 0.85;
  const minConfidence = options.minConfidence ?? 0.5;
  const severity = options.severity ?? "error";

  return choiceRule({
    id: "vacuous-test",
    description: "Tests should verify meaningful behavior.",
    message: "This test appears not to verify meaningful behavior.",
    choice: "vacuous",
    threshold,
    minConfidence,
    severity,
    collect(document) {
      return document.functions
        .filter((fn) => fn.kind === "test")
        .map((fn) => ({
          target: fn,
          state: functionState(fn, document),
          question: {
            type: "choice",
            instructions:
              "Does this test meaningfully verify behavior? Account for indirect assertions through helpers, expected throws or rejections, snapshots, mock verification, and framework-specific assertion APIs.",
            criteria: {
              meaningful_verification:
                "The test can fail when the behavior under test is wrong and checks a meaningful outcome or invariant.",
              vacuous:
                "The test has no effective verification, asserts a tautology, only executes setup, or would pass regardless of the behavior it claims to test.",
              insufficient_context:
                "The available function and imports do not establish whether helper calls perform meaningful verification.",
            },
          },
        }));
    },
  });
}

export interface DatabaseJoinRuleOptions extends ChoiceRuleOptions {
  databaseCallPatterns?: RegExp[];
  collectionOperationPatterns?: RegExp[];
}

const defaultDatabaseCallPatterns = [
  /(?:^|\.)(?:findMany|findAll|select|query|aggregate|execute|getMany|all)$/iu,
  /(?:^|\.)(?:db|database|prisma|knex|sequelize|mongoose|repository|repo)\./iu,
];
const defaultCollectionOperationPatterns = [
  /(?:^|\.)(?:map|filter|find|reduce|forEach|some|every)$/u,
];

export function preferDatabaseJoinRule(options: DatabaseJoinRuleOptions = {}): SemanticRule {
  const threshold = options.threshold ?? 0.8;
  const minConfidence = options.minConfidence ?? 0.5;
  const severity = options.severity ?? "warning";
  const databasePatterns = options.databaseCallPatterns ?? defaultDatabaseCallPatterns;
  const collectionPatterns =
    options.collectionOperationPatterns ?? defaultCollectionOperationPatterns;

  return choiceRule({
    id: "prefer-database-join",
    description: "Database-backed collections should be combined in the database when practical.",
    message:
      "This function appears to perform an in-memory join that should be pushed into the database.",
    choice: "database_pushdown",
    threshold,
    minConfidence,
    severity,
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
  });
}

interface ChoiceRuleDefinition {
  id: string;
  description: string;
  message: string;
  choice: string;
  threshold: number;
  minConfidence: number;
  severity: DiagnosticSeverity;
  collect(document: ParsedDocument): RuleCandidate[];
}

function choiceRule(definition: ChoiceRuleDefinition): SemanticRule {
  return {
    id: definition.id,
    description: definition.description,
    collect: (document) => definition.collect(document),
    diagnose(answer: DecisionAnswer, candidate: RuleCandidate) {
      if (answer.type !== "choice") {
        return null;
      }
      const probability = answer.probabilities[definition.choice] ?? 0;
      if (
        answer.choice !== definition.choice ||
        probability < definition.threshold ||
        answer.confidence < definition.minConfidence
      ) {
        return null;
      }
      return choiceDiagnostic(answer, candidate, definition, probability);
    },
  };
}

function choiceDiagnostic(
  answer: ChoiceAnswer,
  candidate: RuleCandidate,
  definition: ChoiceRuleDefinition,
  probability: number,
) {
  return {
    severity: definition.severity,
    message: definition.message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    probability,
    confidence: answer.confidence,
  };
}

function commentState(comment: CommentTarget, document: ParsedDocument): JsonValue {
  return {
    language: document.language,
    comment: comment.source,
    enclosing_code:
      comment.enclosingSource ??
      nearbySource(document.source, comment.range.start, comment.range.end),
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

function isCommentCandidate(comment: CommentTarget): boolean {
  const value = comment.value.trim();
  if (value.length < 8) {
    return false;
  }
  return !/^(?:eslint|oxlint|prettier|istanbul|c8|tslint|@ts-|TODO\b|FIXME\b|HACK\b|NOTE\b)/iu.test(
    value,
  );
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

function nearbySource(source: string, start: number, end: number): string {
  const radius = 500;
  return source.slice(Math.max(0, start - radius), Math.min(source.length, end + radius));
}
