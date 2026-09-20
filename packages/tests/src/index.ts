import type {
  DecisionRuleOptions,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export type NoVacuousTestsOptions = DecisionRuleOptions;

export interface RequireSpecificErrorAssertionsOptions extends NoVacuousTestsOptions {
  assertionCallPatterns?: RegExp[];
}

export interface NoFixedDelaySynchronizationOptions extends NoVacuousTestsOptions {
  delayCallPatterns?: RegExp[];
}

export type TestsPlugin = ScruplePlugin<{
  "no-vacuous-tests": RuleFactory<NoVacuousTestsOptions>;
  "require-specific-error-assertions": RuleFactory<RequireSpecificErrorAssertionsOptions>;
  "no-fixed-delay-synchronization": RuleFactory<NoFixedDelaySynchronizationOptions>;
  "no-nondeterministic-tests": RuleFactory<NoVacuousTestsOptions>;
}>;

const defaultErrorAssertionCallPatterns = [
  /(?:^|\.)(?:rejectedWith|rejects|throw|throws)(?:\.|$)/iu,
  /(?:^|\.)(?:toThrow|toThrowError)(?:MatchingInlineSnapshot|MatchingSnapshot)?$/u,
];
const defaultDelayCallPatterns = [/(?:^|\.)(?:delay|pause|setTimeout|sleep|waitForTimeout)$/iu];

export const tests = (): TestsPlugin => {
  return definePlugin({
    rules: {
      "no-vacuous-tests": noVacuousTests,
      "require-specific-error-assertions": requireSpecificErrorAssertions,
      "no-fixed-delay-synchronization": noFixedDelaySynchronization,
      "no-nondeterministic-tests": noNondeterministicTests,
    },
  });
};

const nondeterministicCallees = new Set([
  "crypto.getRandomValues",
  "Date.now",
  "Math.random",
  "performance.now",
  "process.hrtime",
  "process.hrtime.bigint",
]);

const noNondeterministicTests = (options: NoVacuousTestsOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  return testChoiceRule({
    description: "Tests should control nondeterministic inputs.",
    select: (document) =>
      testFunctions(document).filter((fn) =>
        fn.calls.some((call) => nondeterministicCallees.has(call.callee)),
      ),
    instructions:
      "Does this test depend on uncontrolled randomness or wall-clock time in a way that can change its outcome? Fake clocks, seeded or mocked randomness, and visible deterministic injection are controlled. Tests intentionally checking statistical or nondeterministic properties may be valid when their oracle is robust. Choose insufficient_context when control is hidden in helpers or framework setup.",
    criteria: {
      uncontrolled_nondeterminism:
        "The test outcome can vary because randomness or time is read without visible deterministic control.",
      controlled_nondeterminism:
        "Randomness or time is visibly fixed, seeded, mocked, faked, or injected for this test.",
      intentional_nondeterministic_test:
        "The test intentionally exercises nondeterminism with an oracle designed for that contract.",
      insufficient_context:
        "The evidence does not establish whether the nondeterministic source is controlled elsewhere.",
    },
    finding: "uncontrolled_nondeterminism",
    threshold,
    minConfidence,
    message: "Control randomness or time so this test is deterministic.",
  });
};

const noVacuousTests = (options: NoVacuousTestsOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);

  return testChoiceRule({
    description: "Tests should verify meaningful behavior.",
    select: testFunctions,
    instructions:
      "Does this test contain an effective oracle that can fail when the behavior it claims to test is wrong? Use the title, invocation, imports, calls, and provided local helper bodies together. Count assertions, expected failures, snapshots, and interaction checks that are causally connected to the claimed behavior. Also allow an assertion-free smoke or completion oracle only when the title and body clearly establish that successful completion, loading, or absence of a crash is itself the intended contract. Merely arranging or executing code does not prove a more specific claimed result. For parameterized tests, judge whether each generated case checks its inputs. A skipped or focused modifier does not decide vacuity. If an unfamiliar imported helper might verify behavior but its implementation is unavailable, abstain rather than guessing.",
    criteria: {
      meaningful_explicit_verification:
        "Visible assertions, expected failures, snapshots, or interaction checks meaningfully verify the behavior claimed by the test.",
      intentional_smoke_oracle:
        "The test clearly and intentionally verifies successful completion, loading, or absence of a crash, so execution failure is the relevant oracle.",
      vacuous:
        "The complete evidence shows no effective oracle for the claimed behavior: it only arranges or executes code, configures mocks, asserts a constant or tautology, checks an unrelated value, or otherwise passes when the claimed result is wrong.",
      insufficient_context:
        "Missing helper semantics or other unavailable context prevents determining whether an apparent check verifies behavior.",
    },
    finding: "vacuous",
    threshold,
    minConfidence,
    message: "This test appears to have no effective verification of behavior.",
  });
};

const requireSpecificErrorAssertions = (
  options: RequireSpecificErrorAssertionsOptions = {},
): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  const patterns = options.assertionCallPatterns ?? defaultErrorAssertionCallPatterns;
  return testChoiceRule({
    description: "Error assertions should distinguish the failure promised by the test.",
    select: (document) =>
      testFunctions(document).filter((fn) =>
        fn.calls.some((call) => matchesAny(call.callee, patterns)),
      ),
    instructions:
      "Does this test accept any thrown error or rejected promise even though its title and visible behavior claim a distinguishable failure contract? A stable error class, code, status, predicate, or meaningful message pattern can make the assertion specific; exact message equality is not required. A generic throw assertion is acceptable when any failure is genuinely the public contract or third-party error details are intentionally unstable. If an imported assertion helper or the failure contract is opaque, abstain rather than inferring its behavior from its name.",
    criteria: {
      specific_error_contract:
        "The assertion visibly checks a stable property that distinguishes the expected failure from unrelated defects.",
      underspecified_error_oracle:
        "The test claims a distinguishable failure but would pass for unrelated thrown errors or promise rejections.",
      intentionally_generic_failure:
        "Any failure is the visible intended contract, or more specific third-party error details are intentionally not stable.",
      insufficient_context:
        "The available evidence does not establish the assertion helper's behavior or the stability of the failure contract.",
    },
    finding: "underspecified_error_oracle",
    threshold,
    minConfidence,
    message: "Assert the expected error type or another stable failure property.",
  });
};

const noFixedDelaySynchronization = (
  options: NoFixedDelaySynchronizationOptions = {},
): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  const patterns = options.delayCallPatterns ?? defaultDelayCallPatterns;
  return testChoiceRule({
    description: "Tests should wait for observable conditions instead of fixed delays.",
    select: (document) =>
      testFunctions(document).filter(
        (fn) =>
          fn.calls.some((call) => matchesAny(call.callee, patterns)) ||
          (document.facts?.calls.some(
            (call) =>
              call.callee !== undefined &&
              call.range.start >= fn.range.start &&
              call.range.end <= fn.range.end &&
              matchesAny(call.callee, patterns),
          ) ??
            false),
      ),
    instructions:
      "Does this test use a fixed real-time delay to guess when behavior is ready before checking it? Flag sleeps, pauses, or timeout waits used as synchronization when a condition, event, promise, locator, or polling assertion should determine readiness. Do not flag fake-clock advancement, tests whose subject is timeout/debounce/backoff behavior, explicit real-time latency or soak tests, or condition-based waits that merely have a finite timeout bound. If an imported wait helper's behavior is opaque, abstain rather than inferring it from its name.",
    criteria: {
      fixed_delay_synchronization:
        "A real-time fixed delay is used to guess readiness before the test observes behavior.",
      condition_based_wait:
        "The test waits for an observable condition, event, promise, locator, or bounded polling assertion rather than sleeping for readiness.",
      controlled_time_test:
        "The test controls virtual time or directly verifies timeout, debounce, scheduling, or backoff behavior.",
      intentional_real_time_test:
        "Elapsed real time is explicitly part of an integration, latency, or soak contract.",
      insufficient_context:
        "The available evidence does not establish whether an opaque helper sleeps or waits for a condition.",
    },
    finding: "fixed_delay_synchronization",
    threshold,
    minConfidence,
    message: "Wait for an observable condition instead of using a fixed delay.",
  });
};

interface TestChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): FunctionTarget[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  threshold: number;
  minConfidence: number;
  message: string;
}

const testChoiceRule = (definition: TestChoiceRuleDefinition): SemanticRule => {
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
      if (probability < definition.threshold || answer.confidence < definition.minConfidence) {
        return null;
      }
      return {
        message: definition.message,
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  };
};

const testFunctions = (document: ParsedDocument): FunctionTarget[] => {
  return document.functions.filter((fn) => fn.kind === "test");
};

const functionState = (fn: FunctionTarget, document: ParsedDocument): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    test: {
      name: fn.testName ?? null,
      invocation: fn.enclosingSource ?? fn.source,
      callback: fn.source,
      calls: fn.calls.map((call) => call.callee),
    },
    local_helpers: supportingFunctions(fn, document),
  };
};

const supportingFunctions = (fn: FunctionTarget, document: ParsedDocument): JsonValue[] => {
  const functionsByName = new Map<string, FunctionTarget[]>();
  for (const candidate of document.functions) {
    if (candidate.kind !== "function" || candidate.name === undefined) {
      continue;
    }
    const matches = functionsByName.get(candidate.name) ?? [];
    matches.push(candidate);
    functionsByName.set(candidate.name, matches);
  }

  const pending = fn.calls.map((call) => call.callee);
  const seen = new Set<string>();
  const helpers: JsonValue[] = [];
  for (const name of pending) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    for (const helper of functionsByName.get(name) ?? []) {
      helpers.push({ name, source: helper.source });
      pending.push(...helper.calls.map((call) => call.callee));
    }
  }
  return helpers;
};

const decisionOptions = (
  options: NoVacuousTestsOptions,
): { threshold: number; minConfidence: number } => {
  return resolveDecisionOptions(options, { threshold: 0.9, minConfidence: 0.7 });
};

const matchesAny = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};
