import { readFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { parseArgs } from "node:util";

import { parseEvalFixtures } from "@scruple/eval";
import { parseBenchmarkFixtureIds, selectBenchmarkFixtures } from "@scruple/eval/benchmark";
import {
  buildLlmBenchmarkTasks,
  OPENAI_MODEL,
  runLlmBenchmark,
  verifyTaskManifest,
} from "@scruple/eval/llm-benchmark";
import { createOpenAiEvaluator } from "@scruple/eval/openai-evaluator";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

const HELP = `Benchmark pinned Scruple tasks with a direct hosted LLM

Usage:
  pnpm benchmark-llm [options] > report.json

Options:
  --repetitions <count>  Measured repetitions (default: 3)
  --warmups <count>      Unmeasured repetitions (default: 1)
  --concurrency <count>  Maximum API calls in flight (default: 1)
  -h, --help             Show this help

Environment:
  OPENAI_API_KEY  Required by OpenAI
`;

const loadJson = async (url: URL): Promise<unknown> =>
  JSON.parse(await readFile(url, "utf8")) as unknown;

const count = (value: string, name: string, allowZero: boolean): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be a ${allowZero ? "nonnegative" : "positive"} integer`);
  }
  return parsed;
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      repetitions: { type: "string", default: "3" },
      warmups: { type: "string", default: "1" },
      concurrency: { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("OPENAI_API_KEY is required");
  }
  const fixtures = parseEvalFixtures(
    await loadJson(new URL("../../../tests/eval-fixtures.json", import.meta.url)),
  );
  const ids = parseBenchmarkFixtureIds(
    await loadJson(new URL("../../../benchmarks/fixtures.json", import.meta.url)),
  );
  const tasks = buildLlmBenchmarkTasks(
    selectBenchmarkFixtures(fixtures, ids),
    oxcParser(),
    evaluationPlugins(),
  );
  verifyTaskManifest(
    tasks,
    await loadJson(new URL("../../../benchmarks/llm-task-manifest.json", import.meta.url)),
  );
  const repetitions = count(values.repetitions, "--repetitions", false);
  const warmups = count(values.warmups, "--warmups", true);
  const concurrency = count(values.concurrency, "--concurrency", false);
  process.stderr.write(`Benchmarking OpenAI/${OPENAI_MODEL} directly...\n`);
  const report = await runLlmBenchmark({
    tasks,
    evaluator: createOpenAiEvaluator({ apiKey, model: OPENAI_MODEL }),
    provider: "openai",
    requestedModel: OPENAI_MODEL,
    concurrency,
    repetitions,
    warmups,
  });
  const processors = cpus();
  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environment: {
          node: process.version,
          platform: platform(),
          release: release(),
          architecture: arch(),
          cpu: processors[0]?.model ?? "unknown",
          logicalCpuCount: processors.length,
          totalMemoryBytes: totalmem(),
        },
        report,
      },
      null,
      2,
    )}\n`,
  );
};

try {
  await main();
} catch (error) {
  process.stderr.write(
    `scruple LLM benchmark: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
