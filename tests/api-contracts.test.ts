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
  for (const ruleName of ["no-ambiguous-failure-contracts", "require-input-validation"] as const) {
    const candidates = plugin.rules[ruleName]().collect(document);
    assert.deepEqual(
      candidates.map((candidate) => targetName(candidate)),
      ["declared", "arrow"],
    );
    assert.deepEqual(
      candidates.map((candidate) => candidate.data?.["exportEvidence"]),
      ["export", "export const arrow: (value: string) => string ="],
    );
  }
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
  assert.match(JSON.stringify(candidate.question), /choose insufficient_context/u);
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
      message: "This exported boundary appears to use untrusted input without runtime validation.",
    },
  ];

  for (const entry of cases) {
    const rule = plugin.rules[entry.ruleName]({ threshold: 0.8, minConfidence: 0.6 });
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    assert.equal(rule.diagnose(answer(entry.finding, 0.8, 0.6), candidate)?.message, entry.message);
  }
});
