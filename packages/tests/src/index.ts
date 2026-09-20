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

export interface NoVacuousTestsOptions extends DecisionRuleOptions {
  /** Test callbacks larger than this are skipped rather than partially evaluated. */
  maxFunctionCharacters?: number;
  /** Maximum total import-source characters included in evidence. */
  maxImportCharacters?: number;
  /** Maximum direct test call sites included in evidence. */
  maxCallSites?: number;
  /** Maximum number of uniquely resolved local helpers included in evidence. */
  maxHelperFunctions?: number;
  /** Maximum total source characters included for local helpers. */
  maxHelperCharacters?: number;
}

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
  const resolved = resolveOptions(options);
  return testChoiceRule({
    description: "Tests should control nondeterministic inputs.",
    select: (document) =>
      testFunctions(document, resolved).filter((fn) =>
        callsInTestAndHelpers(fn, document, resolved).some((call) =>
          nondeterministicCallees.has(call.callee),
        ),
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
    options: resolved,
    message: "Control randomness or time so this test is deterministic.",
  });
};

const noVacuousTests = (options: NoVacuousTestsOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options);

  return testChoiceRule({
    description: "Tests should verify meaningful behavior.",
    select: (document) => testFunctions(document, resolved),
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
    options: resolved,
    message: "This test appears to have no effective verification of behavior.",
  });
};

const requireSpecificErrorAssertions = (
  options: RequireSpecificErrorAssertionsOptions = {},
): SemanticRule => {
  const resolved = resolveOptions(options);
  const patterns = options.assertionCallPatterns ?? defaultErrorAssertionCallPatterns;
  return testChoiceRule({
    description: "Error assertions should distinguish the failure promised by the test.",
    select: (document) =>
      testFunctions(document, resolved).filter((fn) =>
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
    options: resolved,
    message: "Assert the expected error type or another stable failure property.",
  });
};

const noFixedDelaySynchronization = (
  options: NoFixedDelaySynchronizationOptions = {},
): SemanticRule => {
  const resolved = resolveOptions(options);
  const patterns = options.delayCallPatterns ?? defaultDelayCallPatterns;
  return testChoiceRule({
    description: "Tests should wait for observable conditions instead of fixed delays.",
    select: (document) =>
      testFunctions(document, resolved).filter(
        (fn) =>
          callsInTestAndHelpers(fn, document, resolved).some((call) =>
            matchesAny(call.callee, patterns),
          ) ||
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
    options: resolved,
    message: "Wait for an observable condition instead of using a fixed delay.",
  });
};

interface TestChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): FunctionTarget[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  options: ResolvedOptions;
  message: string;
}

const testChoiceRule = (definition: TestChoiceRuleDefinition): SemanticRule => {
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map((fn) => ({
        target: fn,
        state: functionState(fn, document, definition.options),
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
      if (
        probability < definition.options.threshold ||
        answer.confidence < definition.options.minConfidence
      ) {
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

interface ResolvedOptions {
  threshold: number;
  minConfidence: number;
  maxFunctionCharacters: number;
  maxImportCharacters: number;
  maxCallSites: number;
  maxHelperFunctions: number;
  maxHelperCharacters: number;
}

interface ResolvedHelpers {
  helpers: FunctionTarget[];
  ambiguousNames: string[];
}

const testFunctions = (document: ParsedDocument, options: ResolvedOptions): FunctionTarget[] => {
  return document.functions.filter(
    (fn) =>
      fn.kind === "test" &&
      fn.source.length > 0 &&
      fn.source.length <= options.maxFunctionCharacters,
  );
};

const functionState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  options: ResolvedOptions,
): JsonValue => {
  const imports = boundedStrings(document.imports, options.maxImportCharacters);
  const resolved = resolveSupportingFunctions(fn, document);
  const helpers = boundedHelpers(resolved.helpers, options);
  const calls = fn.calls.slice(0, options.maxCallSites);
  return {
    language: document.language,
    imports: imports.values,
    imports_truncated: imports.truncated,
    test: {
      name: fn.testName ?? null,
      invocation: fn.enclosingSource ?? fn.source,
      callback: fn.source,
      calls: calls.map((call) => call.callee),
      calls_truncated: calls.length < fn.calls.length,
    },
    local_helpers: helpers.values.map((helper) => ({
      name: helper.name ?? null,
      source: helper.source,
    })),
    helpers_truncated: helpers.truncated,
    ambiguous_helper_names: resolved.ambiguousNames,
    evidence_scope:
      "Bounded test-local evidence and uniquely resolvable visible helpers only; ambiguous or unavailable helper behavior is not inferred.",
  };
};

const callsInTestAndHelpers = (
  fn: FunctionTarget,
  document: ParsedDocument,
  options: ResolvedOptions,
): Array<{ callee: string }> => {
  const resolved = resolveSupportingFunctions(fn, document);
  const helpers = boundedHelpers(resolved.helpers, options);
  return [...fn.calls, ...helpers.values.flatMap((helper) => helper.calls)];
};

const resolveSupportingFunctions = (
  fn: FunctionTarget,
  document: ParsedDocument,
): ResolvedHelpers => {
  const functionsByName = new Map<string, FunctionTarget[]>();
  for (const candidate of document.functions) {
    if (candidate.kind !== "function" || candidate.name === undefined) {
      continue;
    }
    const matches = functionsByName.get(candidate.name) ?? [];
    matches.push(candidate);
    functionsByName.set(candidate.name, matches);
  }

  const pending: Array<{ name: string; caller: FunctionTarget }> = fn.calls.map((call) => ({
    name: call.callee,
    caller: fn,
  }));
  const seen = new Set<string>();
  const helpers: FunctionTarget[] = [];
  const ambiguousNames = new Set<string>();
  for (const entry of pending) {
    const key = `${entry.caller.range.start}:${entry.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const visible = (functionsByName.get(entry.name) ?? []).filter((candidate) =>
      isPlausiblyVisible(candidate, entry.caller, document.functions),
    );
    if (visible.length !== 1) {
      if (visible.length > 1) {
        ambiguousNames.add(entry.name);
      }
      continue;
    }
    const helper = visible[0]!;
    if (!helpers.includes(helper)) {
      helpers.push(helper);
    }
    pending.push(...helper.calls.map((call) => ({ name: call.callee, caller: helper })));
  }
  return {
    helpers,
    ambiguousNames: [...ambiguousNames].toSorted(),
  };
};

const isPlausiblyVisible = (
  candidate: FunctionTarget,
  caller: FunctionTarget,
  functions: readonly FunctionTarget[],
): boolean => {
  if (candidate === caller || candidate.kind !== "function") {
    return false;
  }
  if (candidate.range.start >= caller.range.start && candidate.range.end <= caller.range.end) {
    return true;
  }
  return (
    immediateContainingFunction(candidate, functions) ===
    immediateContainingFunction(caller, functions)
  );
};

const immediateContainingFunction = (
  fn: FunctionTarget,
  functions: readonly FunctionTarget[],
): FunctionTarget | undefined => {
  return functions
    .filter(
      (candidate) =>
        candidate !== fn &&
        candidate.range.start <= fn.range.start &&
        candidate.range.end >= fn.range.end,
    )
    .toSorted(
      (left, right) => left.range.end - left.range.start - (right.range.end - right.range.start),
    )[0];
};

const boundedStrings = (
  values: readonly string[],
  maximumCharacters: number,
): { values: string[]; truncated: boolean } => {
  const bounded: string[] = [];
  let characters = 0;
  for (const value of values) {
    const next = characters + (bounded.length === 0 ? 0 : 1) + value.length;
    if (next > maximumCharacters) {
      return { values: bounded, truncated: true };
    }
    bounded.push(value);
    characters = next;
  }
  return { values: bounded, truncated: false };
};

const boundedHelpers = (
  helpers: readonly FunctionTarget[],
  options: ResolvedOptions,
): { values: FunctionTarget[]; truncated: boolean } => {
  const values: FunctionTarget[] = [];
  let characters = 0;
  for (const helper of helpers) {
    if (
      values.length >= options.maxHelperFunctions ||
      characters + helper.source.length > options.maxHelperCharacters
    ) {
      return { values, truncated: true };
    }
    values.push(helper);
    characters += helper.source.length;
  }
  return { values, truncated: false };
};

const resolveOptions = (options: NoVacuousTestsOptions): ResolvedOptions => {
  const decision = resolveDecisionOptions(options, { threshold: 0.9, minConfidence: 0.7 });
  return {
    ...decision,
    maxFunctionCharacters: integerOption(
      "maxFunctionCharacters",
      options.maxFunctionCharacters,
      8_000,
      1,
    ),
    maxImportCharacters: integerOption(
      "maxImportCharacters",
      options.maxImportCharacters,
      2_000,
      0,
    ),
    maxCallSites: integerOption("maxCallSites", options.maxCallSites, 50, 0),
    maxHelperFunctions: integerOption("maxHelperFunctions", options.maxHelperFunctions, 10, 0),
    maxHelperCharacters: integerOption(
      "maxHelperCharacters",
      options.maxHelperCharacters,
      8_000,
      0,
    ),
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

const matchesAny = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};
