import assert from "node:assert/strict";
import test from "node:test";

import { configuration } from "@scruple/configuration";
import type { ChoiceAnswer } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

const plugin = configuration();
const parser = oxcParser();

const answer = (choice: string, probability: number, confidence: number): ChoiceAnswer => {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: probability },
  };
};

await test("configuration rules collect bounded environment evidence", () => {
  const prefix = `const unrelated = "${"x".repeat(4_200)}";\n`;
  const document = parser.parse(
    "config.ts",
    `${prefix}import { z } from "zod";\nconst secret = process.env.APP_SECRET;\n${" ".repeat(4_200)}`,
  );

  for (const factory of Object.values(plugin.rules)) {
    const candidates = factory().collect(document);
    assert.equal(candidates.length, 1);
    const candidate = candidates[0];
    assert.ok(candidate);
    assert.equal(candidate.target.source, "process.env.APP_SECRET");
    assert.deepEqual(candidate.target.location.start, { line: 3, column: 16 });
    assert.equal(candidate.question.type, "choice");
    assert.ok("insufficient_context" in candidate.question.criteria);

    const serializedState = JSON.stringify(candidate.state);
    assert.match(serializedState, /"evidence_scope":"single_file_bounded_excerpt"/u);
    assert.match(serializedState, /"truncated_before":true/u);
    assert.match(serializedState, /"truncated_after":true/u);
    assert.equal(candidate.target.enclosingSource?.length, 8_022);
  }
});

await test("configuration rules ignore files without a recognizable environment read", () => {
  const document = parser.parse("config.ts", `export const port = 3000;`);
  for (const factory of Object.values(plugin.rules)) {
    assert.deepEqual(factory().collect(document), []);
  }
});

await test("configuration rules collect each property, bracket, and whole-object environment read", () => {
  const document = parser.parse(
    "config.ts",
    `const one = process.env.ONE;
const two = process.env["TWO"];
const config = schema.parse(import.meta.env);`,
  );
  const candidates = plugin.rules["require-environment-validation"]().collect(document);
  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    ["process.env.ONE", `process.env["TWO"]`, "import.meta.env"],
  );
});

await test("no-insecure-production-defaults distinguishes production, development, and ambiguity", () => {
  const rule = plugin.rules["no-insecure-production-defaults"]();
  const candidate = rule.collect(
    parser.parse("config.ts", `export const secret = process.env.APP_SECRET ?? "public";`),
  )[0];
  assert.ok(candidate);

  assert.ok(rule.diagnose(answer("insecure_production_default", 0.9, 0.7), candidate));
  assert.equal(rule.diagnose(answer("development_only_default", 0.98, 0.95), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.98, 0.95), candidate), null);
  assert.equal(rule.diagnose(answer("insecure_production_default", 0.89, 0.99), candidate), null);
});

await test("require-environment-validation recognizes validation and abstains on ambiguity", () => {
  const rule = plugin.rules["require-environment-validation"]();
  const candidate = rule.collect(
    parser.parse(
      "config.ts",
      `import { z } from "zod";\nexport const config = z.object({ port: z.coerce.number().int() }).parse({ port: process.env.PORT });`,
    ),
  )[0];
  assert.ok(candidate);
  assert.equal(candidate.question.type, "choice");
  assert.match(JSON.stringify(candidate.question.instructions), /schema or framework validation/u);

  assert.equal(rule.diagnose(answer("validated", 0.98, 0.95), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.98, 0.95), candidate), null);
  assert.ok(rule.diagnose(answer("unvalidated", 0.9, 0.7), candidate));
});
