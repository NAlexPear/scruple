import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";

import { parseEvalFixtures } from "@scruple/eval";
import { parseBenchmarkFixtureIds, selectBenchmarkFixtures } from "@scruple/eval/benchmark";
import {
  parseSemgrepCaseMappings,
  runSemgrepProfile,
  validateSemgrepMappings,
} from "@scruple/eval/semgrep-benchmark";
import {
  SEMGREP_BENCHMARK_HELP,
  parseSemgrepBenchmarkOptions,
} from "@scruple/eval/semgrep-benchmark-options";

const fixtureCorpusUrl = new URL("../../../tests/eval-fixtures.json", import.meta.url);
const fixtureIdsUrl = new URL("../../../benchmarks/fixtures.json", import.meta.url);
const mappingsUrl = new URL("../../../benchmarks/semgrep/cases.json", import.meta.url);
const benchmarkRulesUrl = new URL("../../../benchmarks/semgrep/rules.yml", import.meta.url);

const main = async (): Promise<void> => {
  const options = parseSemgrepBenchmarkOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(SEMGREP_BENCHMARK_HELP);
    return;
  }
  const [rawCorpus, rawIds, rawMappings] = await Promise.all([
    readJson(fixtureCorpusUrl),
    readJson(fixtureIdsUrl),
    readJson(mappingsUrl),
  ]);
  const fixtures = selectBenchmarkFixtures(
    parseEvalFixtures(rawCorpus),
    parseBenchmarkFixtureIds(rawIds),
  );
  const mappings = parseSemgrepCaseMappings(rawMappings);
  validateSemgrepMappings(fixtures, mappings);
  const semgrepVersion = readSemgrepVersion(options.semgrepBin);
  const runs = await runProfiles(options.profiles, (profile) => {
    process.stderr.write(`Benchmarking Semgrep ${profile} profile...\n`);
    const config = profile === "official-default" ? "p/default" : fileURLToPath(benchmarkRulesUrl);
    return runSemgrepProfile({
      semgrepBin: options.semgrepBin,
      profile,
      config,
      configLabel: profile === "official-default" ? "p/default" : "benchmarks/semgrep/rules.yml",
      fixtures,
      mappings,
      warmups: options.warmups,
      repetitions: options.repetitions,
    });
  });
  const processors = cpus();
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        tool: { name: "semgrep", version: semgrepVersion, executable: options.semgrepBin },
        environment: {
          node: process.version,
          platform: platform(),
          release: release(),
          architecture: arch(),
          cpu: processors[0]?.model ?? "unknown",
          logicalCpuCount: processors.length,
          totalMemoryBytes: totalmem(),
        },
        workload: {
          fixtureIds: fixtures.map((fixture) => fixture.id),
          mapping: "benchmarks/semgrep/cases.json",
        },
        settings: { warmups: options.warmups, repetitions: options.repetitions },
        runs,
      },
      null,
      2,
    )}\n`,
  );
};

const readJson = async (url: URL): Promise<unknown> => JSON.parse(await readFile(url, "utf8"));

const readSemgrepVersion = (semgrepBin: string): string => {
  try {
    return execFileSync(semgrepBin, ["--version"], {
      env: { ...process.env, SEMGREP_ENABLE_VERSION_CHECK: "0" },
      encoding: "utf8",
    }).trim();
  } catch (error) {
    throw new Error(`Unable to run ${semgrepBin} --version`, { cause: error });
  }
};

const runProfiles = async <Output>(
  profiles: readonly ("official-default" | "benchmark-owned")[],
  run: (profile: "official-default" | "benchmark-owned") => Promise<Output>,
  index = 0,
): Promise<Output[]> => {
  const profile = profiles[index];
  if (profile === undefined) {
    return [];
  }
  const result = await run(profile);
  return [result, ...(await runProfiles(profiles, run, index + 1))];
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`scruple Semgrep benchmark: ${message}\n`);
  process.exitCode = 2;
}
