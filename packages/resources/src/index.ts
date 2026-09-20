import type {
  DecisionRuleOptions,
  DecisionThreshold,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions, resolveDiagnosticSeverity } from "@scruple/core";

export interface ResourceLifecycleRuleOptions extends DecisionRuleOptions {
  lifecycleCallPatterns?: RegExp[];
}

export interface RequireBoundedRetriesOptions extends DecisionRuleOptions {
  retryCallPatterns?: RegExp[];
}

export type ResourcesPlugin = ScruplePlugin<{
  "no-leaked-resources": RuleFactory<ResourceLifecycleRuleOptions>;
  "require-bounded-retries": RuleFactory<RequireBoundedRetriesOptions>;
  "require-cleanup-on-failure": RuleFactory<ResourceLifecycleRuleOptions>;
  "require-complete-resource-cleanup": RuleFactory<ResourceLifecycleRuleOptions>;
  "require-retry-backoff-with-jitter": RuleFactory<RequireBoundedRetriesOptions>;
  "require-retry-time-budget": RuleFactory<RequireBoundedRetriesOptions>;
}>;

const defaultAcquisitionCallPatterns = [
  /(?:^|\.)(?:acquire|beginTransaction|connect|createReadStream|createWriteStream|lock|open|subscribe|watch)$/iu,
];
const defaultScopedLifecycleCallPatterns = [
  /(?:^|\.)(?:using|with)(?:Client|Connection|File|Handle|Lock|Resource|Stream|Transaction)$/iu,
];
const defaultLifecycleCallPatterns = [
  ...defaultAcquisitionCallPatterns,
  ...defaultScopedLifecycleCallPatterns,
];
const defaultRetryCallPatterns = [/(?:^|\.)(?:backoff|retry|retryAsync|shouldRetry)$/iu];
const defaultResourceConstructorPatterns = [
  /(?:^|\.)(?:BroadcastChannel|EventSource|FileHandle|MessageChannel|WebSocket|Worker)$/u,
];
const maxEvidenceItems = 20;
const maxFunctionCharacters = 12_000;

export const resources = (): ResourcesPlugin => {
  return definePlugin({
    rules: {
      "no-leaked-resources": noLeakedResources,
      "require-bounded-retries": requireBoundedRetries,
      "require-cleanup-on-failure": requireCleanupOnFailure,
      "require-complete-resource-cleanup": requireCompleteResourceCleanup,
      "require-retry-backoff-with-jitter": requireRetryBackoffWithJitter,
      "require-retry-time-budget": requireRetryTimeBudget,
    },
  });
};

const noLeakedResources = (options: ResourceLifecycleRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, { warning: 0.65, error: 0.9 }, 0.5);
  const lifecyclePatterns = lifecyclePatternsFor(options);
  return functionChoiceRule({
    description: "Resources acquired in a function should not be leaked.",
    select: (document) => lifecycleFunctions(document, lifecyclePatterns),
    instructions:
      "Does a concrete visible execution path finish while this function still owns a resource it explicitly acquired? Treat files, streams, sockets, connections, subscriptions, watchers, locks, transactions, and disposable handles as resources. Account for `using`/`await using`, disposal stacks, `finally`, clearly scoped management callbacks, and explicit ownership transfer by returning the owned resource or passing it to a visibly owning abstraction. Do not infer acquisition, ownership, transfer, or cleanup from an ambiguous name or undocumented helper contract.",
    criteria: {
      leaked_resource:
        "A resource is acquired here and a visible return, throw, or fallthrough path leaves it owned without release or transfer.",
      released_or_managed:
        "Every visible owned path releases the resource, or `using`, a disposal stack, `finally`, or a clearly scoped helper manages it.",
      ownership_transferred:
        "The function returns the owned resource or visibly transfers it to an abstraction whose cleanup responsibility is established here.",
      not_locally_owned:
        "The value is borrowed, shared, process-lived, or managed by a framework, so this function does not own its cleanup.",
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
  const { threshold, minConfidence } = decisionOptions(options, { warning: 0.9, error: 0.97 }, 0.7);
  const lifecyclePatterns = lifecyclePatternsFor(options);
  return functionChoiceRule({
    description: "Resource cleanup should run when work fails.",
    select: (document) => lifecycleFunctions(document, lifecyclePatterns),
    instructions:
      "This rule is about a visible cleanup plan that an abrupt path can bypass, rather than the absence of cleanup in general. Can work or a later acquisition fail after this function acquires an owned resource but before its intended cleanup is guaranteed? Also consider whether one cleanup throwing prevents another owned resource from being cleaned up. Accept `using`/`await using`, disposal stacks, correctly nested `finally`, and clearly scoped management helpers. A returned resource is ownership transfer. Abstain when ownership, failure behavior, or a helper contract is opaque.",
    criteria: {
      cleanup_not_failure_safe:
        "The function has intended cleanup, but a visible failure, later acquisition, early exit, or earlier throwing cleanup can bypass it.",
      failure_safe:
        "Cleanup is guaranteed on visible failure paths by `using`, a disposal stack, correctly nested `finally`, or a clearly scoped management helper.",
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
  const { threshold, minConfidence } = decisionOptions(options, { warning: 0.9, error: 0.97 }, 0.7);
  const retryPatterns = retryPatternsFor(options);
  return functionChoiceRule({
    description: "Retry behavior should have an enforced finite bound.",
    select: (document) => retryFunctions(document, retryPatterns),
    instructions:
      "Can this function initiate retries indefinitely without an enforced finite attempt, elapsed-time, or deadline bound? This rule bounds retry scheduling; it does not prove that an individual attempt terminates. A retry library counts as bounded only when the visible call or established import contract supplies a finite bound. Cancellation support alone is not guaranteed to fire. Ordinary loops are not retry behavior, and ambiguous helper defaults require abstention.",
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

const requireCompleteResourceCleanup = (
  options: ResourceLifecycleRuleOptions = {},
): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, { warning: 0.9, error: 0.97 }, 0.7);
  const lifecyclePatterns = acquisitionPatternsFor(options);
  return functionChoiceRule({
    description:
      "All owned resources should still be cleaned up when acquisition or cleanup fails.",
    select: (document) => multiResourceFunctions(document, lifecyclePatterns),
    instructions:
      "Does this function explicitly acquire at least two owned resources but have a concrete path where a later acquisition failure or one cleanup failure prevents cleanup of an earlier or remaining resource? Accept `using`/`await using`, DisposableStack or AsyncDisposableStack, correctly nested `finally` blocks, and visible cleanup aggregation that attempts every release while preserving failures. Do not require a particular order for independent resources, and abstain when ownership, cleanup failure behavior, or a helper contract is opaque.",
    criteria: {
      incomplete_cleanup:
        "A visible later-acquisition or cleanup-failure path can leave another explicitly acquired resource uncleaned.",
      complete_cleanup:
        "The visible structure attempts cleanup of every owned resource even when acquisition, work, or another cleanup fails.",
      managed_cleanup:
        "A language construct, disposal stack, or clearly established helper manages complete cleanup.",
      ownership_transferred:
        "Cleanup responsibility for one or more acquired resources is visibly transferred.",
      insufficient_context:
        "The available function and imports do not establish ownership or whether every cleanup is attempted.",
    },
    finding: "incomplete_cleanup",
    threshold,
    minConfidence,
    message: "Ensure every acquired resource is cleaned up even when acquisition or cleanup fails.",
  });
};

const requireRetryBackoffWithJitter = (
  options: RequireBoundedRetriesOptions = {},
): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, { warning: 0.9, error: 0.97 }, 0.7);
  const retryPatterns = retryPatternsFor(options);
  return functionChoiceRule({
    description: "Retries should use backoff with jitter to avoid synchronized retry pressure.",
    select: (document) => retryFunctions(document, retryPatterns),
    instructions:
      "Does this function perform multiple retries immediately, at a fixed interval, or with increasing delays but no jitter? Flag only visible retry timing that lacks both progressive backoff and randomization. Accept a clearly configured or documented retry helper that supplies capped exponential backoff with jitter, and accept server-directed randomized scheduling. One retry, non-retry loops, local polling with an established non-contentious contract, and opaque helper defaults should not be reported without stronger evidence.",
    criteria: {
      unsafe_retry_timing:
        "Multiple visible retries are immediate, fixed-delay, or use backoff without jitter.",
      backoff_with_jitter:
        "The retry schedule visibly combines progressive or capped backoff with randomization.",
      framework_managed:
        "An established helper or framework contract provides backoff with jitter.",
      not_applicable:
        "The function does not perform multiple retries for failure recovery, or its local polling contract does not create synchronized retry pressure.",
      insufficient_context:
        "The retry timing or helper defaults are not established by the available function and imports.",
    },
    finding: "unsafe_retry_timing",
    threshold,
    minConfidence,
    message: "Use progressive backoff with jitter between retry attempts.",
  });
};

const requireRetryTimeBudget = (options: RequireBoundedRetriesOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options, { warning: 0.9, error: 0.97 }, 0.7);
  const retryPatterns = retryPatternsFor(options);
  return functionChoiceRule({
    description: "Retried operations should have a total elapsed-time budget.",
    select: (document) => retryFunctions(document, retryPatterns),
    instructions:
      "Does this retry behavior lack an enforced total elapsed-time budget that spans every attempt and delay? A finite attempt count alone is not a total time budget because an attempt may hang. Per-attempt timeouts are insufficient unless their combination with attempts and delays visibly enforces a finite total. Accept a parent deadline, total-timeout option, or deadline-backed signal that is propagated through all attempts. An external AbortSignal without an established deadline and an opaque helper default require abstention rather than an assumption.",
    criteria: {
      missing_retry_time_budget:
        "Retries are visible, but no total deadline or elapsed-time budget spans all attempts and delays.",
      total_time_budget:
        "A visible total deadline, elapsed-time limit, or total-timeout option spans the retry operation.",
      inherited_time_budget:
        "A caller-provided deadline-backed context or signal visibly governs every attempt.",
      not_retry_behavior: "The function does not retry failed work.",
      insufficient_context:
        "An external signal, helper, or operation may impose a budget, but that contract is not established here.",
    },
    finding: "missing_retry_time_budget",
    threshold,
    minConfidence,
    message: "Add a total elapsed-time budget that spans all retry attempts.",
  });
};

interface FunctionChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): FunctionTarget[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  threshold: DecisionThreshold;
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
      if (answer.type !== "choice" || answer.choice !== definition.finding) {
        return null;
      }
      const probability = answer.probabilities[definition.finding] ?? 0;
      const severity = resolveDiagnosticSeverity(probability, answer.confidence, definition);
      if (severity === null) {
        return null;
      }
      return diagnostic(candidate, definition.message, {
        probability,
        confidence: answer.confidence,
        severity,
      });
    },
  };
};

const lifecycleFunctions = (
  document: ParsedDocument,
  lifecyclePatterns: RegExp[],
): FunctionTarget[] => {
  return implementationFunctions(document).filter(
    (fn) =>
      factsOwnedBy(document, fn, document.facts?.declarations ?? []).length > 0 ||
      fn.calls.some((call) => matchesAny(call.callee, lifecyclePatterns)) ||
      factsOwnedBy(document, fn, document.facts?.constructors ?? []).some(
        (constructor) =>
          constructor.callee !== undefined &&
          matchesAny(constructor.callee, defaultResourceConstructorPatterns),
      ),
  );
};

const multiResourceFunctions = (
  document: ParsedDocument,
  acquisitionPatterns: RegExp[],
): FunctionTarget[] => {
  return implementationFunctions(document).filter(
    (fn) =>
      fn.calls.filter((call) => matchesAny(call.callee, acquisitionPatterns)).length +
        factsOwnedBy(document, fn, document.facts?.constructors ?? []).filter(
          (constructor) =>
            constructor.callee !== undefined &&
            matchesAny(constructor.callee, defaultResourceConstructorPatterns),
        ).length >=
      2,
  );
};

const retryFunctions = (document: ParsedDocument, retryPatterns: RegExp[]): FunctionTarget[] => {
  return implementationFunctions(document).filter((fn) => {
    if (fn.calls.some((call) => matchesAny(call.callee, retryPatterns))) {
      return true;
    }
    const controls = factsOwnedBy(document, fn, document.facts?.controls ?? []);
    const retryLoops = controls.filter((control) => {
      if (control.kind !== "loop" || control.loop === "for-in") {
        return false;
      }
      return control.loop !== "for-of" || possibleRetryForOf(document, fn, control);
    });
    return controls.some(
      (control) =>
        control.kind === "catch" &&
        retryLoops.some(
          (loop) => loop.range.start <= control.range.start && loop.range.end >= control.range.end,
        ),
    );
  });
};

const possibleRetryForOf = (
  document: ParsedDocument,
  fn: FunctionTarget,
  loop: NonNullable<ParsedDocument["facts"]>["controls"][number],
): boolean => {
  const bindings = loop.bindings ?? [];
  if (bindings.length === 0) {
    return true;
  }
  const operationCalls = factsOwnedBy(document, fn, document.facts?.calls ?? []).filter(
    (call) =>
      call.control.some(
        (region) =>
          region.kind === "loop" &&
          region.range.start === loop.range.start &&
          region.range.end === loop.range.end,
      ) && !call.control.some((region) => region.kind === "catch"),
  );
  return operationCalls.some(
    (call) => !bindings.some((binding) => call.references.includes(binding)),
  );
};

const factsOwnedBy = <Fact extends { range: { start: number; end: number } }>(
  document: ParsedDocument,
  fn: FunctionTarget,
  facts: Fact[],
): Fact[] => {
  return facts.filter(
    (fact) =>
      fact.range.start >= fn.range.start &&
      fact.range.end <= fn.range.end &&
      smallestContainingFunction(document, fact.range) === fn,
  );
};

const smallestContainingFunction = (
  document: ParsedDocument,
  range: { start: number; end: number },
): FunctionTarget | undefined => {
  return document.functions
    .filter((candidate) => candidate.range.start <= range.start && candidate.range.end >= range.end)
    .toSorted(
      (left, right) => left.range.end - left.range.start - (right.range.end - right.range.start),
    )[0];
};

const implementationFunctions = (document: ParsedDocument): FunctionTarget[] => {
  return document.functions.filter(
    (fn) =>
      fn.kind === "function" && fn.source.length > 0 && fn.source.length <= maxFunctionCharacters,
  );
};

const functionState = (fn: FunctionTarget, document: ParsedDocument): JsonValue => {
  const errorHandlers = boundedUnique(
    document.errorHandlers
      .filter(
        (handler) => handler.range.start >= fn.range.start && handler.range.end <= fn.range.end,
      )
      .map((handler) => ({
        binding: handler.binding ?? null,
        try: handler.trySource,
        body: handler.bodySource,
        calls: boundedUnique(
          handler.calls.map((call) => call.callee),
          (callee) => callee,
        ),
        exits: boundedUnique(
          handler.exits.map((exit) => ({ kind: exit.kind, source: exit.source })),
          (exit) => `${exit.kind}:${exit.source}`,
        ),
      })),
    (handler) => `${handler.binding}:${handler.try}`,
  );
  return {
    language: document.language,
    imports: boundedUnique(document.imports, (entry) => entry),
    function: fn.source,
    calls: boundedUnique(
      fn.calls.map((call) => call.callee),
      (callee) => callee,
    ),
    errorHandlers,
  };
};

const lifecyclePatternsFor = (options: ResourceLifecycleRuleOptions): RegExp[] => {
  const patterns = options.lifecycleCallPatterns ?? defaultLifecycleCallPatterns;
  validatePatterns("lifecycleCallPatterns", patterns);
  return patterns;
};

const acquisitionPatternsFor = (options: ResourceLifecycleRuleOptions): RegExp[] => {
  const patterns = options.lifecycleCallPatterns ?? defaultAcquisitionCallPatterns;
  validatePatterns("lifecycleCallPatterns", patterns);
  return patterns;
};

const retryPatternsFor = (options: RequireBoundedRetriesOptions): RegExp[] => {
  const patterns = options.retryCallPatterns ?? defaultRetryCallPatterns;
  validatePatterns("retryCallPatterns", patterns);
  return patterns;
};

const decisionOptions = (
  options: DecisionRuleOptions,
  defaultThreshold: DecisionThreshold,
  defaultMinConfidence: number,
): { threshold: DecisionThreshold; minConfidence: number } => {
  return resolveDecisionOptions(options, {
    threshold: defaultThreshold,
    minConfidence: defaultMinConfidence,
  });
};

const diagnostic = (
  candidate: RuleCandidate,
  message: string,
  scores: { probability: number; confidence: number; severity: "warning" | "error" },
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    ...scores,
  };
};

const validatePatterns = (name: string, patterns: RegExp[]): void => {
  if (!Array.isArray(patterns) || patterns.some((pattern) => !(pattern instanceof RegExp))) {
    throw new TypeError(`${name} must be an array of regular expressions`);
  }
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

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};
