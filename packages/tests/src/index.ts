import type {
  DiagnosticSeverity,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  SemanticPlugin,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface NoVacuousTestsOptions {
  severity?: DiagnosticSeverity;
  threshold?: number;
  minConfidence?: number;
}

export interface TestsOptions {
  noVacuousTests?: NoVacuousTestsOptions | false;
}

export function tests(options: TestsOptions = {}): SemanticPlugin[] {
  const noVacuousTests = options.noVacuousTests ?? {};
  return noVacuousTests === false ? [] : [noVacuousTestsPlugin(noVacuousTests)];
}

export function noVacuousTestsPlugin(options: NoVacuousTestsOptions = {}): SemanticPlugin {
  const threshold = options.threshold ?? 0.85;
  const minConfidence = options.minConfidence ?? 0.5;
  const severity = options.severity ?? "error";

  return definePlugin({
    id: "tests/no-vacuous-tests",
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
        severity,
        message: "This test appears not to verify meaningful behavior.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  });
}

function functionState(fn: FunctionTarget, document: ParsedDocument): JsonValue {
  return {
    language: document.language,
    imports: document.imports,
    function: fn.source,
    calls: fn.calls.map((call) => call.callee),
  };
}
