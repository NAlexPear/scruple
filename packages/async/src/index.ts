import type {
  ChoiceAnswer,
  DecisionAnswer,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface AsyncRuleOptions {
  threshold?: number;
  minConfidence?: number;
}

export type AsyncPlugin = ScruplePlugin<{
  "no-unbounded-concurrency": RuleFactory<AsyncRuleOptions>;
  "no-serial-independent-work": RuleFactory<AsyncRuleOptions>;
  "require-cancellation-propagation": RuleFactory<AsyncRuleOptions>;
}>;

const promiseFanOutCallees = new Set(["Promise.all", "Promise.allSettled", "Promise.any"]);

export const asyncRules = (): AsyncPlugin => {
  return definePlugin({
    rules: {
      "no-unbounded-concurrency": noUnboundedConcurrency,
      "no-serial-independent-work": noSerialIndependentWork,
      "require-cancellation-propagation": requireCancellationPropagation,
    },
  });
};

const noUnboundedConcurrency = (options: AsyncRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(options, 0.9, 0.7);
  return choiceRule({
    description: "Concurrent work should have a bound when its input size is not bounded.",
    select: (document) =>
      implementationFunctions(document).filter((fn) =>
        fn.calls.some((call) => promiseFanOutCallees.has(call.callee)),
      ),
    question: {
      instructions:
        "Does this function start a potentially unbounded number of asynchronous operations at once through Promise.all, Promise.allSettled, or Promise.any? Use only visible function-local evidence. A collection derived from request, database, file, queue, or caller input is potentially unbounded unless a concrete limit is visible. Do not object to fixed-size tuples, explicit slicing or batching, concurrency limiters, small intentional races/fan-out, or arrays of already-started promises. Abstain when provenance or a bound is not established.",
      criteria: {
        unbounded_concurrency:
          "The function visibly creates one asynchronous operation per element of a collection whose size has no visible bound, then starts them together.",
        bounded_or_intentional:
          "The fan-out has a visible fixed bound, uses batching or a limiter, is a small deliberate set of operations, or only observes promises already created elsewhere.",
        insufficient_context:
          "The function does not establish whether operation creation or collection size is bounded.",
      },
    },
    finding: "unbounded_concurrency",
    threshold,
    minConfidence,
    message: "This function appears to start an unbounded number of concurrent operations.",
  });
};

const noSerialIndependentWork = (options: AsyncRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(options, 0.9, 0.7);
  return choiceRule({
    description: "Independent asynchronous work should not wait in series.",
    select: (document) =>
      implementationFunctions(document).filter(
        (fn) => fn.async && directlyAwaitedCalls(fn).length >= 2,
      ),
    question: {
      instructions:
        "Does this function unnecessarily await independent asynchronous operations in series? Require clear local evidence that at least two directly awaited operations can start together without either result, side effect, error behavior, resource constraint, transaction, lock, rate limit, or required ordering affecting the other. A later call using an earlier result is dependent. Abstain rather than infer behavior hidden behind called APIs.",
      criteria: {
        serial_independent_work:
          "At least two directly awaited operations are visibly independent and can safely start together without changing observable behavior.",
        ordering_required:
          "Data dependency, side effects, error semantics, a transaction, resource control, or an explicit constraint requires or reasonably justifies the sequence.",
        insufficient_context:
          "The function does not establish that concurrent execution would preserve behavior.",
      },
    },
    finding: "serial_independent_work",
    threshold,
    minConfidence,
    message: "These independent asynchronous operations appear to wait in series.",
  });
};

const requireCancellationPropagation = (options: AsyncRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(options, 0.9, 0.7);
  return choiceRule({
    description: "Functions accepting cancellation should propagate it to cancellable work.",
    select: (document) =>
      implementationFunctions(document).filter(
        (fn) => /\bAbortSignal\b/u.test(fn.source) && fn.calls.length > 0,
      ),
    question: {
      instructions:
        "Does this function accept an AbortSignal but fail to pass that cancellation to a downstream operation that visibly supports it? Diagnose only when the local function, imports, or a well-known platform API establish both the signal parameter and the downstream cancellation mechanism. Treat forwarding the signal directly or in an options object as propagation. Do not object when calls have no cancellation API, work is purely synchronous, the signal is used only for legitimate local cancellation handling, or support is unknown.",
      criteria: {
        cancellation_not_propagated:
          "A downstream asynchronous operation visibly accepts cancellation, but the function calls it without forwarding the accepted signal.",
        cancellation_propagated_or_unavailable:
          "Cancellation is forwarded, no invoked operation supports it, or the signal is legitimately consumed only by local work.",
        insufficient_context:
          "The available evidence does not establish the downstream API's cancellation contract.",
      },
    },
    finding: "cancellation_not_propagated",
    threshold,
    minConfidence,
    message: "This function accepts cancellation but does not propagate it to cancellable work.",
  });
};

interface ChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): FunctionTarget[];
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  finding: string;
  threshold: number;
  minConfidence: number;
  message: string;
}

const choiceRule = (definition: ChoiceRuleDefinition): SemanticRule => {
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map((fn) => ({
        target: fn,
        state: functionState(fn, document),
        question: {
          type: "choice",
          instructions: definition.question.instructions,
          criteria: definition.question.criteria,
        },
      }));
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, definition.threshold, definition.minConfidence)) {
        return null;
      }
      return diagnostic(candidate, definition.message, {
        probability: answer.probabilities[definition.finding] ?? 0,
        confidence: answer.confidence,
      });
    },
  };
};

const functionState = (fn: FunctionTarget, document: ParsedDocument): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    function: fn.source,
    calls: fn.calls.map((call) => ({ callee: call.callee, source: call.source })),
    evidence_scope:
      "This function and its imports only; unknown external behavior is not evidence.",
  };
};

const implementationFunctions = (document: ParsedDocument): FunctionTarget[] => {
  return document.functions.filter((fn) => fn.kind === "function" && fn.source.length > 0);
};

const directlyAwaitedCalls = (fn: FunctionTarget) => {
  return fn.calls.filter((call) => {
    const relativeStart = call.range.start - fn.range.start;
    return /\bawait\s*$/u.test(fn.source.slice(0, relativeStart));
  });
};

const probabilityOptions = (
  options: AsyncRuleOptions,
  defaultThreshold: number,
  defaultMinConfidence: number,
): { threshold: number; minConfidence: number } => {
  return {
    threshold: options.threshold ?? defaultThreshold,
    minConfidence: options.minConfidence ?? defaultMinConfidence,
  };
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
  message: string,
  scores: { probability: number; confidence: number },
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    ...scores,
  };
};
