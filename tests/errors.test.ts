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

await test("errors plugin registers the bounded error-handler rule set", () => {
  assert.deepEqual(Object.keys(errors().rules), [
    "no-swallowed-errors",
    "no-lossy-error-wrapping",
    "no-message-based-error-dispatch",
  ]);
});

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

await test("no-swallowed-errors does not treat reporting followed by false success as handled", () => {
  const candidate = errors()
    .rules["no-swallowed-errors"]()
    .collect(
      oxcParser().parse(
        "upload.ts",
        `export async function upload(file: File) {
  try {
    await client.upload(file);
    return { ok: true };
  } catch (error) {
    telemetry.captureException(error);
    return { ok: true };
  }
}`,
      ),
    )[0];
  assert.ok(candidate);

  const question = JSON.stringify(candidate.question);
  assert.match(question, /Logging, telemetry, or cleanup alone does not handle/u);
  assert.match(question, /distinguishable failed outcome rather than false success/u);
  assert.match(question, /"reported_failure"/u);
  assert.doesNotMatch(question, /"intentionally_handled"/u);
});

await test("no-lossy-error-wrapping selects visible replacement throws in source order", () => {
  const document = oxcParser().parse(
    "wrapping.ts",
    `try { direct(); } catch (error) { throw error; }
try { preserved(); } catch (error) { throw new Error("preserved", { cause: error }); }
try { lossy(); } catch (error) { throw new Error("lost"); }
try { opaque(); } catch (error) { throw wrapFailure(error); }
try { unbound(); } catch { throw new Error("lost"); }
`,
  );
  const rule = errors().rules["no-lossy-error-wrapping"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    [
      'catch (error) { throw new Error("preserved", { cause: error }); }',
      'catch (error) { throw new Error("lost"); }',
      "catch (error) { throw wrapFailure(error); }",
      'catch { throw new Error("lost"); }',
    ],
  );
  assert.match(JSON.stringify(candidates[2]?.question), /opaque wrapper function/u);
  assert.equal(
    rule.diagnose(
      choice("insufficient_context", { insufficient_context: 0.99 }, 0.99),
      candidates[2]!,
    ),
    null,
  );
});

await test("no-message-based-error-dispatch selects message uses but leaves judgment semantic", () => {
  const document = oxcParser().parse(
    "dispatch.ts",
    `try { first(); } catch (error) {
  if (error.message.includes("not found")) return undefined;
  throw error;
}
try { second(); } catch (error) { logger.error(error.message); throw error; }
try { third(); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
try { fourth(); } catch (cause) { return classify(cause?.message); }
try { fifth(); } catch (error) { logger.info("Do not parse error.message here"); throw error; }
`,
  );
  const rule = errors().rules["no-message-based-error-dispatch"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    [
      'catch (error) {\n  if (error.message.includes("not found")) return undefined;\n  throw error;\n}',
      "catch (error) { logger.error(error.message); throw error; }",
      "catch (cause) { return classify(cause?.message); }",
    ],
  );
  assert.match(JSON.stringify(candidates[1]?.question), /not message-based dispatch/u);
  assert.match(JSON.stringify(candidates[2]?.question), /opaque classifier/u);
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

await test("new error rules apply calibrated margins and stable diagnostics", () => {
  const plugin = errors();
  const cases = [
    {
      ruleName: "no-lossy-error-wrapping" as const,
      source: 'try { load(); } catch (error) { throw new Error("Load failed"); }',
      finding: "lossy_wrapping",
      threshold: 0.9,
      message: "This replacement error appears to discard the original failure cause.",
    },
    {
      ruleName: "no-message-based-error-dispatch" as const,
      source:
        'try { load(); } catch (error) { if (error.message === "missing") return null; throw error; }',
      finding: "message_based_dispatch",
      threshold: 0.85,
      message: "This handler appears to dispatch on unstable error message text.",
    },
  ];

  for (const entry of cases) {
    const rule = plugin.rules[entry.ruleName]();
    const candidate = rule.collect(oxcParser().parse("errors.ts", entry.source))[0];
    assert.ok(candidate);
    assert.equal(
      rule.diagnose(
        choice(entry.finding, { [entry.finding]: entry.threshold - 0.01 }, 0.99),
        candidate,
      ),
      null,
    );
    assert.equal(
      rule.diagnose(choice(entry.finding, { [entry.finding]: 0.99 }, 0.69), candidate),
      null,
    );
    assert.equal(
      rule.diagnose(
        choice("insufficient_context", { insufficient_context: 0.99 }, 0.99),
        candidate,
      ),
      null,
    );
    assert.deepEqual(
      rule.diagnose(choice(entry.finding, { [entry.finding]: entry.threshold }, 0.7), candidate),
      {
        message: entry.message,
        filename: "errors.ts",
        location: candidate.target.location,
        probability: entry.threshold,
        confidence: 0.7,
      },
    );
  }
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
