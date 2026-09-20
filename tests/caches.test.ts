import assert from "node:assert/strict";
import test from "node:test";

import { caches } from "@scruple/caches";
import type { ChoiceAnswer, RuleCandidate } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

const choice = (finding: string, probability: number, confidence: number): ChoiceAnswer => {
  return {
    type: "choice",
    choice: finding,
    confidence,
    probabilities: { [finding]: probability },
  };
};

const choiceCriteria = (candidate: RuleCandidate | undefined): string[] => {
  assert.ok(candidate);
  assert.equal(candidate.question.type, "choice");
  return Object.keys(candidate.question.criteria);
};

await test("caches plugin registers the initial rules", () => {
  assert.deepEqual(Object.keys(caches().rules), [
    "no-unsafe-cache-key",
    "require-cache-invalidation",
    "no-sensitive-cache-data",
  ]);
});

await test("cache operations are selected deterministically and targeted precisely", () => {
  const document = oxcParser().parse(
    "profile.ts",
    `import { userCache } from "./cache.js";
export async function refresh(tenantId: string, userId: string, profile: Profile) {
  const current = await userCache.get(tenantId + ":" + userId);
  await userCache.set(tenantId + ":" + userId, profile, { ttl: 60 });
  await userCache.invalidate(tenantId + ":" + userId);
  return current;
}
`,
  );
  const plugin = caches();
  const keyCandidates = plugin.rules["no-unsafe-cache-key"]().collect(document);
  const invalidationCandidates = plugin.rules["require-cache-invalidation"]().collect(document);
  const sensitiveCandidates = plugin.rules["no-sensitive-cache-data"]().collect(document);

  assert.deepEqual(
    keyCandidates.map((candidate) => candidate.data),
    [
      { operationKind: "read", callee: "userCache.get" },
      { operationKind: "write", callee: "userCache.set" },
      { operationKind: "invalidate", callee: "userCache.invalidate" },
    ],
  );
  assert.deepEqual(
    invalidationCandidates.map((candidate) => candidate.data),
    [{ operationKind: "write", callee: "userCache.set" }],
  );
  assert.deepEqual(
    sensitiveCandidates.map((candidate) => candidate.data),
    [{ operationKind: "write", callee: "userCache.set" }],
  );
  assert.equal(keyCandidates[0]?.target.kind, "expression");
  assert.deepEqual(keyCandidates[0]?.target.location.start, { line: 3, column: 25 });
  assert.match(JSON.stringify(keyCandidates[0]?.state), /selected_cache_operation/u);
  assert.match(JSON.stringify(keyCandidates[0]?.state), /cache_operations/u);
});

await test("generic calls are excluded while ambiguous cache wrappers reach abstention criteria", () => {
  const plugin = caches();
  const generic = oxcParser().parse(
    "repository.ts",
    "export function load(id: string) { return repository.get(id); }",
  );
  const wrapped = oxcParser().parse(
    "cache.ts",
    "export function load(id: string) { return profileCache.wrap(id, () => profiles.load(id)); }",
  );

  for (const factory of Object.values(plugin.rules)) {
    assert.equal(factory().collect(generic).length, 0);
    const candidates = factory().collect(wrapped);
    assert.equal(candidates.length, 1);
    assert.deepEqual(candidates[0]?.data, {
      operationKind: "ambiguous",
      callee: "profileCache.wrap",
    });
    assert.ok(choiceCriteria(candidates[0]).includes("insufficient_context"));
  }
});

await test("cache rules diagnose only their configured high-confidence findings", () => {
  const plugin = caches();
  const document = oxcParser().parse(
    "cache.ts",
    'export function save(tenantId: string, token: string) { return authCache.set("session", { token }); }',
  );
  const cases = [
    ["no-unsafe-cache-key", "unsafe_cross_scope_key"],
    ["require-cache-invalidation", "missing_visible_invalidation"],
    ["no-sensitive-cache-data", "plaintext_sensitive_data"],
  ] as const;

  for (const [ruleName, finding] of cases) {
    const rule = plugin.rules[ruleName]();
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    assert.ok(rule.diagnose(choice(finding, 0.99, 0.99), candidate));
    assert.equal(rule.diagnose(choice("insufficient_context", 0.99, 0.99), candidate), null);
    assert.equal(rule.diagnose(choice(finding, 0.99, 0.5), candidate), null);
  }
});

await test("unsafe cache keys preserve the calibrated default decision margin", () => {
  const rule = caches().rules["no-unsafe-cache-key"]();
  const document = oxcParser().parse(
    "cache.ts",
    'export function profile(userId: string) { return userCache.get("profile:current"); }',
  );
  const candidate = rule.collect(document)[0];
  assert.ok(candidate);

  assert.ok(rule.diagnose(choice("unsafe_cross_scope_key", 0.85, 0.7), candidate));
  assert.equal(rule.diagnose(choice("unsafe_cross_scope_key", 0.849, 0.7), candidate), null);
  assert.equal(rule.diagnose(choice("unsafe_cross_scope_key", 0.85, 0.699), candidate), null);
});

await test("custom operation patterns support project-specific cache clients", () => {
  const document = oxcParser().parse(
    "cache.ts",
    "export function load(id: string) { return memoLayer.lookup(id); }",
  );
  const candidates = caches()
    .rules["no-unsafe-cache-key"]({
      additionalReadPatterns: [/^memoLayer\.lookup$/u],
    })
    .collect(document);

  assert.deepEqual(candidates[0]?.data, {
    operationKind: "read",
    callee: "memoLayer.lookup",
  });
});
