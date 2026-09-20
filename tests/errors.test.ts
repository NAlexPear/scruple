import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionAnswer, DecisionProvider, DecisionResponse } from "@scruple/core";
import { runScruple } from "@scruple/core";
import { errors } from "@scruple/errors";
import { oxcParser } from "@scruple/parser-oxc";

const choice = (
  selected: string,
  probabilities: Record<string, number>,
  confidence: number,
): DecisionAnswer => {
  return { type: "choice", choice: selected, probabilities, confidence };
};

const swallowedProvider = (): DecisionProvider => {
  return {
    id: "fixture",
    evaluate(request): Promise<DecisionResponse> {
      return Promise.resolve({
        model: "fixture",
        answers: Object.fromEntries(
          Object.keys(request.questions).map((id) => [
            id,
            choice("swallowed", { swallowed: 0.97 }, 0.95),
          ]),
        ),
      });
    },
  };
};

await test("OXC normalizes catch targets and direct control flow in source order", () => {
  const document = oxcParser().parse(
    "handlers.ts",
    `export async function load() {
  try {
    return await remote.load();
  } catch (cause) {
    audit.record(cause);
    [cause].map((entry) => { throw entry; });
    if (useFallback) return cached;
    throw cause;
  }
}

try { boot(); } catch { shutdown(); }
`,
  );

  assert.equal(document.errorHandlers.length, 2);
  const first = document.errorHandlers[0];
  assert.ok(first);
  assert.equal(first.binding, "cause");
  assert.deepEqual(
    first.calls.map((call) => call.callee),
    ["audit.record", "map"],
  );
  assert.deepEqual(
    first.exits.map((exit) => [exit.kind, exit.source]),
    [
      ["return", "return cached;"],
      ["throw", "throw cause;"],
    ],
  );
  assert.match(String(first.enclosingSource), /^async function load/u);
  assert.equal(document.errorHandlers[1]?.binding, undefined);
  assert.deepEqual(
    document.errorHandlers[1]?.calls.map((call) => call.callee),
    ["shutdown"],
  );
});

await test("errors plugin deterministically selects catch handlers and supplies bounded evidence", () => {
  const padding = "void value;\n".repeat(800);
  const document = oxcParser().parse(
    "bounded.ts",
    `export function parse(value: string) {
  ${padding}
  try { return JSON.parse(value); } catch (error) { return null; }
  ${padding}
}`,
  );
  const candidates = errors().rules["no-swallowed-errors"]().collect(document);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.target.kind, "error-handler");
  const state = JSON.stringify(candidates[0]?.state);
  assert.ok(state.length < 18_000);
  assert.match(state, /surrounding_code_truncated/u);
  assert.match(state, /return null/u);
});

await test("no-swallowed-errors applies typed margins and abstains on other decisions", () => {
  const factory = errors().rules["no-swallowed-errors"];
  const candidate = factory().collect(
    oxcParser().parse("one.ts", "try { work(); } catch (error) {}"),
  )[0];
  assert.ok(candidate);

  assert.ok(factory().diagnose(choice("swallowed", { swallowed: 0.9 }, 0.7), candidate));
  assert.equal(
    factory().diagnose(
      choice("insufficient_context", { insufficient_context: 0.99 }, 0.99),
      candidate,
    ),
    null,
  );
  assert.equal(factory().diagnose(choice("swallowed", { swallowed: 0.89 }, 0.99), candidate), null);
  assert.throws(() => factory({ threshold: 1.1 }), /threshold must be a finite number/u);
  assert.throws(() => factory({ minConfidence: Number.NaN }), /minConfidence must be/u);
});

await test("no-swallowed-errors reports a stable catch-level diagnostic", async () => {
  const result = await runScruple(
    {
      parser: oxcParser(),
      provider: swallowedProvider(),
      plugins: { errors: errors() },
      rules: { "errors/no-swallowed-errors": "error" },
    },
    [
      {
        filename: "worker.ts",
        source: "async function run() {\n  try { await work(); } catch (error) {}\n}",
      },
    ],
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.diagnostics, [
    {
      ruleId: "errors/no-swallowed-errors",
      severity: "error",
      message: "This catch handler appears to swallow an error without handling it.",
      filename: "worker.ts",
      location: {
        start: { line: 2, column: 25 },
        end: { line: 2, column: 41 },
      },
      model: "fixture",
      probability: 0.97,
      confidence: 0.95,
    },
  ]);
});
