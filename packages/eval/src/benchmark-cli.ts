import { readFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";

import { parseEvalFixtures, validateEvalCorpus, type EvalFixture } from "@scruple/eval";
import {
  parseBenchmarkFixtureIds,
  runBenchmark,
  selectBenchmarkFixtures,
  type BenchmarkReport,
} from "@scruple/eval/benchmark";
import { BENCHMARK_HELP, parseBenchmarkOptions } from "@scruple/eval/benchmark-options";
import type { EvalProviderSpec } from "@scruple/eval/options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

import { createLiveProvider } from "./live-provider.js";

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

const runSpec = async (
  spec: EvalProviderSpec,
  fixtures: readonly EvalFixture[],
  warmups: number,
  repetitions: number,
  concurrency: number,
): Promise<BenchmarkReport> => {
  const provider = createLiveProvider(spec, {
    concurrency,
    ...(process.env["LAYA_DEVICE"] === undefined ? {} : { layaDevice: process.env["LAYA_DEVICE"] }),
    ...(process.env["LAYA_PYTHON"] === undefined ? {} : { layaPython: process.env["LAYA_PYTHON"] }),
  });
  try {
    return await runBenchmark({
      fixtures,
      parser: oxcParser(),
      plugins,
      provider,
      providerName: spec.provider,
      requestedModel: spec.model,
      warmups,
      repetitions,
      concurrency,
    });
  } finally {
    await provider.close?.();
  }
};

const runSpecs = async (
  specs: readonly EvalProviderSpec[],
  fixtures: readonly EvalFixture[],
  warmups: number,
  repetitions: number,
  concurrency: number,
  index = 0,
): Promise<BenchmarkReport[]> => {
  const spec = specs[index];
  if (spec === undefined) {
    return [];
  }
  process.stderr.write(`Benchmarking ${spec.provider}/${spec.model}...\n`);
  const report = await runSpec(spec, fixtures, warmups, repetitions, concurrency);
  return [
    report,
    ...(await runSpecs(specs, fixtures, warmups, repetitions, concurrency, index + 1)),
  ];
};

const main = async (): Promise<void> => {
  const options = parseBenchmarkOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(BENCHMARK_HELP);
    return;
  }
  const fixtures = await loadFixtures();
  validateEvalCorpus(fixtures, oxcParser(), plugins);
  const selectedIds =
    options.fixtureIds.length === 0 ? await loadBenchmarkFixtureIds() : options.fixtureIds;
  const selectedFixtures = selectBenchmarkFixtures(fixtures, selectedIds);
  const runs = await runSpecs(
    options.specs,
    selectedFixtures,
    options.warmups,
    options.repetitions,
    options.concurrency,
  );
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
