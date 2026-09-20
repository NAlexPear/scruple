import type {
  ChoiceAnswer,
  DecisionAnswer,
  ErrorHandlerTarget,
  JsonValue,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface NoSwallowedErrorsOptions {
  threshold?: number;
  minConfidence?: number;
}

export type ErrorsPlugin = ScruplePlugin<{
  "no-swallowed-errors": RuleFactory<NoSwallowedErrorsOptions>;
}>;

const maximumHandlerCharacters = 6_000;
const maximumContextCharacters = 8_000;
const maximumFlowEntries = 40;
const maximumImports = 40;

export const errors = (): ErrorsPlugin => {
  return definePlugin({ rules: { "no-swallowed-errors": noSwallowedErrors } });
};

const noSwallowedErrors = (options: NoSwallowedErrorsOptions = {}): SemanticRule => {
  const threshold = probabilityOption("threshold", options.threshold, 0.9);
  const minConfidence = probabilityOption("minConfidence", options.minConfidence, 0.7);

  return {
    description: "Caught errors should be propagated or handled intentionally.",
    collect(document) {
      return document.errorHandlers.map((handler) => ({
        target: handler,
        state: errorHandlerState(handler, document.source, document.imports),
        question: {
          type: "choice",
          instructions:
            "Classify this catch handler using only the supplied source evidence. An error is swallowed when execution suppresses an unexpected failure without propagation, observable reporting, or a visibly intentional recovery contract. Treat logging, telemetry, user-visible reporting, cleanup followed by propagation, and clearly documented expected-exception fallback as handling. A generic fallback is not automatically intentional. If a helper might report, propagate, or implement a documented fallback but that behavior is not visible, choose insufficient_context rather than guessing from its name.",
          criteria: {
            propagated:
              "Every visible path preserves failure by rethrowing the caught error, throwing a replacement, or returning/rejecting a failure result.",
            intentionally_handled:
              "The handler observably reports the failure or the visible code establishes a deliberate recovery, expected-exception, or fallback contract.",
            swallowed:
              "At least one visible path silently suppresses an unexpected error and continues or returns success/default behavior without an established recovery contract.",
            insufficient_context:
              "Whether the error is propagated or intentionally handled depends on behavior or a contract not present in the bounded evidence.",
          },
        },
      }));
    },
    diagnose(answer, candidate) {
      if (!isSwallowed(answer, threshold, minConfidence)) {
        return null;
      }
      return diagnostic(candidate, answer);
    },
  };
};

const errorHandlerState = (
  handler: ErrorHandlerTarget,
  documentSource: string,
  imports: string[],
): JsonValue => {
  const surroundingStart = Math.max(0, handler.range.start - maximumContextCharacters / 2);
  const surroundingEnd = Math.min(
    documentSource.length,
    handler.range.end + maximumContextCharacters / 2,
  );
  return {
    language: handler.language,
    imports: imports.slice(0, maximumImports).map((entry) => bounded(entry, 500)),
    imports_truncated: imports.length > maximumImports,
    error_handler: {
      binding: handler.binding ?? null,
      source: bounded(handler.source, maximumHandlerCharacters),
      source_truncated: handler.source.length > maximumHandlerCharacters,
    },
    context: {
      try_statement: bounded(handler.trySource, maximumContextCharacters),
      enclosing_function:
        handler.enclosingSource === undefined
          ? null
          : bounded(handler.enclosingSource, maximumContextCharacters),
      surrounding_code: documentSource.slice(surroundingStart, surroundingEnd),
      surrounding_code_truncated: surroundingStart > 0 || surroundingEnd < documentSource.length,
    },
    control_flow: {
      calls: handler.calls.slice(0, maximumFlowEntries).map((call) => call.callee),
      exits: handler.exits.slice(0, maximumFlowEntries).map((exit) => ({
        kind: exit.kind,
        source: bounded(exit.source, 500),
      })),
      entries_truncated:
        handler.calls.length > maximumFlowEntries || handler.exits.length > maximumFlowEntries,
    },
  };
};

const bounded = (value: string, maximumCharacters: number): string => {
  if (value.length <= maximumCharacters) {
    return value;
  }
  const half = Math.floor(maximumCharacters / 2);
  return `${value.slice(0, half)}\n/* … bounded evidence omitted … */\n${value.slice(-half)}`;
};

const probabilityOption = (name: string, value: number | undefined, fallback: number): number => {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new RangeError(`${name} must be a finite number between 0 and 1`);
  }
  return resolved;
};

const isSwallowed = (
  answer: DecisionAnswer,
  threshold: number,
  minConfidence: number,
): answer is ChoiceAnswer => {
  return (
    answer.type === "choice" &&
    answer.choice === "swallowed" &&
    (answer.probabilities["swallowed"] ?? 0) >= threshold &&
    answer.confidence >= minConfidence
  );
};

const diagnostic = (candidate: RuleCandidate, answer: ChoiceAnswer) => {
  return {
    message: "This catch handler appears to swallow an error without handling it.",
    filename: candidate.target.filename,
    location: candidate.target.location,
    probability: answer.probabilities["swallowed"] ?? 0,
    confidence: answer.confidence,
  };
};
