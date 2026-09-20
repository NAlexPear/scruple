import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionAnswer, RuleCandidate } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { tests } from "@scruple/tests";

const choice = (selected: string, probability: number, confidence: number): DecisionAnswer => {
  return {
    type: "choice",
    choice: selected,
    confidence,
    probabilities: { [selected]: probability },
  };
};

const criteriaOf = (candidate: RuleCandidate): Record<string, unknown> => {
  assert.equal(candidate.question.type, "choice");
  return candidate.question.criteria;
};

const selectedTestNames = (candidates: RuleCandidate[]): Array<string | undefined> => {
  return candidates.map(
    (candidate) => candidate.target.enclosingSource?.match(/test\("([^"]+)/u)?.[1],
  );
};

await test("tests plugin registers all semantic test rules", () => {
  assert.deepEqual(Object.keys(tests().rules), [
    "no-vacuous-tests",
    "require-specific-error-assertions",
    "no-fixed-delay-synchronization",
    "no-nondeterministic-tests",
  ]);
});

await test("nondeterministic tests select randomness and wall-clock access with control context", () => {
  const rule = tests().rules["no-nondeterministic-tests"]();
  const candidates = rule.collect(
    oxcParser().parse(
      "random.test.ts",
      `test("uses uncontrolled randomness", () => expect(sample(Math.random())).toBeDefined());
test("uses the wall clock", () => expect(expiresAt()).toBeGreaterThan(Date.now()));
test("uses fake controls", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.setSystemTime(new Date("2020-01-01"));
  expect(sample(Math.random())).toEqual(expected);
  expect(Date.now()).toBe(1577836800000);
});
test("uses injected controls", () => {
  expect(createToken({ random: () => 0.5, now: () => 123 })).toEqual(expected);
});
`,
    ),
  );

  assert.deepEqual(selectedTestNames(candidates), [
    "uses uncontrolled randomness",
    "uses the wall clock",
    "uses fake controls",
  ]);
  const candidate = candidates[0];
  assert.ok(candidate);
  assert.deepEqual(Object.keys(criteriaOf(candidate)), [
    "uncontrolled_nondeterminism",
    "controlled_nondeterminism",
    "intentional_nondeterministic_test",
    "insufficient_context",
  ]);
  assert.equal(
    rule.diagnose(choice("controlled_nondeterminism", 0.99, 0.99), candidates[2]!),
    null,
  );
  assert.equal(rule.diagnose(choice("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(
    rule.diagnose(choice("uncontrolled_nondeterminism", 0.9, 0.7), candidate)?.message,
    "Control randomness or time so this test is deterministic.",
  );
});

await test("no-vacuous-tests distinguishes explicit checks, intentional smoke tests, and vacuity", () => {
  const rule = tests().rules["no-vacuous-tests"]();
  const candidates = rule.collect(
    oxcParser().parse(
      "plugin.test.ts",
      `import { test } from "node:test";

test("plugin loads without throwing", () => {
  loadPlugin(fixture);
});

test("creates a persisted user", async () => {
  await createUser({ name: "Ada" });
});
`,
    ),
  );
  assert.equal(candidates.length, 2);
  const smokeCandidate = candidates[0];
  const resultCandidate = candidates[1];
  assert.ok(smokeCandidate);
  assert.ok(resultCandidate);

  assert.deepEqual(Object.keys(criteriaOf(smokeCandidate)), [
    "meaningful_explicit_verification",
    "intentional_smoke_oracle",
    "vacuous",
    "insufficient_context",
  ]);
  assert.equal(rule.diagnose(choice("intentional_smoke_oracle", 0.99, 0.99), smokeCandidate), null);
  assert.equal(
    rule.diagnose(choice("meaningful_explicit_verification", 0.99, 0.99), smokeCandidate),
    null,
  );
  assert.equal(rule.diagnose(choice("insufficient_context", 0.99, 0.99), smokeCandidate), null);
  assert.equal(
    rule.diagnose(choice("vacuous", 0.9, 0.7), resultCandidate)?.message,
    "This test appears to have no effective verification of behavior.",
  );
});

await test("specific-error rule selects visible throw and rejection assertions only", () => {
  const candidates = tests()
    .rules["require-specific-error-assertions"]()
    .collect(
      oxcParser().parse(
        "errors.test.ts",
        `import assert from "node:assert/strict";
import { expect as chaiExpect } from "chai";
import { expect, test } from "vitest";
import { assertAuthenticationFailure } from "./helpers.js";

test("rejects malformed input", () => {
  assert.throws(() => parsePayload("{"), SyntaxError);
});

test("rejects a missing user", async () => {
  await expect(loadUser("missing")).rejects.toThrow();
});

test("rejects an expired token with its stable code", async () => {
  await expect(verifyToken("expired")).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
});

test("rejects an invalid range", () => {
  chaiExpect(() => parseRange("5-1")).to.throw(RangeError);
});

test("returns a user", async () => {
  expect((await loadUser("ada")).name).toBe("Ada");
});

test("rejects an invalid session", async () => {
  await assertAuthenticationFailure(login("expired"));
});
`,
      ),
    );

  assert.deepEqual(selectedTestNames(candidates), [
    "rejects malformed input",
    "rejects a missing user",
    "rejects an expired token with its stable code",
    "rejects an invalid range",
  ]);
  assert.deepEqual(Object.keys(criteriaOf(candidates[0]!)), [
    "specific_error_contract",
    "underspecified_error_oracle",
    "intentionally_generic_failure",
    "insufficient_context",
  ]);
});

await test("specific-error rule abstains for generic and opaque contracts", () => {
  const rule = tests().rules["require-specific-error-assertions"]({
    assertionCallPatterns: [/assertAuthenticationFailure$/gu],
  });
  const candidate = rule.collect(
    oxcParser().parse(
      "auth.test.ts",
      `import { assertAuthenticationFailure } from "./helpers.js";
test("rejects an invalid session", async () => {
  await assertAuthenticationFailure(login("expired"));
});`,
    ),
  )[0];
  assert.ok(candidate);

  assert.equal(rule.diagnose(choice("intentionally_generic_failure", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(choice("insufficient_context", 0.99, 0.99), candidate), null);
});

await test("fixed-delay rule selects sleeps and direct timers but not condition waits", () => {
  const candidates = tests()
    .rules["no-fixed-delay-synchronization"]()
    .collect(
      oxcParser().parse(
        "ready.test.ts",
        `import { expect, test, vi } from "vitest";

test("becomes ready after work", async () => {
  startWork();
  await sleep(500);
  expect(status()).toBe("ready");
});

test("renders the result", async ({ page }) => {
  await page.waitForTimeout(500);
  await expect(page.getByText("Done")).toBeVisible();
});

test("flushes a callback", async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(flushed()).toBe(true);
});

test("waits for the result condition", async () => {
  await waitFor(() => expect(status()).toBe("ready"));
});

test("debounces for 500 milliseconds", () => {
  vi.useFakeTimers();
  scheduleSearch();
  vi.advanceTimersByTime(500);
  expect(search).toHaveBeenCalled();
});

test("documents a timer fixture", () => {
  const fixture = \`setTimeout(resolve, 500)\`;
  expect(fixture).toContain("setTimeout");
});
`,
      ),
    );

  assert.deepEqual(selectedTestNames(candidates), [
    "becomes ready after work",
    "renders the result",
    "flushes a callback",
  ]);
  assert.deepEqual(Object.keys(criteriaOf(candidates[0]!)), [
    "fixed_delay_synchronization",
    "condition_based_wait",
    "controlled_time_test",
    "intentional_real_time_test",
    "insufficient_context",
  ]);
});

await test("fixed-delay rule preserves controlled-time choices and opaque-helper abstention", () => {
  const rule = tests().rules["no-fixed-delay-synchronization"]({
    delayCallPatterns: [/waitForReplica$/gu],
  });
  const candidate = rule.collect(
    oxcParser().parse(
      "replica.test.ts",
      `import { waitForReplica } from "./helpers.js";
test("reads replicated data", async () => {
  await waitForReplica();
  expect(await readReplica()).toEqual(record);
});`,
    ),
  )[0];
  assert.ok(candidate);

  assert.equal(rule.diagnose(choice("controlled_time_test", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(choice("intentional_real_time_test", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(choice("insufficient_context", 0.99, 0.99), candidate), null);
});

await test("new test diagnostics use conservative margins and stable messages", () => {
  const plugin = tests();
  const cases = [
    {
      rule: plugin.rules["require-specific-error-assertions"](),
      source: 'test("rejects invalid input", () => assert.throws(() => parse("{")));',
      finding: "underspecified_error_oracle",
      message: "Assert the expected error type or another stable failure property.",
    },
    {
      rule: plugin.rules["no-fixed-delay-synchronization"](),
      source:
        'test("becomes ready", async () => { await sleep(100); expect(ready()).toBe(true); });',
      finding: "fixed_delay_synchronization",
      message: "Wait for an observable condition instead of using a fixed delay.",
    },
  ];

  for (const entry of cases) {
    const candidate = entry.rule.collect(oxcParser().parse("one.test.ts", entry.source))[0];
    assert.ok(candidate);
    assert.equal(
      entry.rule.diagnose(choice(entry.finding, 0.9, 0.7), candidate)?.message,
      entry.message,
    );
    assert.equal(entry.rule.diagnose(choice(entry.finding, 0.89, 0.99), candidate), null);
    assert.equal(entry.rule.diagnose(choice(entry.finding, 0.99, 0.69), candidate), null);
  }

  assert.throws(
    () => plugin.rules["require-specific-error-assertions"]({ threshold: 1.1 }),
    /threshold must be a finite number/u,
  );
  assert.throws(
    () => plugin.rules["no-fixed-delay-synchronization"]({ minConfidence: Number.NaN }),
    /minConfidence must be a finite number/u,
  );
});
