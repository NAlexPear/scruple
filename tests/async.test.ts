import assert from "node:assert/strict";
import test from "node:test";

import { asyncRules } from "@scruple/async";
import type { ChoiceAnswer } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

const parser = oxcParser();

const answer = (choice: string, probability: number, confidence: number): ChoiceAnswer => {
  return {
    type: "choice",
    choice,
    probabilities: { [choice]: probability },
    confidence,
  };
};

await test("async plugin registers the conservative initial rule set", () => {
  assert.deepEqual(Object.keys(asyncRules().rules), [
    "no-unbounded-concurrency",
    "no-serial-independent-work",
    "require-cancellation-propagation",
  ]);
});

await test("unbounded concurrency selection is limited to native Promise fan-out", () => {
  const document = parser.parse(
    "jobs.ts",
    `import { run } from "./worker.js";
export async function sequential(items: Item[]) {
  for (const item of items) await run(item);
}
export async function concurrent(items: Item[]) {
  return Promise.all(items.map((item) => run(item)));
}
export async function settled(items: Item[]) {
  return Promise.allSettled(items.map((item) => run(item)));
}
`,
  );
  const candidates = asyncRules().rules["no-unbounded-concurrency"]().collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.split("(")[0]),
    ["async function concurrent", "async function settled"],
  );
  assert.deepEqual(candidates[0]?.state, {
    language: "typescript",
    imports: [`import { run } from "./worker.js";`],
    function:
      "async function concurrent(items: Item[]) {\n  return Promise.all(items.map((item) => run(item)));\n}",
    calls: [
      {
        callee: "Promise.all",
        source: "Promise.all(items.map((item) => run(item)))",
      },
      { callee: "items.map", source: "items.map((item) => run(item))" },
    ],
    evidence_scope:
      "This function and its imports only; unknown external behavior is not evidence.",
  });
});

await test("serial-work selection requires two direct awaits in one async function", () => {
  const document = parser.parse(
    "load.ts",
    `export async function one() {
  return await loadOne();
}
export async function two() {
  const first = await loadOne();
  const second = await loadTwo(first);
  return second;
}
export function notAsync() {
  return loadOne();
}
`,
  );
  const candidates = asyncRules().rules["no-serial-independent-work"]().collect(document);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.target.source.includes("function two"), true);
});

await test("cancellation selection requires an explicit AbortSignal contract", () => {
  const document = parser.parse(
    "request.ts",
    `export async function cancellable(url: string, signal: AbortSignal) {
  return fetch(url);
}
export async function ordinary(url: string) {
  return fetch(url);
}
`,
  );
  const candidates = asyncRules().rules["require-cancellation-propagation"]().collect(document);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.target.source.includes("function cancellable"), true);
});

await test("async rules diagnose only calibrated finding answers and otherwise abstain", () => {
  const document = parser.parse(
    "async.ts",
    `export async function run(items: Item[], signal: AbortSignal) {
  await loadOne();
  await loadTwo();
  await fetch("/jobs");
  return Promise.all(items.map((item) => process(item)));
}
`,
  );
  const plugin = asyncRules();
  const cases = [
    ["no-unbounded-concurrency", "unbounded_concurrency"],
    ["no-serial-independent-work", "serial_independent_work"],
    ["require-cancellation-propagation", "cancellation_not_propagated"],
  ] as const;

  for (const [ruleName, finding] of cases) {
    const rule = plugin.rules[ruleName]();
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    assert.equal(rule.diagnose(answer(finding, 0.89, 0.99), candidate), null);
    assert.equal(rule.diagnose(answer(finding, 0.99, 0.69), candidate), null);
    assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
    const diagnostic = rule.diagnose(answer(finding, 0.9, 0.7), candidate);
    assert.ok(diagnostic);
    assert.equal(diagnostic.filename, "async.ts");
    assert.equal(diagnostic.probability, 0.9);
    assert.equal(diagnostic.confidence, 0.7);
  }
});
