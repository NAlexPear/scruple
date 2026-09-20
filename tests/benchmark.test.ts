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
  sizeBenchmarkWorkload,
} from "@scruple/eval/benchmark";
import { parseBenchmarkOptions } from "@scruple/eval/benchmark-options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

await test("benchmark options support repeated Jev models and run settings", () => {
  assert.deepEqual(
    parseBenchmarkOptions([
      "--model",
      "jev-stable",
      "--model",
      "jev-candidate",
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
      "--workload-size",
      "5",
    ]),
    {
      concurrency: 2,
      fixtureIds: ["first", "second"],
      help: false,
      models: ["jev-stable", "jev-candidate"],
      repetitions: 4,
      warmups: 0,
      workloadSize: 5,
    },
  );
  assert.deepEqual(parseBenchmarkOptions([]).models, ["jev-1.13.0"]);
  assert.throws(() => parseBenchmarkOptions(["--repetitions", "0"]), /positive integer/u);
  assert.throws(() => parseBenchmarkOptions(["--workload-size", "0"]), /positive integer/u);
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
  assert.deepEqual(
    sizeBenchmarkWorkload(fixtures.slice(0, 2), 5).map((fixture) => fixture.id),
    [fixtures[0]?.id, fixtures[1]?.id, fixtures[0]?.id, fixtures[1]?.id, fixtures[0]?.id],
  );
  assert.throws(() => sizeBenchmarkWorkload([], 5), /empty benchmark workload/u);
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

const makeChoiceBenchmarkPlugin = (): ScruplePlugin => {
  return definePlugin({
    rules: {
      "choice-rule": () => ({
        description: "Benchmark choice outcomes",
        collect(document) {
          const target = document.functions[0];
          return target === undefined
            ? []
            : [
                {
                  target,
                  state: { source: target.source },
                  question: {
                    type: "choice",
                    instructions: "Classify this fixture.",
                    criteria: {
                      finding: "Report a diagnostic.",
                      safe: "Do not report a diagnostic.",
                      insufficient_context: "Abstain.",
                    },
                  },
                },
              ];
        },
        diagnose(answer, candidate) {
          return answer.type === "choice" &&
            answer.choice === "finding" &&
            (answer.probabilities["finding"] ?? 0) >= 0.9 &&
            answer.confidence >= 0.7
            ? {
                message: "Choice finding",
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
  assert.deepEqual(report.summary.outcomes, {
    labelAgreement: { correct: 4, incorrect: 0, rate: 1, total: 4 },
    diagnosticAgreement: { correct: 4, incorrect: 0, rate: 1, total: 4 },
    abstentions: { correct: 4, incorrect: 0, rate: 1, total: 4, actual: 0, expected: 0 },
    strictAgreement: { correct: 4, incorrect: 0, rate: 1, total: 4 },
  });
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

await test("benchmark separates labels, diagnostics, abstentions, and strict agreement", async () => {
  const provider: DecisionProvider = {
    id: "choice-fixture",
    evaluate(request): Promise<DecisionResponse> {
      const source = JSON.stringify(request.state);
      const answer = new Map<boolean, DecisionAnswer>([
        [
          true,
          {
            type: "choice",
            choice: "insufficient_context",
            confidence: 1,
            probabilities: { finding: 0, safe: 0, insufficient_context: 1 },
          },
        ],
        [
          false,
          {
            type: "choice",
            choice: "finding",
            confidence: 1,
            probabilities: { finding: 0.5, safe: 0.5, insufficient_context: 0 },
          },
        ],
      ]).get(source.includes("abstain"));
      assert.ok(answer);
      return Promise.resolve({
        model: "choice-model",
        answers: Object.fromEntries(Object.keys(request.questions).map((id) => [id, answer])),
      });
    },
  };
  const fixtures: EvalFixture[] = [
    {
      id: "label-only",
      filename: "label-only.ts",
      source: "function labelOnly() {}",
      ruleId: "test/choice-rule",
      expectedFinding: true,
      expectedCandidates: 1,
      expectedChoices: ["finding"],
      rationale: "The label is right but does not pass the diagnostic threshold.",
      tags: ["positive"],
    },
    {
      id: "diagnostic-only",
      filename: "diagnostic-only.ts",
      source: "function diagnosticOnly() {}",
      ruleId: "test/choice-rule",
      expectedFinding: false,
      expectedCandidates: 1,
      expectedChoices: ["safe"],
      rationale: "The wrong low-probability label still produces the correct visible behavior.",
      tags: ["negative"],
    },
    {
      id: "abstain",
      filename: "abstain.ts",
      source: "function abstain() {}",
      ruleId: "test/choice-rule",
      expectedFinding: false,
      expectedCandidates: 1,
      expectedChoices: ["insufficient_context"],
      expectedAbstention: true,
      rationale: "The provider should abstain without producing a diagnostic.",
      tags: ["negative", "abstention"],
    },
  ];

  const report = await runBenchmark({
    fixtures,
    parser: oxcParser(),
    plugins: { test: makeChoiceBenchmarkPlugin() },
    provider,
    providerName: "fixture",
    requestedModel: "choice-model",
    warmups: 0,
    repetitions: 1,
    concurrency: 1,
  });

  assert.deepEqual(report.summary.outcomes, {
    labelAgreement: { correct: 2, incorrect: 1, rate: 2 / 3, total: 3 },
    diagnosticAgreement: { correct: 2, incorrect: 1, rate: 2 / 3, total: 3 },
    abstentions: { correct: 3, incorrect: 0, rate: 1, total: 3, actual: 1, expected: 1 },
    strictAgreement: { correct: 1, incorrect: 2, rate: 1 / 3, total: 3 },
  });
  assert.deepEqual(report.samples[0]?.cases[0]?.answers, [
    {
      type: "choice",
      choice: "finding",
      confidence: 1,
      probabilities: { finding: 0.5, safe: 0.5, insufficient_context: 0 },
    },
  ]);
});
