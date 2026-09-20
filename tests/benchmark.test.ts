import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  ScruplePlugin,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";
import { parseEvalFixtures, type EvalFixture } from "@scruple/eval";
import {
  parseBenchmarkFixtureIds,
  runBenchmark,
  selectBenchmarkFixtures,
} from "@scruple/eval/benchmark";
import { parseBenchmarkOptions } from "@scruple/eval/benchmark-options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

await test("benchmark options pair providers, models, and run settings", () => {
  assert.deepEqual(
    parseBenchmarkOptions([
      "--provider",
      "jev",
      "--provider",
      "laya",
      "--model",
      "jev-test",
      "--model",
      "typed-decisions",
      "--fixture",
      "first",
      "--fixture",
      "second",
      "--warmups",
      "0",
      "--repetitions",
      "4",
      "--concurrency",
      "2",
    ]),
    {
      concurrency: 2,
      fixtureIds: ["first", "second"],
      help: false,
      repetitions: 4,
      specs: [
        { provider: "jev", model: "jev-test" },
        { provider: "laya", model: "typed-decisions" },
      ],
      warmups: 0,
    },
  );
  assert.throws(() => parseBenchmarkOptions([]), /at least one --provider/u);
  assert.throws(
    () => parseBenchmarkOptions(["--provider", "jev", "--repetitions", "0"]),
    /positive integer/u,
  );
});

await test("benchmark workload is stable, unique, and covers every plugin", async () => {
  const rawFixtures: unknown = JSON.parse(
    await readFile(new URL("./eval-fixtures.json", import.meta.url), "utf8"),
  );
  const rawIds: unknown = JSON.parse(
    await readFile(new URL("../benchmarks/fixtures.json", import.meta.url), "utf8"),
  );
  const fixtures = selectBenchmarkFixtures(
    parseEvalFixtures(rawFixtures),
    parseBenchmarkFixtureIds(rawIds),
  );
  const namespaces = new Set(fixtures.map((fixture) => fixture.ruleId.split("/")[0]));

  assert.equal(fixtures.length, 10);
  assert.deepEqual(namespaces, new Set(Object.keys(evaluationPlugins())));
  assert.throws(() => parseBenchmarkFixtureIds(["same", "same"]), /must be unique/u);
  assert.throws(
    () => selectBenchmarkFixtures(fixtures, ["missing-fixture"]),
    /Unknown benchmark fixture/u,
  );
});

const makeBenchmarkPlugin = (): ScruplePlugin => {
  return definePlugin({
    rules: {
      "bad-rule": () => ({
        description: "Benchmark fixture rule",
        collect(document) {
          const target = document.functions[0];
          return target === undefined
            ? []
            : [
                {
                  target,
                  state: { source: target.source },
                  question: { type: "noul", instructions: "Is this bad?" },
                },
              ];
        },
        diagnose(answer, candidate) {
          return answer.type === "noul" && answer.noul > 0.5
            ? {
                message: "Bad fixture",
                filename: candidate.target.filename,
                location: candidate.target.location,
              }
            : null;
        },
      }),
    },
  });
};

await test("benchmark excludes warmups and respects bounded concurrency", async () => {
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const provider: DecisionProvider = {
    id: "fixture",
    concurrency: 2,
    async evaluate(request): Promise<DecisionResponse> {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await setImmediate();
      active -= 1;
      const answers: Record<string, DecisionAnswer> = Object.fromEntries(
        Object.keys(request.questions).map((id) => [id, { type: "noul", noul: 0.1 }]),
      );
      return {
        model: "resolved-model",
        answers,
        usage: { inputTokens: 7, outputTokens: 3 },
      };
    },
  };
  const fixtures: EvalFixture[] = [
    {
      id: "first",
      filename: "first.ts",
      source: "function first() { return 1; }",
      ruleId: "test/bad-rule",
      expectedFinding: false,
      expectedCandidates: 1,
      expectedChoices: [],
      rationale: "The fixture provider accepts the first function.",
      tags: ["negative"],
    },
    {
      id: "second",
      filename: "second.ts",
      source: "function second() { return 1; }",
      ruleId: "test/bad-rule",
      expectedFinding: false,
      expectedCandidates: 1,
      expectedChoices: [],
      rationale: "The fixture provider accepts the good function.",
      tags: ["negative"],
    },
  ];

  const report = await runBenchmark({
    fixtures,
    parser: oxcParser(),
    plugins: { test: makeBenchmarkPlugin() },
    provider,
    providerName: "fixture",
    requestedModel: "requested-model",
    warmups: 1,
    repetitions: 2,
    concurrency: 2,
  });

  assert.equal(calls, 6);
  assert.equal(maximumActive, 2);
  assert.deepEqual(report.settings, { concurrency: 2, repetitions: 2, warmups: 1 });
  assert.deepEqual(report.resolvedModels, ["resolved-model"]);
  assert.deepEqual(report.summary.cases, { total: 4, passed: 4, failed: 0 });
  assert.deepEqual(report.summary.usage, {
    inputTokens: 28,
    modelCalls: 4,
    outputTokens: 12,
    perRepetition: { inputTokens: 14, modelCalls: 2, outputTokens: 6 },
  });
  assert.equal(report.samples.length, 2);
  assert.equal(
    report.samples.every((sample) => sample.failures.length === 0),
    true,
  );
  assert.equal(report.summary.durationMs.mean > 0, true);
  assert.equal(report.summary.caseLatencyMs.p95 > 0, true);
  assert.equal(report.summary.throughputCasesPerSecond > 0, true);
});
