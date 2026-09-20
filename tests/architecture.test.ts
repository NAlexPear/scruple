import assert from "node:assert/strict";
import test from "node:test";

import { architecture } from "@scruple/architecture";
import type { DecisionProvider } from "@scruple/core";
import { defineConfig, runScruple } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

const layers = [
  { name: "domain", files: ["src/domain/**"] },
  { name: "application", files: ["src/application/**"], allow: ["domain"] },
];

const rejectingProvider = (): DecisionProvider => {
  return {
    id: "must-not-run",
    evaluate() {
      return Promise.reject(new Error("deterministic repository rules must not call a provider"));
    },
  };
};

await test("parser captures static repository dependency evidence", () => {
  const source =
    'import { account } from "./account.js";\nexport { save } from "../application/save.js";\n';
  const document = oxcParser().parse("src/domain/index.ts", source);

  assert.deepEqual(
    document.moduleReferences.map((reference) => ({
      kind: reference.kind,
      specifier: reference.specifier,
      source: reference.source,
      location: reference.location,
    })),
    [
      {
        kind: "import",
        specifier: "./account.js",
        source: 'import { account } from "./account.js";',
        location: { start: { line: 1, column: 25 }, end: { line: 1, column: 39 } },
      },
      {
        kind: "export",
        specifier: "../application/save.js",
        source: 'export { save } from "../application/save.js";',
        location: { start: { line: 2, column: 22 }, end: { line: 2, column: 46 } },
      },
    ],
  );
});

await test("no-layer-violations checks the complete relative import graph without model calls", async () => {
  const provider = rejectingProvider();
  const result = await runScruple(
    defineConfig({
      parser: oxcParser(),
      provider,
      plugins: { architecture: architecture() },
      rules: { "architecture/no-layer-violations": ["error", { layers }] },
    }),
    [
      {
        filename: "src/application/service.ts",
        source:
          'import { Account } from "../domain/account.js";\nexport const service = Account;\n',
      },
      {
        filename: "src/domain/account.ts",
        source: "export const Account = {};\n",
      },
      {
        filename: "src/domain/public.ts",
        source:
          'export { service } from "../application/service.js";\nimport "@company/unresolved-alias";\n',
      },
    ],
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.stats, {
    files: 3,
    candidates: 0,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
  });
  assert.deepEqual(result.diagnostics, [
    {
      ruleId: "architecture/no-layer-violations",
      severity: "error",
      message: "Layer domain must not depend on layer application.",
      filename: "src/domain/public.ts",
      location: { start: { line: 1, column: 25 }, end: { line: 1, column: 52 } },
      model: "static",
    },
  ]);
});

await test("no-layer-violations rejects ambiguous layer membership", async () => {
  const result = await runScruple(
    defineConfig({
      parser: oxcParser(),
      provider: rejectingProvider(),
      plugins: { architecture: architecture() },
      rules: {
        "architecture/no-layer-violations": [
          "warn",
          {
            layers: [
              { name: "all", files: ["src/**"] },
              { name: "domain", files: ["src/domain/**"] },
            ],
          },
        ],
      },
    }),
    [{ filename: "src/domain/account.ts", source: "export const account = {};\n" }],
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]!.message, /matches multiple architecture layers/u);
});
