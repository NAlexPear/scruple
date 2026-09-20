import type {
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface NoVacuousTestsOptions {
  threshold?: number;
  minConfidence?: number;
}

export type TestsPlugin = ScruplePlugin<{
  "no-vacuous-tests": RuleFactory<NoVacuousTestsOptions>;
}>;

export const tests = (): TestsPlugin => {
  return definePlugin({ rules: { "no-vacuous-tests": noVacuousTests } });
};

const noVacuousTests = (options: NoVacuousTestsOptions = {}): SemanticRule => {
  const threshold = options.threshold ?? 0.9;
  const minConfidence = options.minConfidence ?? 0.7;

  return {
    description: "Tests should verify meaningful behavior.",
    collect(document) {
      return document.functions
        .filter((fn) => fn.kind === "test")
        .map((fn) => ({
          target: fn,
          state: functionState(fn, document),
          question: {
            type: "choice",
            instructions:
              "Does this test contain an effective verification that can fail when the behavior under test is wrong? Use the test invocation, imports, calls, and any provided local helper bodies together. Count framework assertion APIs, assertion helpers, properly observed expected throws or rejections, snapshots, and mock interaction verification. Do not count merely running code, mock or fixture setup, an unobserved async expectation, or an assertion whose truth is independent of the behavior under test. For parameterized tests, judge whether each generated case checks its inputs. A skipped or focused modifier does not by itself make the test vacuous. If an unfamiliar helper might assert but its implementation is unavailable, abstain rather than guessing.",
            criteria: {
              meaningful_verification:
                "The available evidence shows an assertion, expected failure, snapshot, or interaction check that is causally connected to the behavior under test.",
              vacuous:
                "The complete test evidence shows no effective check: it only arranges or executes code, configures mocks, asserts a constant or tautology, checks an unrelated value, or otherwise passes regardless of the claimed behavior.",
              insufficient_context:
                "Missing helper semantics or other unavailable context prevents determining whether an apparent check can fail on incorrect behavior.",
            },
          },
        }));
    },
    diagnose(answer, candidate) {
      if (answer.type !== "choice") {
        return null;
      }
      const probability = answer.probabilities["vacuous"] ?? 0;
      if (
        answer.choice !== "vacuous" ||
        probability < threshold ||
        answer.confidence < minConfidence
      ) {
        return null;
      }
      return {
        message: "This test appears to have no effective verification of behavior.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  };
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
