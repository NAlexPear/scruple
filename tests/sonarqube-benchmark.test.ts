import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseSonarIssues,
  summarizeCapabilities,
  validateFixtureMapping,
  // @ts-expect-error Node runs repository TypeScript directly and requires the runtime extension.
} from "../benchmarks/sonarqube/report.ts";

const readJson = async (url: URL): Promise<unknown> => JSON.parse(await readFile(url, "utf8"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const property = (value: unknown, name: string): unknown => {
  if (!isRecord(value) || !(name in value)) {
    throw new TypeError(`Expected object property ${name}`);
  }
  return value[name];
};

await test("SonarQube mapping covers and pins the benchmark fixtures", async () => {
  const corpus = await readJson(new URL("./eval-fixtures.json", import.meta.url));
  const benchmarkIds = await readJson(new URL("../benchmarks/fixtures.json", import.meta.url));
  const mapping = await readJson(
    new URL("../benchmarks/sonarqube/fixture-map.json", import.meta.url),
  );

  const fixtures = property(corpus, "fixtures");
  const entries = validateFixtureMapping(mapping, benchmarkIds, fixtures);
  assert.equal(entries.length, 10);
  assert.deepEqual(
    entries.filter((entry) => entry.coverage === "native").map((entry) => entry.id),
    ["swallowed-empty-catch"],
  );

  const drifted: unknown = JSON.parse(
    JSON.stringify(mapping).replace(
      "9b78d97fde463dfa8a9bae7deeed67e1fb7f31d10bd811e89f46f46dfb38c557",
      "0".repeat(64),
    ),
  );
  assert.throws(() => validateFixtureMapping(drifted, benchmarkIds, fixtures), /source drifted/u);
});

await test("SonarQube capability gaps do not count as misses", async () => {
  const corpus = await readJson(new URL("./eval-fixtures.json", import.meta.url));
  const benchmarkIds = await readJson(new URL("../benchmarks/fixtures.json", import.meta.url));
  const mapping = await readJson(
    new URL("../benchmarks/sonarqube/fixture-map.json", import.meta.url),
  );
  const entries = validateFixtureMapping(mapping, benchmarkIds, property(corpus, "fixtures"));
  const summary = summarizeCapabilities(
    entries,
    [
      {
        key: "issue-1",
        rule: "javascript:S2486",
        component: "scruple-sonarqube-benchmark:swallowed-empty-catch/worker.ts",
        message: "Either remove or fill this block of code.",
        status: "OPEN",
      },
    ],
    "scruple-sonarqube-benchmark",
  );

  assert.deepEqual(summary.native, {
    count: 1,
    ids: ["swallowed-empty-catch"],
  });
  assert.deepEqual(summary.custom, { count: 0, ids: [] });
  assert.equal(summary.unsupported.count, 9);
  assert.deepEqual(
    summary.unsupported.cases.map((entry) => entry.id),
    [
      "useless-restates-assignment",
      "async-independent-loads-serialized",
      "unactionable-generic-error",
      "database-join-done-in-memory",
      "resource-file-handle-falls-through",
      "authorization-gates-access-with-request-role",
      "vacuous-test-tautology",
      "validation-express-body-unchecked",
      "sensitive-log-redacted-token",
    ],
  );
  assert.deepEqual(summary.accuracy, {
    applicable: 1,
    detected: 1,
    misses: [],
    recall: 1,
  });
  assert.deepEqual(summarizeCapabilities(entries, [], "scruple-sonarqube-benchmark").accuracy, {
    applicable: 1,
    detected: 0,
    misses: ["swallowed-empty-catch"],
    recall: 0,
  });
});

await test("SonarQube issue parser preserves report fields", () => {
  assert.deepEqual(
    parseSonarIssues({
      paging: { pageIndex: 1, pageSize: 100, total: 1 },
      issues: [
        {
          key: "issue-1",
          rule: "javascript:S2486",
          component: "scruple-sonarqube-benchmark:swallowed-empty-catch/worker.ts",
          message: "Either remove or fill this block of code.",
          status: "OPEN",
          severity: "MAJOR",
          type: "CODE_SMELL",
          line: 4,
        },
      ],
    }),
    {
      total: 1,
      issues: [
        {
          key: "issue-1",
          rule: "javascript:S2486",
          component: "scruple-sonarqube-benchmark:swallowed-empty-catch/worker.ts",
          message: "Either remove or fill this block of code.",
          status: "OPEN",
          severity: "MAJOR",
          type: "CODE_SMELL",
          line: 4,
        },
      ],
    },
  );
  assert.throws(() => parseSonarIssues({ total: 1 }), /issues array/u);
  assert.throws(
    () => parseSonarIssues({ total: 1, issues: [{ key: "issue-1" }] }),
    /rule must be/u,
  );
});
