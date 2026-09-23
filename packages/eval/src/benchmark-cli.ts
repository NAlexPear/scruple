import { readFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";

import { parseEvalFixtures, validateEvalCorpus, type EvalFixture } from "@scruple/eval";
import {
  parseBenchmarkFixtureIds,
  runBenchmark,
  selectBenchmarkFixtures,
  sizeBenchmarkWorkload,
  type BenchmarkReport,
} from "@scruple/eval/benchmark";
import {
  BENCHMARK_HELP,
  parseBenchmarkOptions,
  type BenchmarkOptions,
} from "@scruple/eval/benchmark-options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

import { evalProvider } from "./provider.js";

const plugins = evaluationPlugins();

const loadFixtures = async (): Promise<EvalFixture[]> => {
  const raw: unknown = JSON.parse(
    await readFile(new URL("../../../tests/eval-fixtures.json", import.meta.url), "utf8"),
  );
  return parseEvalFixtures(raw);
};

const loadBenchmarkFixtureIds = async (): Promise<string[]> => {
  const raw: unknown = JSON.parse(
    await readFile(new URL("../../../benchmarks/fixtures.json", import.meta.url), "utf8"),
  );
  return parseBenchmarkFixtureIds(raw);
};

const runModel = async (
  model: string,
  fixtures: readonly EvalFixture[],
  options: BenchmarkOptions,
): Promise<BenchmarkReport> => {
  const provider = evalProvider(options.provider).create({
    model,
    baseURL: options.baseURL,
    concurrency: options.concurrency,
  });
  try {
    return await runBenchmark({
      fixtures,
      parser: oxcParser(),
      plugins,
      provider,
      providerName: options.provider,
      requestedModel: model,
      warmups: options.warmups,
      repetitions: options.repetitions,
      concurrency: options.concurrency,
    });
  } finally {
    await provider.close?.();
  }
};

const runModels = async (
  fixtures: readonly EvalFixture[],
  options: BenchmarkOptions,
  index = 0,
): Promise<BenchmarkReport[]> => {
  const model = options.models[index];
  if (model === undefined) {
    return [];
  }
  process.stderr.write(`Benchmarking ${options.provider}/${model}...\n`);
  const report = await runModel(model, fixtures, options);
  return [report, ...(await runModels(fixtures, options, index + 1))];
};

const main = async (): Promise<void> => {
  const options = parseBenchmarkOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(BENCHMARK_HELP);
    return;
  }
  const fixtures = await loadFixtures();
  await validateEvalCorpus(fixtures, oxcParser(), plugins);
  const selectedIds =
    options.fixtureIds.length === 0 ? await loadBenchmarkFixtureIds() : options.fixtureIds;
  const selectedFixtures = selectBenchmarkFixtures(fixtures, selectedIds);
  const workload =
    options.workloadSize === undefined
      ? selectedFixtures
      : sizeBenchmarkWorkload(selectedFixtures, options.workloadSize);
  const runs = await runModels(workload, options);
  const processors = cpus();
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
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
        runs,
      },
      null,
      2,
    )}\n`,
  );
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`scruple benchmark: ${message}\n`);
  process.exitCode = 2;
}
