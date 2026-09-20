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

await test("async plugin registers the conservative rule set", () => {
  assert.deepEqual(Object.keys(asyncRules().rules), [
    "no-unbounded-concurrency",
    "no-serial-independent-work",
    "require-cancellation-propagation",
    "require-race-loser-cleanup",
    "require-abort-listener-cleanup",
    "no-unobserved-async-work",
    "no-async-initialization",
  ]);
});

await test("unobserved async work selects discarded calls and dead promise assignments", () => {
  const document = parser.parse(
    "work.ts",
    `export async function run() {
  client.sendAsync(payload);
  await client.flushAsync();
  return client.closeAsync();
}
export function observed() {
  const pending = client.sendAsync(payload);
  const awaited = client.flushAsync();
  const handled = client.closeAsync();
  const dead = client.writeFile(payload);
  await awaited;
  handled.catch(reportError);
  consume(client.flushAsync());
  if (client.isReady()) proceed();
  return pending;
}
`,
  );
  const rule = asyncRules().rules["no-unobserved-async-work"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    ["client.sendAsync(payload)", "client.writeFile(payload)"],
  );
  assert.equal(candidates[0]?.data?.["usage"], "expression");
  assert.equal(candidates[1]?.data?.["usage"], "assignment");
  const candidate = candidates[0];
  assert.ok(candidate?.question.type === "choice");
  assert.deepEqual(Object.keys(candidate.question.criteria), [
    "unobserved_async_work",
    "intentional_detached_work",
    "not_async_work",
    "insufficient_context",
  ]);
  assert.equal(rule.diagnose(answer("intentional_detached_work", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("not_async_work", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(
    rule.diagnose(answer("unobserved_async_work", 0.9, 0.7), candidate)?.message,
    "This async work appears to be started without observing its completion.",
  );
});

await test("async initialization selects real class constructors, not functions named constructor", () => {
  const document = parser.parse(
    "service.ts",
    `class Service {
  constructor() { this.ready = client.connectAsync(); }
  async start() { await client.connectAsync(); }
}
function constructor() { return client.connectAsync(); }
`,
  );
  const rule = asyncRules().rules["no-async-initialization"]();
  const candidates = rule.collect(document);

  assert.equal(candidates.length, 1);
  assert.match(candidates[0]!.target.source, /^constructor/u);
  assert.equal(candidates[0]!.data?.["role"], "constructor");
  assert.ok(candidates[0]!.question.type === "choice");
  assert.deepEqual(Object.keys(candidates[0]!.question.criteria), [
    "async_initialization",
    "synchronous_initialization",
    "deferred_or_explicit_lifecycle",
    "insufficient_context",
  ]);
  assert.equal(
    rule.diagnose(answer("deferred_or_explicit_lifecycle", 0.99, 0.99), candidates[0]!),
    null,
  );
  assert.equal(
    rule.diagnose(answer("async_initialization", 0.9, 0.7), candidates[0]!)?.message,
    "This constructor appears to start asynchronous initialization.",
  );
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
    imports_truncated: false,
    function:
      "async function concurrent(items: Item[]) {\n  return Promise.all(items.map((item) => run(item)));\n}",
    calls: [
      {
        callee: "Promise.all",
        source: "Promise.all(items.map((item) => run(item)))",
      },
      {
        callee: "items.map",
        source: "items.map((item) => run(item))",
      },
    ],
    calls_truncated: false,
    evidence_scope:
      "Bounded function-local source, imports, and calls only; unknown caller, callee, ownership, lifetime, and runtime behavior is not evidence.",
  });
  assert.deepEqual(candidates[0]?.data, {
    selected_callees: ["Promise.all"],
    function_characters: candidates[0]?.target.source.length,
    total_imports: 1,
    total_calls: 2,
    imports_truncated: false,
    calls_truncated: false,
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
export async function commented() {
  const first = await /* first */ loadOne();
  const second = await /* second */ loadTwo();
  return { first, second };
}
export function notAsync() {
  return loadOne();
}
`,
  );
  const candidates = asyncRules().rules["no-serial-independent-work"]().collect(document);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.split("(")[0]),
    ["async function two", "async function commented"],
  );
  const question = JSON.stringify(candidates[0]?.question);
  assert.match(question, /explicit local statement/u);
  assert.match(question, /safe to start together/u);
  assert.match(question, /neither independence nor required ordering/u);
  assert.match(question, /separate files alone do not establish/u);
});

await test("cancellation selection requires an AbortSignal and a known cancellable platform call", () => {
  const document = parser.parse(
    "request.ts",
    `export async function cancellable(url: string, signal: AbortSignal) {
  return fetch(url);
}
export async function ordinary(url: string) {
  return fetch(url);
}
export async function unsupported(entry: Entry, signal: AbortSignal) {
  return legacyAuditLog.append(entry);
}
export async function shadowed(fetch: Client, signal: AbortSignal) {
  return fetch("/jobs");
}
`,
  );
  const candidates = asyncRules().rules["require-cancellation-propagation"]().collect(document);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.target.source.includes("function cancellable"), true);
});

await test("race cleanup selection is deterministic and limited to native race combinators", () => {
  const document = parser.parse(
    "race.ts",
    `export async function all(tasks: Promise<void>[]) {
  return Promise.all(tasks);
}
export async function first(url: string) {
  return Promise.race([fetch(url), delay(1000)]);
}
export async function anyReplica(urls: [string, string]) {
  return Promise.any(urls.map((url) => fetch(url)));
}
export async function observe(tasks: Promise<void>[]) {
  return Promise.race(tasks);
}
export async function custom(Promise: RaceApi, tasks: Promise<void>[]) {
  return Promise.race(tasks);
}
`,
  );
  const candidates = asyncRules().rules["require-race-loser-cleanup"]().collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.split("(")[0]),
    ["async function first", "async function anyReplica", "async function observe"],
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.data?.["selected_callees"]),
    [["Promise.race"], ["Promise.any"], ["Promise.race"]],
  );
  const raceCandidate = candidates[0];
  assert.ok(raceCandidate);
  assert.strictEqual(raceCandidate.question.type, "choice");
  assert.deepEqual(Object.keys(raceCandidate.question.criteria), [
    "race_loser_abandoned",
    "loser_cleanup_present",
    "harmless_or_externally_owned",
    "insufficient_context",
  ]);
});

await test("abort listener cleanup selection excludes unrelated event targets and event types", () => {
  const document = parser.parse(
    "listeners.ts",
    `export function attach(cancellation: AbortSignal) {
  cancellation.addEventListener("abort", onAbort);
}
export function attachOnce(abortSignal: AbortSignal) {
  abortSignal.addEventListener("abort", onAbort, { once: true });
}
export function otherEvent(signal: AbortSignal) {
  signal.addEventListener("change", onChange);
}
export function otherTarget(target: EventTarget, signal: AbortSignal) {
  target.addEventListener("abort", onAbort);
}
export function misleadingName(signal: EventTarget) {
  signal.addEventListener("abort", onAbort);
}
`,
  );
  const candidates = asyncRules().rules["require-abort-listener-cleanup"]().collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.split("(")[0]),
    ["function attach", "function attachOnce"],
  );
  const listenerCandidate = candidates[0];
  assert.ok(listenerCandidate);
  assert.strictEqual(listenerCandidate.question.type, "choice");
  assert.deepEqual(Object.keys(listenerCandidate.question.criteria), [
    "abort_listener_may_leak",
    "listener_cleanup_present",
    "bounded_or_operation_owned",
    "insufficient_context",
  ]);
  assert.match(JSON.stringify(candidates[1]?.question), /once-only registration alone/u);
});

await test("async call-level evidence obeys function, import, and call budgets", () => {
  const document = parser.parse(
    "bounded-call.ts",
    `import { somethingVeryLong } from "./dependency.js";
export function run() {
  first();
  client.sendAsync(payload);
  last();
}`,
  );
  const bounded = asyncRules()
    .rules["no-unobserved-async-work"]({
      maxImportCharacters: 0,
      maxCallSites: 1,
    })
    .collect(document)[0];
  assert.ok(bounded);
  assert.match(
    JSON.stringify(bounded.state),
    /"imports":\[\],"imports_truncated":true[\s\S]*"calls":\[\{"callee":"first","source":"first\(\)"\}\],"calls_truncated":true/u,
  );
  assert.equal(
    asyncRules().rules["no-unobserved-async-work"]({ maxFunctionCharacters: 20 }).collect(document)
      .length,
    0,
  );
});

await test("async evidence is bounded without truncating function source", () => {
  const document = parser.parse(
    "bounded.ts",
    `import { process } from "./worker.js";
export async function run(items: Item[]) {
  return Promise.all(items.map((item) => process(item)));
}
`,
  );
  const rule = asyncRules().rules["no-unbounded-concurrency"]({
    maxImportCharacters: 5,
    maxCallSites: 1,
  });
  const candidate = rule.collect(document)[0];
  assert.ok(candidate);
  assert.deepEqual(candidate.state, {
    language: "typescript",
    imports: [],
    imports_truncated: true,
    function: candidate.target.source,
    calls: [
      {
        callee: "Promise.all",
        source: "Promise.all(items.map((item) => process(item)))",
      },
    ],
    calls_truncated: true,
    evidence_scope:
      "Bounded function-local source, imports, and calls only; unknown caller, callee, ownership, lifetime, and runtime behavior is not evidence.",
  });
  assert.equal(
    asyncRules().rules["no-unbounded-concurrency"]({ maxFunctionCharacters: 20 }).collect(document)
      .length,
    0,
  );
});

await test("async rule options reject invalid probabilities and evidence bounds", () => {
  const factory = asyncRules().rules["require-race-loser-cleanup"];
  assert.throws(
    () => Reflect.apply(factory, undefined, [{ threshold: -0.01 }]),
    /threshold must be an object/u,
  );
  assert.throws(() => factory({ minConfidence: Number.NaN }), /minConfidence/u);
  assert.throws(() => factory({ maxFunctionCharacters: 0 }), /maxFunctionCharacters/u);
  assert.throws(() => factory({ maxImportCharacters: -1 }), /maxImportCharacters/u);
  assert.throws(() => factory({ maxCallSites: 1.5 }), /maxCallSites/u);
  assert.doesNotThrow(() =>
    factory({
      threshold: { warning: 0, error: 1 },
      minConfidence: 1,
      maxFunctionCharacters: 1,
      maxImportCharacters: 0,
      maxCallSites: 0,
    }),
  );
});

await test("async rules diagnose only calibrated finding answers and otherwise abstain", () => {
  const document = parser.parse(
    "async.ts",
    `export async function run(items: Item[], signal: AbortSignal) {
  signal.addEventListener("abort", onAbort);
  await loadOne();
  await loadTwo();
  await fetch("/jobs");
  const first = Promise.race([fetch("/primary"), delay(1000)]);
  return Promise.all(items.map((item) => process(item)));
}
`,
  );
  const plugin = asyncRules();
  const cases = [
    ["no-unbounded-concurrency", "unbounded_concurrency", "bounded_or_intentional"],
    ["no-serial-independent-work", "serial_independent_work", "ordering_required"],
    [
      "require-cancellation-propagation",
      "cancellation_not_propagated",
      "cancellation_propagated_or_unavailable",
    ],
    ["require-race-loser-cleanup", "race_loser_abandoned", "loser_cleanup_present"],
    ["require-abort-listener-cleanup", "abort_listener_may_leak", "listener_cleanup_present"],
  ] as const;

  for (const [ruleName, finding, safeChoice] of cases) {
    const rule = plugin.rules[ruleName]();
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    assert.equal(rule.diagnose(answer(finding, 0.89, 0.99), candidate), null);
    assert.equal(rule.diagnose(answer(finding, 0.99, 0.69), candidate), null);
    assert.equal(rule.diagnose(answer(safeChoice, 0.99, 0.99), candidate), null);
    assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
    const diagnostic = rule.diagnose(answer(finding, 0.9, 0.7), candidate);
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "warning");
    assert.equal(diagnostic.filename, "async.ts");
    assert.equal(diagnostic.probability, 0.9);
    assert.equal(diagnostic.confidence, 0.7);
  }
});
