import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionAnswer } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { resources } from "@scruple/resources";

await test("resources plugin registers rules without enabling them", () => {
  assert.deepEqual(Object.keys(resources().rules), [
    "no-leaked-resources",
    "require-bounded-retries",
    "require-cleanup-on-failure",
  ]);
});

await test("resource rules select only functions with explicit lifecycle evidence", () => {
  const source = `import { open } from "node:fs/promises";
import { withConnection } from "./pool.js";

export async function leaked() {
  const file = await open("report.txt");
  return file.readFile();
}

export async function managed() {
  return withConnection((connection) => connection.query("select 1"));
}

export async function disposed() {
  await using file = await open("report.txt");
  return file.readFile();
}

export function ordinary() {
  return calculate();
}
`;
  const document = oxcParser().parse("resources.ts", source);
  const plugin = resources();
  const leakCandidates = plugin.rules["no-leaked-resources"]().collect(document);
  const cleanupCandidates = plugin.rules["require-cleanup-on-failure"]().collect(document);

  assert.deepEqual(
    leakCandidates.map((candidate) => candidate.target.source.match(/function (\w+)/u)?.[1]),
    ["leaked", "managed", "disposed"],
  );
  assert.deepEqual(
    cleanupCandidates.map((candidate) => candidate.target.location),
    leakCandidates.map((candidate) => candidate.target.location),
  );
  assert.deepEqual(leakCandidates[0]?.state, {
    language: "typescript",
    imports: [
      'import { open } from "node:fs/promises";',
      'import { withConnection } from "./pool.js";',
    ],
    function: `async function leaked() {
  const file = await open("report.txt");
  return file.readFile();
}`,
    calls: ["open", "file.readFile"],
  });
});

await test("retry rule selects explicit retry helpers and failure loops in source order", () => {
  const source = `export async function helper() {
  return retry(() => request(), { retries: 3 });
}

export async function loop() {
  while (true) {
    try { return await request(); } catch (error) { await delay(error); }
  }
}

export function ordinary(values: string[]) {
  for (const value of values) consume(value);
}
`;
  const candidates = resources()
    .rules["require-bounded-retries"]()
    .collect(oxcParser().parse("retry.ts", source));

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.match(/function (\w+)/u)?.[1]),
    ["helper", "loop"],
  );
});

await test("resource selectors honor custom call patterns", () => {
  const document = oxcParser().parse(
    "lease.ts",
    "export async function run() { const handle = await pool.lease(); return handle.read(); }",
  );
  const rule = resources().rules["no-leaked-resources"]({
    lifecycleCallPatterns: [/(?:^|\.)lease$/gu],
  });

  assert.equal(rule.collect(document).length, 1);
  assert.equal(
    rule.collect(document).length,
    1,
    "stateful regular expressions remain deterministic",
  );
});

await test("resource diagnostics require the configured finding, probability, and confidence", () => {
  const plugin = resources();
  const document = oxcParser().parse(
    "resource.ts",
    'export async function read() { const file = await open("one"); return file.readFile(); }',
  );
  const cases: Array<{
    ruleName: keyof typeof plugin.rules;
    finding: string;
    message: string;
    threshold: number;
    minConfidence: number;
  }> = [
    {
      ruleName: "no-leaked-resources",
      finding: "leaked_resource",
      message: "This function appears to leave an acquired resource unreleased.",
      threshold: 0.65,
      minConfidence: 0.5,
    },
    {
      ruleName: "require-cleanup-on-failure",
      finding: "cleanup_not_failure_safe",
      message: "Ensure this resource is cleaned up when work fails.",
      threshold: 0.9,
      minConfidence: 0.7,
    },
  ];

  for (const entry of cases) {
    const rule = plugin.rules[entry.ruleName]();
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    const finding: DecisionAnswer = {
      type: "choice",
      choice: entry.finding,
      confidence: entry.minConfidence,
      probabilities: { [entry.finding]: entry.threshold },
    };
    assert.deepEqual(rule.diagnose(finding, candidate), {
      message: entry.message,
      filename: "resource.ts",
      location: candidate.target.location,
      probability: entry.threshold,
      confidence: entry.minConfidence,
    });
    assert.equal(
      rule.diagnose({ ...finding, confidence: entry.minConfidence - 0.01 }, candidate),
      null,
      "low confidence abstains",
    );
    assert.equal(
      rule.diagnose(
        { ...finding, probabilities: { [entry.finding]: entry.threshold - 0.01 } },
        candidate,
      ),
      null,
      "low finding probability abstains",
    );
    assert.equal(
      rule.diagnose(
        {
          type: "choice",
          choice: "insufficient_context",
          confidence: 1,
          probabilities: { insufficient_context: 1 },
        },
        candidate,
      ),
      null,
      "non-finding decisions abstain",
    );
  }
});

await test("bounded-retry diagnostic uses stable text and calibrated margins", () => {
  const rule = resources().rules["require-bounded-retries"]();
  const candidate = rule.collect(
    oxcParser().parse(
      "retry.ts",
      "export async function run() { while (true) { try { return await work(); } catch (error) { log(error); } } }",
    ),
  )[0];
  assert.ok(candidate);

  assert.equal(
    rule.diagnose(
      {
        type: "choice",
        choice: "unbounded_retry",
        confidence: 0.7,
        probabilities: { unbounded_retry: 0.9 },
      },
      candidate,
    )?.message,
    "Add an enforced finite bound to this retry behavior.",
  );
});
