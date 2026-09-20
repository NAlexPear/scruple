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
    "require-complete-resource-cleanup",
    "require-retry-backoff-with-jitter",
    "require-retry-time-budget",
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
    errorHandlers: [],
  });
});

await test("retry rules select explicit retry helpers and failure loops in source order", () => {
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
  const plugin = resources();
  const document = oxcParser().parse("retry.ts", source);
  const retryRules = [
    "require-bounded-retries",
    "require-retry-backoff-with-jitter",
    "require-retry-time-budget",
  ] as const;

  for (const ruleName of retryRules) {
    const candidates = plugin.rules[ruleName]().collect(document);
    assert.deepEqual(
      candidates.map((candidate) => candidate.target.source.match(/function (\w+)/u)?.[1]),
      ["helper", "loop"],
    );
  }

  const loopCandidate = plugin.rules["require-bounded-retries"]().collect(document)[1];
  assert.ok(loopCandidate);
  assert.deepEqual(loopCandidate.state, {
    language: "typescript",
    imports: [],
    function: `async function loop() {
  while (true) {
    try { return await request(); } catch (error) { await delay(error); }
  }
}`,
    calls: ["request", "delay"],
    errorHandlers: [
      {
        binding: "error",
        try: "try { return await request(); } catch (error) { await delay(error); }",
        body: "{ await delay(error); }",
        calls: ["delay"],
        exits: [],
      },
    ],
  });
});

await test("resource selectors ignore lifecycle and retry syntax quoted in rule prompts", () => {
  const source = `export function lifecyclePrompt() {
  return "Treat using declarations and scoped helpers as managed resources.";
}

export function retryPrompt() {
  return \`Look for while loops, retry attempts, and catch handlers.\`;
}

export async function processFiles(files: string[]) {
  for (const file of files) {
    try { await processFile(file); }
    catch (error) { reportFileError(file, error); }
  }
}
`;
  const plugin = resources();
  const document = oxcParser().parse("self-hosting.ts", source);

  assert.equal(plugin.rules["no-leaked-resources"]().collect(document).length, 0);
  assert.equal(plugin.rules["require-cleanup-on-failure"]().collect(document).length, 0);
  assert.equal(plugin.rules["require-bounded-retries"]().collect(document).length, 0);
  assert.equal(plugin.rules["require-retry-backoff-with-jitter"]().collect(document).length, 0);
  assert.equal(plugin.rules["require-retry-time-budget"]().collect(document).length, 0);
});

await test("complete cleanup rule requires multiple explicit acquisitions", () => {
  const source = `export async function partialConstruction() {
  const input = await open("input");
  const output = await open("output");
  try { return await copy(input, output); }
  finally { await input.close(); await output.close(); }
}

export async function managedConstruction() {
  await using input = await open("input");
  await using output = await open("output");
  return copy(input, output);
}

export async function singleResource() {
  const input = await open("input");
  try { return await input.readFile(); }
  finally { await input.close(); }
}

export async function scopedHelpers() {
  return withConnection(() => withTransaction(() => work()));
}
`;
  const candidates = resources()
    .rules["require-complete-resource-cleanup"]()
    .collect(oxcParser().parse("construction.ts", source));

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.match(/function (\w+)/u)?.[1]),
    ["partialConstruction", "managedConstruction"],
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

await test("new selectors honor custom patterns deterministically", () => {
  const lifecycleDocument = oxcParser().parse(
    "lease.ts",
    "export async function run() { const first = await pool.lease(); const second = await pool.lease(); return combine(first, second); }",
  );
  const lifecycleRule = resources().rules["require-complete-resource-cleanup"]({
    lifecycleCallPatterns: [/(?:^|\.)lease$/gu],
  });
  assert.equal(lifecycleRule.collect(lifecycleDocument).length, 1);
  assert.equal(lifecycleRule.collect(lifecycleDocument).length, 1);

  const retryDocument = oxcParser().parse(
    "again.ts",
    "export async function run() { return again(() => request()); }",
  );
  const retryRule = resources().rules["require-retry-time-budget"]({
    retryCallPatterns: [/^again$/gu],
  });
  assert.equal(retryRule.collect(retryDocument).length, 1);
  assert.equal(retryRule.collect(retryDocument).length, 1);
});

await test("new rule choices distinguish safe, unsafe, and opaque evidence", () => {
  const plugin = resources();
  const retryDocument = oxcParser().parse(
    "retry.ts",
    "export async function run() { return retry(() => request(), { retries: 3 }); }",
  );
  const cleanupDocument = oxcParser().parse(
    "cleanup.ts",
    'export async function run() { const a = await open("a"); const b = await open("b"); await a.close(); await b.close(); }',
  );
  const cases = [
    {
      candidate: plugin.rules["require-retry-backoff-with-jitter"]().collect(retryDocument)[0],
      choices: [
        "unsafe_retry_timing",
        "backoff_with_jitter",
        "framework_managed",
        "not_applicable",
        "insufficient_context",
      ],
    },
    {
      candidate: plugin.rules["require-retry-time-budget"]().collect(retryDocument)[0],
      choices: [
        "missing_retry_time_budget",
        "total_time_budget",
        "inherited_time_budget",
        "not_retry_behavior",
        "insufficient_context",
      ],
    },
    {
      candidate: plugin.rules["require-complete-resource-cleanup"]().collect(cleanupDocument)[0],
      choices: [
        "incomplete_cleanup",
        "complete_cleanup",
        "managed_cleanup",
        "ownership_transferred",
        "insufficient_context",
      ],
    },
  ];

  for (const { candidate, choices } of cases) {
    assert.ok(candidate);
    assert.equal(candidate.question.type, "choice");
    assert.deepEqual(Object.keys(candidate.question.criteria), choices);
  }
});

await test("resource diagnostics require the configured finding, probability, and confidence", () => {
  const plugin = resources();
  const cases: Array<{
    ruleName: keyof typeof plugin.rules;
    finding: string;
    message: string;
    threshold: number;
    minConfidence: number;
    source: string;
  }> = [
    {
      ruleName: "no-leaked-resources",
      finding: "leaked_resource",
      message: "This function appears to leave an acquired resource unreleased.",
      threshold: 0.65,
      minConfidence: 0.5,
      source:
        'export async function read() { const file = await open("one"); return file.readFile(); }',
    },
    {
      ruleName: "require-cleanup-on-failure",
      finding: "cleanup_not_failure_safe",
      message: "Ensure this resource is cleaned up when work fails.",
      threshold: 0.9,
      minConfidence: 0.7,
      source:
        'export async function read() { const file = await open("one"); return file.readFile(); }',
    },
    {
      ruleName: "require-bounded-retries",
      finding: "unbounded_retry",
      message: "Add an enforced finite bound to this retry behavior.",
      threshold: 0.9,
      minConfidence: 0.7,
      source:
        "export async function run() { while (true) { try { return await work(); } catch (error) { log(error); } } }",
    },
    {
      ruleName: "require-complete-resource-cleanup",
      finding: "incomplete_cleanup",
      message:
        "Ensure every acquired resource is cleaned up even when acquisition or cleanup fails.",
      threshold: 0.9,
      minConfidence: 0.7,
      source:
        'export async function run() { const a = await open("a"); const b = await open("b"); await a.close(); await b.close(); }',
    },
    {
      ruleName: "require-retry-backoff-with-jitter",
      finding: "unsafe_retry_timing",
      message: "Use progressive backoff with jitter between retry attempts.",
      threshold: 0.9,
      minConfidence: 0.7,
      source: "export async function run() { return retry(() => request()); }",
    },
    {
      ruleName: "require-retry-time-budget",
      finding: "missing_retry_time_budget",
      message: "Add a total elapsed-time budget that spans all retry attempts.",
      threshold: 0.9,
      minConfidence: 0.7,
      source: "export async function run() { return retry(() => request()); }",
    },
  ];

  for (const entry of cases) {
    const rule = plugin.rules[entry.ruleName]();
    const candidate = rule.collect(oxcParser().parse("resource.ts", entry.source))[0];
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
