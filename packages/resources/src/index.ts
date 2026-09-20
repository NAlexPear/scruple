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

export interface ResourceLifecycleRuleOptions {
  threshold?: number;
  minConfidence?: number;
  lifecycleCallPatterns?: RegExp[];
}

export interface RequireBoundedRetriesOptions {
  threshold?: number;
  minConfidence?: number;
  retryCallPatterns?: RegExp[];
}

export type ResourcesPlugin = ScruplePlugin<{
  "no-leaked-resources": RuleFactory<ResourceLifecycleRuleOptions>;
  "require-bounded-retries": RuleFactory<RequireBoundedRetriesOptions>;
  "require-cleanup-on-failure": RuleFactory<ResourceLifecycleRuleOptions>;
}>;

const defaultLifecycleCallPatterns = [
  /(?:^|\.)(?:acquire|beginTransaction|connect|createReadStream|createWriteStream|lock|open|subscribe|watch)$/iu,
  /^(?:using|with)(?:Client|Connection|File|Handle|Lock|Resource|Stream|Transaction)$/iu,
];
const defaultRetryCallPatterns = [/(?:^|\.)(?:backoff|retry|retryAsync|shouldRetry)$/iu];
const retryLanguagePattern = /\b(?:attempts?|retries|retrying)\b|\b(?:for|while)\s*\(/iu;

export const resources = (): ResourcesPlugin => {
  return definePlugin({
    rules: {
      "no-leaked-resources": noLeakedResources,
      "require-bounded-retries": requireBoundedRetries,
      "require-cleanup-on-failure": requireCleanupOnFailure,
    },
  });
};

const noLeakedResources = (options: ResourceLifecycleRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, 0.65, 0.5);
  return functionChoiceRule({
    description: "Resources acquired in a function should not be leaked.",
    select: (document) => lifecycleFunctions(document, options.lifecycleCallPatterns),
    instructions:
      "Does this function have a concrete execution path that finishes while still owning a resource it acquired? Treat files, streams, sockets, connections, subscriptions, watchers, locks, transactions, and disposable handles as resources. Account for `using`/`await using`, `finally`, callbacks or helpers whose visible purpose is scoped management, and explicit ownership transfer by returning the resource or passing it to an owning abstraction. Do not infer ownership or cleanup contracts from an ambiguous helper name.",
    criteria: {
      leaked_resource:
        "A resource is acquired here and a visible return, throw, or fallthrough path leaves it owned without release or transfer.",
      released_or_managed:
        "Every visible owned path releases the resource, or `using`, `finally`, or a clearly scoped helper manages it.",
      ownership_transferred:
        "The function returns the resource or visibly transfers it to an abstraction that assumes cleanup responsibility.",
      insufficient_context:
        "The available function and imports do not establish acquisition, ownership, or the lifecycle contract.",
    },
    finding: "leaked_resource",
    threshold,
    minConfidence,
    message: "This function appears to leave an acquired resource unreleased.",
  });
};

const requireCleanupOnFailure = (options: ResourceLifecycleRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, 0.9, 0.7);
  return functionChoiceRule({
    description: "Resource cleanup should run when work fails.",
    select: (document) => lifecycleFunctions(document, options.lifecycleCallPatterns),
    instructions:
      "Can work after this function acquires a resource fail before that owned resource is released? Flag only a concrete visible error path where cleanup is placed on the success path instead of being guaranteed by `using`/`await using`, `finally`, or a clearly scoped management helper. A returned resource is an ownership transfer, not missing failure cleanup. Do not assume undocumented callees acquire, release, or take ownership.",
    criteria: {
      cleanup_not_failure_safe:
        "The function visibly acquires a resource, performs potentially failing work, and only then cleans up on the success path.",
      failure_safe:
        "Cleanup is guaranteed on visible failure paths by `using`, `finally`, or a clearly scoped management helper.",
      ownership_transferred:
        "The acquired resource is returned or visibly transferred, so this function is not responsible for later cleanup.",
      no_vulnerable_work:
        "No potentially failing operation occurs while this function visibly owns the resource before cleanup.",
      insufficient_context:
        "The available function and imports do not establish ownership or whether cleanup is failure-safe.",
    },
    finding: "cleanup_not_failure_safe",
    threshold,
    minConfidence,
    message: "Ensure this resource is cleaned up when work fails.",
  });
};

const requireBoundedRetries = (options: RequireBoundedRetriesOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, 0.9, 0.7);
  return functionChoiceRule({
    description: "Retry behavior should have an enforced finite bound.",
    select: (document) => retryFunctions(document, options.retryCallPatterns),
    instructions:
      "Does this function retry an operation without an enforced finite attempt, elapsed-time, or deadline bound? A retry library counts as bounded only when the visible call or import establishes a finite bound. Cancellation support alone is not a guaranteed bound. Ordinary loops that do not retry failed work are not retry behavior, and ambiguous helper contracts require abstention.",
    criteria: {
      unbounded_retry:
        "A visible failure path can repeat indefinitely without a finite attempts, elapsed-time, or deadline condition.",
      bounded_retry:
        "The function visibly enforces a finite retry count, elapsed-time limit, deadline, or a finite retry-helper option.",
      not_retry_behavior: "The loop or repeated operation is not retrying failed work.",
      insufficient_context:
        "A helper or external contract may bound retries, but the available function and imports do not establish it.",
    },
    finding: "unbounded_retry",
    threshold,
    minConfidence,
    message: "Add an enforced finite bound to this retry behavior.",
  });
};

interface FunctionChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): FunctionTarget[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  threshold: number;
  minConfidence: number;
  message: string;
}

const functionChoiceRule = (definition: FunctionChoiceRuleDefinition): SemanticRule => {
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map((fn) => ({
        target: fn,
        state: functionState(fn, document),
        question: {
          type: "choice",
          instructions: definition.instructions,
          criteria: definition.criteria,
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

const lifecycleFunctions = (document: ParsedDocument, patterns?: RegExp[]): FunctionTarget[] => {
  const lifecyclePatterns = patterns ?? defaultLifecycleCallPatterns;
  return implementationFunctions(document).filter(
    (fn) =>
      /\b(?:await\s+)?using\s+/u.test(fn.source) ||
      fn.calls.some((call) => matchesAny(call.callee, lifecyclePatterns)),
  );
};

const retryFunctions = (document: ParsedDocument, patterns?: RegExp[]): FunctionTarget[] => {
  const retryPatterns = patterns ?? defaultRetryCallPatterns;
  return implementationFunctions(document).filter(
    (fn) =>
      fn.calls.some((call) => matchesAny(call.callee, retryPatterns)) ||
      (retryLanguagePattern.test(fn.source) &&
        /\b(?:catch|failure|error|failed|reject)/iu.test(fn.source)),
  );
};

const implementationFunctions = (document: ParsedDocument): FunctionTarget[] => {
  return document.functions.filter((fn) => fn.kind === "function" && fn.source.length > 0);
};

const functionState = (fn: FunctionTarget, document: ParsedDocument): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    function: fn.source,
    calls: fn.calls.map((call) => call.callee),
  };
};

const decisionOptions = (
  options: { threshold?: number; minConfidence?: number },
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

const matchesAny = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};
