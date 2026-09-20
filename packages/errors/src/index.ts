import type {
  ChoiceAnswer,
  DecisionAnswer,
  DecisionRuleOptions,
  ErrorHandlerTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export type NoSwallowedErrorsOptions = DecisionRuleOptions;

export type NoLossyErrorWrappingOptions = NoSwallowedErrorsOptions;

export type NoMessageBasedErrorDispatchOptions = NoSwallowedErrorsOptions;

export type ErrorsPlugin = ScruplePlugin<{
  "no-swallowed-errors": RuleFactory<NoSwallowedErrorsOptions>;
  "no-lossy-error-wrapping": RuleFactory<NoLossyErrorWrappingOptions>;
  "no-message-based-error-dispatch": RuleFactory<NoMessageBasedErrorDispatchOptions>;
  "no-useless-catch-boundaries": RuleFactory<NoSwallowedErrorsOptions>;
}>;

const maximumHandlerCharacters = 6_000;
const maximumContextCharacters = 8_000;
const maximumFlowEntries = 40;
const maximumImports = 40;

export const errors = (): ErrorsPlugin => {
  return definePlugin({
    rules: {
      "no-swallowed-errors": noSwallowedErrors,
      "no-lossy-error-wrapping": noLossyErrorWrapping,
      "no-message-based-error-dispatch": noMessageBasedErrorDispatch,
      "no-useless-catch-boundaries": noUselessCatchBoundaries,
    },
  });
};

const noUselessCatchBoundaries = (options: NoSwallowedErrorsOptions = {}): SemanticRule => {
  return errorHandlerChoiceRule({
    description: "Catch boundaries should add meaningful error handling.",
    options,
    defaultThreshold: 0.9,
    select: (handlers) => handlers.filter((handler) => isDirectRethrowOnly(handler)),
    instructions:
      "Does this catch handler only rethrow the same caught error without cleanup, reporting, context, translation, recovery, or another observable purpose? A finally-equivalent cleanup action, contextual mutation, structured wrapping, boundary translation, or meaningful reporting makes the boundary useful. Choose insufficient_context when a helper's effect or conditional path is unresolved.",
    criteria: {
      useless_rethrow_boundary:
        "The handler only rethrows the same error and adds no meaningful behavior or boundary contract.",
      cleanup_or_context_added:
        "The handler performs cleanup, reporting, or adds useful context before preserving failure.",
      error_translated:
        "The handler deliberately translates or structurally wraps the error for this boundary.",
      insufficient_context:
        "Opaque helper effects or unresolved control flow prevent deciding whether the boundary adds behavior.",
    },
    finding: "useless_rethrow_boundary",
    message: "Remove this catch boundary because it only rethrows the same error.",
  });
};

const isDirectRethrowOnly = (handler: ErrorHandlerTarget): boolean => {
  const binding = handler.binding;
  if (
    binding === undefined ||
    !identifierPattern.test(binding) ||
    handler.calls.length > 0 ||
    handler.exits.length !== 1
  ) {
    return false;
  }
  const exit = handler.exits[0]!;
  if (exit.kind !== "throw" || !directRethrowPattern(binding).test(withoutComments(exit.source))) {
    return false;
  }
  const relativeStart = exit.range.start - handler.range.start;
  const relativeEnd = exit.range.end - handler.range.start;
  const bodyWithoutExit = `${handler.source.slice(0, relativeStart)}${handler.source.slice(relativeEnd)}`;
  const structuralRemainder = withoutComments(bodyWithoutExit)
    .replace(/^catch\s*(?:\([^)]*\))?\s*\{/u, "")
    .replace(/\}\s*$/u, "")
    .trim();
  return structuralRemainder.length === 0;
};

const withoutComments = (source: string): string => {
  return source.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/gu, "").trim();
};

const noSwallowedErrors = (options: NoSwallowedErrorsOptions = {}): SemanticRule => {
  return errorHandlerChoiceRule({
    description: "Caught errors should be propagated or handled intentionally.",
    options,
    defaultThreshold: 0.9,
    select: (handlers) => handlers,
    instructions:
      "Classify this catch handler using only the supplied source evidence. An error is swallowed when an unexpected failure is suppressed without preserving failure, returning a distinguishable failure, or establishing a visibly intentional recovery contract. Logging, telemetry, or cleanup alone does not handle an error when execution then returns success-like/default behavior or continues as though the operation succeeded. Reporting counts as handling only when the visible code also exposes a distinguishable failure outcome; an expected fallback counts only when its recovery contract is visible. If a helper might report, propagate, or recover but that behavior is not visible, choose insufficient_context rather than guessing from its name. Judge every visible path conservatively because the supplied exits are syntactic, not a path-complete control-flow graph.",
    criteria: {
      propagated:
        "Every visible path preserves failure by rethrowing, throwing a replacement, or returning/rejecting a distinguishable failure result.",
      intentional_recovery:
        "The visible code establishes an expected-exception or deliberate recovery contract whose success/default outcome is intentional.",
      reported_failure:
        "The handler observably reports the failure and visibly exposes a distinguishable failed outcome rather than false success.",
      swallowed:
        "At least one visible path suppresses an unexpected error and continues or returns success/default behavior without an established recovery contract; logging, telemetry, or cleanup alone does not make that path handled.",
      insufficient_context:
        "Whether the error is propagated, reported as failure, or intentionally recovered depends on helper behavior or a contract absent from the bounded evidence.",
    },
    finding: "swallowed",
    message: "This catch handler appears to swallow an error without handling it.",
  });
};

const noLossyErrorWrapping = (options: NoLossyErrorWrappingOptions = {}): SemanticRule => {
  return errorHandlerChoiceRule({
    description:
      "Replacement errors should preserve the original failure as structured cause data.",
    options,
    defaultThreshold: 0.9,
    select: (handlers) => handlers.filter((handler) => hasReplacementThrow(handler)),
    instructions:
      "Classify the replacement throw in this catch handler using only the supplied source evidence. Wrapping is lossy when an escaping replacement error discards the caught failure as structured cause data, even if its message interpolates or copies the original message. Direct rethrows and built-in Error or AggregateError construction with a visible cause preserve the failure. A custom error constructed with an explicit cause property may be treated as preserving it. If preservation depends on an opaque wrapper function, custom constructor internals, or a path relationship not established by the evidence, choose insufficient_context. Intentional public sanitization is not established merely by omitting the cause; it requires a visible boundary contract and a visible internal reporting or correlation path.",
    criteria: {
      preserved:
        "Every escaping throw either rethrows the caught value or visibly retains it as structured cause data.",
      intentional_boundary_translation:
        "The visible code establishes a deliberate sanitizing boundary and retains the original failure through a separate internal reporting or correlation path.",
      lossy_wrapping:
        "An escaping replacement error visibly discards the caught failure as structured cause data.",
      insufficient_context:
        "Cause preservation or boundary intent depends on opaque wrapper behavior, custom constructor internals, or control flow not established by the bounded evidence.",
    },
    finding: "lossy_wrapping",
    message: "This replacement error appears to discard the original failure cause.",
  });
};

const noMessageBasedErrorDispatch = (
  options: NoMessageBasedErrorDispatchOptions = {},
): SemanticRule => {
  return errorHandlerChoiceRule({
    description: "Error handling should use stable discriminators instead of message text.",
    options,
    defaultThreshold: 0.85,
    select: (handlers, document) =>
      handlers.filter((handler) => hasMessageDispatchEvidence(handler, document)),
    instructions:
      "Classify whether this catch handler uses human-readable error message text to choose program behavior. Equality, substring, prefix, suffix, regular-expression, or switch matching on a message is fragile dispatch. Stable alternatives include a documented error code, class/instanceof check, typed discriminant, or documented standardized name. Logging, telemetry, display, serialization, and tests of presentation text are not message-based dispatch merely because they read the message. If the message is passed to an opaque classifier or the external API may expose no stable discriminator, choose insufficient_context rather than inferring its contract.",
    criteria: {
      stable_or_non_dispatch_use:
        "The handler uses a stable discriminator, or reads the message only for reporting, display, serialization, or other non-dispatch behavior.",
      message_based_dispatch:
        "The handler visibly compares, searches, parses, or switches on human-readable error message text to choose behavior.",
      unavoidable_external_contract:
        "Visible source establishes that an external interface exposes only message text and the handler narrowly contains that compatibility requirement.",
      insufficient_context:
        "Whether message text controls behavior or whether a stable discriminator exists depends on evidence outside the bounded source.",
    },
    finding: "message_based_dispatch",
    message: "This handler appears to dispatch on unstable error message text.",
  });
};

interface ErrorHandlerChoiceRuleDefinition {
  description: string;
  options: NoSwallowedErrorsOptions;
  defaultThreshold: number;
  select(handlers: ErrorHandlerTarget[], document: ParsedDocument): ErrorHandlerTarget[];
  instructions: string;
  criteria: Record<string, JsonValue>;
  finding: string;
  message: string;
}

const errorHandlerChoiceRule = (definition: ErrorHandlerChoiceRuleDefinition): SemanticRule => {
  const { threshold, minConfidence } = resolveDecisionOptions(definition.options, {
    threshold: definition.defaultThreshold,
    minConfidence: 0.7,
  });
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document.errorHandlers, document).map((handler) => ({
        target: handler,
        state: errorHandlerState(handler, document.source, document.imports),
        question: {
          type: "choice",
          instructions: definition.instructions,
          criteria: definition.criteria,
        },
      }));
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, threshold, minConfidence)) {
        return null;
      }
      return diagnostic(candidate, answer, definition.finding, definition.message);
    },
  };
};

const identifierPattern = /^[A-Za-z_$][\w$]*$/u;

const hasReplacementThrow = (handler: ErrorHandlerTarget): boolean => {
  const binding = handler.binding;
  return handler.exits.some((exit) => {
    if (exit.kind !== "throw") {
      return false;
    }
    if (binding === undefined || !identifierPattern.test(binding)) {
      return true;
    }
    return !directRethrowPattern(binding).test(exit.source.trim());
  });
};

const directRethrowPattern = (binding: string): RegExp => {
  return new RegExp(`^throw\\s+${escapeRegularExpression(binding)}\\s*;?$`, "u");
};

const hasMessageDispatchEvidence = (
  handler: ErrorHandlerTarget,
  document: ParsedDocument,
): boolean => {
  const binding = handler.binding;
  if (binding === undefined || !identifierPattern.test(binding)) {
    return false;
  }
  if (document.facts !== undefined) {
    const path = `${binding}.message`;
    return document.facts.members.some(
      (member) =>
        member.path === path &&
        member.range.start >= handler.range.start &&
        member.range.end <= handler.range.end,
    );
  }
  const messageAccess = new RegExp(
    `\\b${escapeRegularExpression(binding)}\\s*(?:\\?\\.|\\.)\\s*message\\b`,
    "u",
  );
  return messageAccess.test(handler.source);
};

const escapeRegularExpression = (value: string): string => {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
  const surroundingContext =
    handler.enclosingSource === undefined
      ? {
          surrounding_code: documentSource.slice(surroundingStart, surroundingEnd),
          surrounding_code_truncated:
            surroundingStart > 0 || surroundingEnd < documentSource.length,
        }
      : {};
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
      ...surroundingContext,
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

const diagnostic = (
  candidate: RuleCandidate,
  answer: ChoiceAnswer,
  finding: string,
  message: string,
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    probability: answer.probabilities[finding] ?? 0,
    confidence: answer.confidence,
  };
};
