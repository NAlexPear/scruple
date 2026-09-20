import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseEvalFixtures } from "@scruple/eval";
import { parseBenchmarkFixtureIds, selectBenchmarkFixtures } from "@scruple/eval/benchmark";
import {
  buildLlmBenchmarkTasks,
  parseStructuredAnswer,
  runLlmBenchmark,
  verifyTaskManifest,
  type LlmBenchmarkTask,
  type LlmEvaluator,
} from "@scruple/eval/llm-benchmark";
import { createOpenAiEvaluator } from "@scruple/eval/openai-evaluator";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

const task = (id: string, expectedChoice: string, expectedFinding: boolean): LlmBenchmarkTask => ({
  id,
  ruleId: "test/rule",
  expectedChoice,
  expectedFinding,
  evidence: { source: id },
  question: { instructions: "Choose.", criteria: { finding: "bad", safe: "good" } },
  hash: id,
});

const loadPinnedTasks = async (): Promise<LlmBenchmarkTask[]> => {
  const fixtures = parseEvalFixtures(
    JSON.parse(await readFile(new URL("./eval-fixtures.json", import.meta.url), "utf8")) as unknown,
  );
  const ids = parseBenchmarkFixtureIds(
    JSON.parse(
      await readFile(new URL("../benchmarks/fixtures.json", import.meta.url), "utf8"),
    ) as unknown,
  );
  return buildLlmBenchmarkTasks(
    selectBenchmarkFixtures(fixtures, ids),
    oxcParser(),
    evaluationPlugins(),
  );
};

await test("pinned LLM tasks detect fixture, evidence, and question drift", async () => {
  const tasks = await loadPinnedTasks();
  const manifest = JSON.parse(
    await readFile(new URL("../benchmarks/llm-task-manifest.json", import.meta.url), "utf8"),
  ) as unknown;
  assert.equal(tasks.length, 10);
  assert.doesNotThrow(() => {
    verifyTaskManifest(tasks, manifest);
  });
  assert.throws(() => {
    verifyTaskManifest([{ ...tasks[0]!, hash: "changed" }, ...tasks.slice(1)], manifest);
  }, /fixture drift/u);
});

await test("structured answers require an allowed choice and rationale", () => {
  assert.deepEqual(
    parseStructuredAnswer({ choice: "safe", rationale: "Bounded evidence." }, ["safe"]),
    {
      choice: "safe",
      rationale: "Bounded evidence.",
    },
  );
  assert.throws(
    () => parseStructuredAnswer({ choice: "invented", rationale: "x" }, ["safe"]),
    /choice/u,
  );
  assert.throws(
    () => parseStructuredAnswer({ choice: "safe", rationale: "" }, ["safe"]),
    /rationale/u,
  );
});

await test("OpenAI evaluator sends pinned structured settings and parses response usage", async () => {
  let requestBody: unknown;
  const evaluator = createOpenAiEvaluator({
    apiKey: "fixture-key",
    model: "fixture-snapshot",
    fetch: (_input, init) => {
      const body = init?.body;
      assert.ok(typeof body === "string");
      requestBody = JSON.parse(body) as unknown;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: "fixture-snapshot",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ choice: "safe", rationale: "The evidence is safe." }),
                  },
                ],
              },
            ],
            usage: { input_tokens: 17, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );
    },
  });
  const result = await evaluator.evaluate(task("response", "safe", false));
  assert.deepEqual(result, {
    model: "fixture-snapshot",
    answer: { choice: "safe", rationale: "The evidence is safe." },
    usage: { inputTokens: 17, outputTokens: 5 },
  });
  const serializedRequest = JSON.stringify(requestBody);
  assert.match(serializedRequest, /"temperature":0/u);
  assert.match(serializedRequest, /"store":false/u);
  assert.match(serializedRequest, /"strict":true/u);
});

await test("category counts and denominators exclude only unsupported capability", async () => {
  const tasks = [
    task("correct-finding", "finding", true),
    task("wrong-finding", "finding", true),
    task("correct-safe", "safe", false),
    task("unsupported", "finding", true),
    task("api-error", "finding", true),
  ];
  const answers: Record<string, string> = {
    "correct-finding": "finding",
    "wrong-finding": "safe",
    "correct-safe": "safe",
  };
  const evaluate = (caseTask: LlmBenchmarkTask) =>
    Promise.resolve({
      model: "fixture-model",
      answer: { choice: answers[caseTask.id]!, rationale: "Fixture answer." },
      usage: { inputTokens: 10, outputTokens: 2 },
    });
  const actions: Record<string, () => ReturnType<typeof evaluate>> = {
    "correct-finding": () => evaluate(tasks[0]!),
    "wrong-finding": () => evaluate(tasks[1]!),
    "correct-safe": () => evaluate(tasks[2]!),
    "api-error": () => {
      throw new Error("rate limited");
    },
  };
  const evaluator: LlmEvaluator = {
    unsupportedReason(caseTask) {
      return { unsupported: "Provider cannot accept this modality." }[caseTask.id];
    },
    evaluate(caseTask) {
      return actions[caseTask.id]!();
    },
  };
  const report = await runLlmBenchmark({
    tasks,
    evaluator,
    provider: "fixture",
    requestedModel: "fixture-model",
    concurrency: 2,
    repetitions: 1,
    warmups: 0,
  });
  assert.deepEqual(report.summary.categories, {
    "detected/correct": 2,
    "applicable miss": 2,
    "unsupported capability": 1,
  });
  assert.deepEqual(report.summary.correctness, { correct: 2, denominator: 4, rate: 0.5 });
  assert.deepEqual(report.summary.recall, { correctFindings: 1, denominator: 3, rate: 1 / 3 });
  assert.equal(report.summary.operationalErrors, 1);
  assert.equal(report.summary.abstentions, 0);
  assert.deepEqual(report.summary.usage, { inputTokens: 30, outputTokens: 6 });

  const unsupportedOnly = await runLlmBenchmark({
    tasks: [task("unsupported", "finding", true)],
    evaluator,
    provider: "fixture",
    requestedModel: "fixture-model",
    concurrency: 1,
    repetitions: 1,
    warmups: 0,
  });
  assert.deepEqual(unsupportedOnly.summary.correctness, {
    correct: 0,
    denominator: 0,
    rate: null,
  });
  assert.deepEqual(unsupportedOnly.summary.recall, {
    correctFindings: 0,
    denominator: 0,
    rate: null,
  });
  assert.equal(unsupportedOnly.summary.throughputCasesPerSecond, 0);
});
