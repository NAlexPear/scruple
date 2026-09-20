import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyCodeqlCases,
  loadAndValidateCodeqlFixtures,
  parseCodeqlManifest,
  parseCodeqlSarif,
  summarizeCodeqlCases,
  type CodeqlAnalysisResult,
} from "@scruple/eval/codeql-benchmark";

const repositoryRoot = new URL("..", import.meta.url).pathname;

const loadManifest = async () =>
  parseCodeqlManifest(
    JSON.parse(
      await readFile(new URL("../benchmarks/codeql/fixtures.json", import.meta.url), "utf8"),
    ),
  );

const analysis = (
  kind: "official" | "custom",
  findings: CodeqlAnalysisResult["findings"],
): CodeqlAnalysisResult => ({
  kind,
  warmup: false,
  repetition: 1,
  findings,
  durationMs: 1,
  exitCode: 0,
  error: null,
  stderr: null,
});

await test("CodeQL fixture mapping pins every benchmark fixture and its source", async () => {
  const manifest = await loadManifest();
  const fixtures = await loadAndValidateCodeqlFixtures(repositoryRoot, manifest);

  assert.equal(fixtures.length, 10);
  assert.deepEqual(
    fixtures.map((fixture) => fixture.id),
    manifest.cases.map((entry) => entry.id),
  );

  const drifted = structuredClone(manifest);
  drifted.cases[0]!.sourceSha256 = "0".repeat(64);
  await assert.rejects(
    loadAndValidateCodeqlFixtures(repositoryRoot, drifted),
    /CodeQL fixture drift/u,
  );
});

await test("CodeQL SARIF parser maps encoded fixture paths and preserves report details", () => {
  const findings = parseCodeqlSarif(
    {
      runs: [
        {
          results: [
            {
              ruleId: "js/example",
              message: { text: "Example finding" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: {
                      uri: "file:///tmp/source/vacuous-test-tautology/service.test.ts",
                    },
                    region: { startLine: 3 },
                  },
                },
              ],
            },
            {
              ruleId: "js/no-location",
              message: { text: "No location" },
            },
          ],
        },
      ],
    },
    new Set(["vacuous-test-tautology"]),
  );

  assert.deepEqual(findings, [
    {
      fixtureId: "vacuous-test-tautology",
      ruleId: "js/example",
      message: "Example finding",
      uri: "file:///tmp/source/vacuous-test-tautology/service.test.ts",
      startLine: 3,
    },
    {
      fixtureId: null,
      ruleId: "js/no-location",
      message: "No location",
      uri: null,
      startLine: null,
    },
  ]);
  assert.throws(() => parseCodeqlSarif({}, new Set()), /must contain runs/u);
});

await test("CodeQL classifications and denominators separate native, custom, and unsupported coverage", async () => {
  const manifest = await loadManifest();
  const fixtures = await loadAndValidateCodeqlFixtures(repositoryRoot, manifest);
  const cases = classifyCodeqlCases(manifest, fixtures, [
    analysis("official", []),
    analysis("custom", [
      {
        fixtureId: "vacuous-test-tautology",
        ruleId: "scruple/tautological-assert-equal",
        message: "Tautology",
        uri: "vacuous-test-tautology/service.test.ts",
        startLine: 3,
      },
    ]),
  ]);

  assert.equal(
    cases.find((entry) => entry.id === "sensitive-log-redacted-token")?.status,
    "matched",
  );
  assert.equal(
    cases.find((entry) => entry.id === "authorization-gates-access-with-request-role")?.status,
    "miss",
  );
  assert.equal(cases.find((entry) => entry.id === "vacuous-test-tautology")?.status, "matched");
  assert.equal(cases.find((entry) => entry.id === "swallowed-empty-catch")?.status, "unsupported");
  assert.deepEqual(summarizeCodeqlCases(cases), {
    native: { denominator: 2, matched: 1, misses: 1, errors: 0, accuracy: 0.5 },
    custom: { denominator: 1, matched: 1, misses: 0, errors: 0, accuracy: 1 },
    unsupported: {
      count: 7,
      cases: manifest.cases
        .filter((entry) => entry.scope === "unsupported")
        .map((entry) => ({ id: entry.id, reason: entry.reason })),
    },
  });
});
