import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseEvalFixtures } from "@scruple/eval";
import { parseBenchmarkFixtureIds, selectBenchmarkFixtures } from "@scruple/eval/benchmark";
import {
  parseSemgrepCaseMappings,
  parseSemgrepOutput,
  summarizeSemgrepCases,
  validateSemgrepMappings,
  type SemgrepCaseResult,
} from "@scruple/eval/semgrep-benchmark";
import { parseSemgrepBenchmarkOptions } from "@scruple/eval/semgrep-benchmark-options";

const readJson = async (url: URL): Promise<unknown> => JSON.parse(await readFile(url, "utf8"));

const caseResult = (
  id: string,
  expectedFinding: boolean,
  status: SemgrepCaseResult["status"],
): SemgrepCaseResult => ({
  id,
  expectedFinding,
  coverage: "benchmark_owned",
  status,
  findingCount: status === "hit" ? 1 : 0,
  ruleIds: status === "hit" ? ["fixture.rule"] : [],
});

await test("Semgrep benchmark options keep profiles and run counts explicit", () => {
  assert.deepEqual(
    parseSemgrepBenchmarkOptions([
      "--profile",
      "benchmark-owned",
      "--semgrep-bin",
      "/opt/semgrep",
      "--warmups",
      "0",
      "--repetitions",
      "2",
    ]),
    {
      help: false,
      profiles: ["benchmark-owned"],
      repetitions: 2,
      semgrepBin: "/opt/semgrep",
      warmups: 0,
    },
  );
  assert.deepEqual(parseSemgrepBenchmarkOptions([]).profiles, [
    "official-default",
    "benchmark-owned",
  ]);
  assert.throws(
    () => parseSemgrepBenchmarkOptions(["--profile", "unknown"]),
    /Unknown Semgrep benchmark profile/u,
  );
  assert.throws(() => parseSemgrepBenchmarkOptions(["--repetitions", "0"]), /positive integer/u);
});

await test("Semgrep mappings pin every selected fixture and detect corpus drift", async () => {
  const fixtures = selectBenchmarkFixtures(
    parseEvalFixtures(await readJson(new URL("./eval-fixtures.json", import.meta.url))),
    parseBenchmarkFixtureIds(
      await readJson(new URL("../benchmarks/fixtures.json", import.meta.url)),
    ),
  );
  const mappings = parseSemgrepCaseMappings(
    await readJson(new URL("../benchmarks/semgrep/cases.json", import.meta.url)),
  );

  assert.equal(mappings.length, fixtures.length);
  assert.equal(mappings.filter((mapping) => mapping.coverage === "benchmark_owned").length, 5);
  assert.equal(mappings.filter((mapping) => mapping.coverage === "unsupported").length, 5);
  assert.doesNotThrow(() => {
    validateSemgrepMappings(fixtures, mappings);
  });
  assert.throws(() => {
    validateSemgrepMappings(
      [{ ...fixtures[0]!, source: "changed" }, ...fixtures.slice(1)],
      mappings,
    );
  }, /fixture drifted/u);
});

await test("Semgrep summary excludes unsupported cases and reserves miss for applicable rules", () => {
  const cases: SemgrepCaseResult[] = [
    caseResult("detected", true, "hit"),
    caseResult("missed", true, "miss"),
    caseResult("safe", false, "correct_rejection"),
    {
      ...caseResult("semantic-gap", true, "unsupported"),
      coverage: "unsupported",
      reason: "Requires semantic reasoning.",
    },
  ];

  assert.deepEqual(summarizeSemgrepCases(cases), {
    supported: 3,
    correct: 2,
    misses: 1,
    falsePositives: 0,
    accuracy: 2 / 3,
    expectedIssues: 2,
    detectedExpectedIssues: 1,
    recall: 1 / 2,
    unsupported: { count: 1, ids: ["semantic-gap"] },
  });
  assert.deepEqual(
    summarizeSemgrepCases([
      {
        ...caseResult("only-gap", true, "unsupported"),
        coverage: "unsupported",
        reason: "No applicable native rule.",
      },
    ]),
    {
      supported: 0,
      correct: 0,
      misses: 0,
      falsePositives: 0,
      accuracy: null,
      expectedIssues: 0,
      detectedExpectedIssues: 0,
      recall: null,
      unsupported: { count: 1, ids: ["only-gap"] },
    },
  );
});

await test("Semgrep JSON parser preserves findings, errors, and tool version", () => {
  assert.deepEqual(
    parseSemgrepOutput(
      JSON.stringify({
        version: "1.177.0",
        results: [
          {
            check_id: "official.rule",
            path: "fixture/example.ts",
            start: { line: 7, col: 3 },
          },
        ],
        errors: [{ type: "PartialParsing", path: "fixture/example.ts" }],
      }),
    ),
    {
      version: "1.177.0",
      findings: [{ checkId: "official.rule", path: "fixture/example.ts", line: 7 }],
      errors: [{ type: "PartialParsing", path: "fixture/example.ts" }],
    },
  );
  assert.throws(
    () => parseSemgrepOutput('{"version":"1.177.0","results":[]}'),
    /results and errors arrays/u,
  );
  assert.throws(
    () =>
      parseSemgrepOutput(
        '{"version":"1.177.0","results":[{"check_id":"rule","path":"x.ts"}],"errors":[]}',
      ),
    /finding location/u,
  );
});
