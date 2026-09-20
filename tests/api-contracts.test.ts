import assert from "node:assert/strict";
import test from "node:test";

import { apiContracts } from "@scruple/api-contracts";
import type { ChoiceAnswer, RuleCandidate } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

const answer = (choice: string, probability: number, confidence: number): ChoiceAnswer => {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: probability },
  };
};

const targetName = (candidate: RuleCandidate): string | undefined => {
  const { target } = candidate;
  const name = "name" in target ? target.name : undefined;
  return typeof name === "string" ? name : undefined;
};

await test("API contracts plugin registers ignored significant results", () => {
  assert.ok("no-ignored-significant-results" in apiContracts().rules);
});

await test("ignored significant results selects bare calls but not used results", () => {
  const document = oxcParser().parse(
    "contracts.ts",
    `export async function update() {
  repository.save(record);
  await repository.save(other);
  return repository.delete(id);
}
export function consume() {
  const result = validator.parse(input);
  report(validator.parse(other));
  if (cache.has(key)) return result;
}
`,
  );
  const rule = apiContracts().rules["no-ignored-significant-results"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    ["repository.save(record)"],
  );
  assert.equal(candidates[0]?.data?.["usage"], "expression");
  const candidate = candidates[0];
  assert.ok(candidate?.question.type === "choice");
  assert.deepEqual(Object.keys(candidate.question.criteria), [
    "ignored_significant_result",
    "result_intentionally_ignored",
    "no_significant_result",
    "insufficient_context",
  ]);
  assert.equal(rule.diagnose(answer("result_intentionally_ignored", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("no_significant_result", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(
    rule.diagnose(answer("ignored_significant_result", 0.9, 0.7), candidate)?.message,
    "This call appears to ignore a result that carries significant outcome information.",
  );
});

await test("API contract rules select a deterministic bounded subset", () => {
  const document = oxcParser().parse(
    "contracts.ts",
    `function internalHelper() { return 1; }
export function declared(value: string) { return value; }
export const arrow: (value: string) => string = (value) => value;
function listedLater() { return 2; }
export { listedLater };
test("contract", () => assert.equal(declared("a"), "a"));
`,
  );
  const plugin = apiContracts();

  assert.deepEqual(
    plugin.rules["no-misleading-function-names"]()
      .collect(document)
      .map((candidate) => targetName(candidate)),
    ["internalHelper", "declared", "arrow", "listedLater"],
  );
  const failureCandidates = plugin.rules["no-ambiguous-failure-contracts"]().collect(document);
  assert.deepEqual(
    failureCandidates.map((candidate) => targetName(candidate)),
    ["declared", "arrow"],
  );
  assert.deepEqual(
    failureCandidates.map((candidate) => candidate.data?.["exportEvidence"]),
    ["export", "export const arrow: (value: string) => string ="],
  );
  assert.deepEqual(plugin.rules["require-input-validation"]().collect(document), []);
});

await test("API contract evidence includes context and an explicit caller limitation", () => {
  const marker = "const domainLimit = 50;";
  const document = oxcParser().parse(
    "contracts.ts",
    `${marker}\nexport function parseLimit(raw: unknown) { return Number(raw); }\n`,
  );
  const candidate = apiContracts().rules["require-input-validation"]().collect(document)[0];
  assert.ok(candidate);
  const evidence = JSON.stringify(candidate.state);

  assert.match(evidence, /parseLimit/u);
  assert.match(evidence, /domainLimit/u);
  assert.match(evidence, /does not establish all callers/u);
  assert.match(JSON.stringify(candidate.question), /Choose insufficient_context/u);
});

await test("input validation uses normalized routes and preserves explicit raw export fallback", () => {
  const document = oxcParser().parse(
    "server.ts",
    `import Fastify from "fastify";
const app = Fastify();
app.post("/users", { schema: { body: userSchema } }, async (request, reply) => reply.send(await users.create(request.body)));
export function receiveWebhook(payload: unknown) { return events.publish(payload); }`,
  );
  const candidates = apiContracts().rules["require-input-validation"]().collect(document);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]?.target.kind, "api-boundary");
  assert.equal(candidates[0]?.data?.["evidenceKind"], "normalized_api_boundary");
  assert.match(JSON.stringify(candidates[0]?.state), /userSchema/u);
  assert.match(JSON.stringify(candidates[0]?.state), /request\.body/u);
  const fallback = candidates[1];
  assert.ok(fallback);
  assert.equal(targetName(fallback), "receiveWebhook");
  assert.equal(fallback.data?.["evidenceKind"], "explicit_raw_export");
});

await test("route rules use deterministic method, effect, and status prefilters", () => {
  const document = oxcParser().parse(
    "server.ts",
    `import express from "express";
const app = express();
app.get("/users/:id/delete", (req, res) => res.status(200).json(users.delete(req.params.id)));
app.get("/users/:id", (req, res) => res.status(200).json(users.find(req.params.id)));
app.post("/users/:id", (req, res) => res.status(202).json(users.update(req.params.id)));
`,
  );
  const plugin = apiContracts();
  const effectCandidates = plugin.rules["no-side-effects-in-safe-http-methods"]().collect(document);
  const statusCandidates = plugin.rules["no-misleading-http-status"]().collect(document);

  assert.equal(effectCandidates.length, 1);
  assert.match(JSON.stringify(effectCandidates[0]?.state), /users\.delete/u);
  assert.equal(statusCandidates.length, 3);
  assert.match(JSON.stringify(statusCandidates[0]?.state), /"method":"GET"/u);
  assert.match(JSON.stringify(statusCandidates[1]?.state), /"method":"GET"/u);
  assert.match(JSON.stringify(statusCandidates[2]?.state), /"method":"POST"/u);
  assert.match(JSON.stringify(statusCandidates[0]?.state), /"status":200/u);
});

await test("API contract rules abstain unless the configured decision margin is met", () => {
  const plugin = apiContracts();
  const document = oxcParser().parse(
    "contracts.ts",
    "export function loadUser(id: string) { return users.delete(id); }",
  );
  const candidate = plugin.rules["no-misleading-function-names"]().collect(document)[0];
  assert.ok(candidate);
  const rule = plugin.rules["no-misleading-function-names"]();

  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("misleading_name", 0.89, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("misleading_name", 0.99, 0.69), candidate), null);
  assert.deepEqual(rule.diagnose(answer("misleading_name", 0.9, 0.7), candidate), {
    message: "This function name appears to contradict its visible behavior.",
    filename: "contracts.ts",
    location: candidate.target.location,
    probability: 0.9,
    confidence: 0.7,
  });

  const failureRule = plugin.rules["no-ambiguous-failure-contracts"]();
  assert.equal(
    failureRule.diagnose(answer("ambiguous_failure_contract", 0.79, 0.9), candidate),
    null,
  );
  assert.ok(failureRule.diagnose(answer("ambiguous_failure_contract", 0.8, 0.7), candidate));
});

await test("each API contract rule emits only its stable diagnostic", () => {
  const plugin = apiContracts();
  const document = oxcParser().parse(
    "contracts.ts",
    "export function handle(request: unknown) { return request; }",
  );
  const cases: Array<{
    ruleName: keyof ReturnType<typeof apiContracts>["rules"];
    finding: string;
    message: string;
  }> = [
    {
      ruleName: "no-misleading-function-names",
      finding: "misleading_name",
      message: "This function name appears to contradict its visible behavior.",
    },
    {
      ruleName: "no-ambiguous-failure-contracts",
      finding: "ambiguous_failure_contract",
      message: "This exported function appears to expose an ambiguous failure contract.",
    },
    {
      ruleName: "require-input-validation",
      finding: "validation_required",
      message: "This API boundary appears to use untrusted input without runtime validation.",
    },
  ];

  for (const entry of cases) {
    const rule = plugin.rules[entry.ruleName]({ threshold: 0.8, minConfidence: 0.6 });
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    assert.equal(rule.diagnose(answer(entry.finding, 0.8, 0.6), candidate)?.message, entry.message);
  }
});

await test("new route rules abstain below thresholds and emit stable diagnostics", () => {
  const document = oxcParser().parse(
    "server.ts",
    `import express from "express";
const app = express();
app.get("/users/:id/delete", (req, res) => res.status(200).json(users.delete(req.params.id)));`,
  );
  const plugin = apiContracts();
  const cases = [
    {
      ruleName: "no-side-effects-in-safe-http-methods" as const,
      finding: "requested_side_effect",
      message: "This safe-method route appears to perform a requested state change.",
    },
    {
      ruleName: "no-misleading-http-status" as const,
      finding: "misleading_status",
      message: "This route appears to emit an HTTP status that contradicts its visible outcome.",
    },
  ];

  for (const entry of cases) {
    const rule = plugin.rules[entry.ruleName]();
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    assert.equal(rule.diagnose(answer(entry.finding, 0.89, 0.99), candidate), null);
    assert.equal(rule.diagnose(answer(entry.finding, 0.99, 0.74), candidate), null);
    assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
    assert.equal(
      rule.diagnose(answer(entry.finding, 0.9, 0.75), candidate)?.message,
      entry.message,
    );
  }
});
