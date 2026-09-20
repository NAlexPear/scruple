import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createFileDecisionCache } from "@scruple/cli";
import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  Diagnostic,
  RunStats,
  SourceFile,
} from "@scruple/core";
import { definePlugin, runScruple } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

export type CacheBenchmarkScenario = "uncached" | "cold" | "warm" | "incremental";

export interface CacheBenchmarkOptions {
  concurrency: number;
  providerDelayMs: number;
  repetitions: number;
  warmups: number;
  workloadSize: number;
}

export interface CacheBenchmarkSample extends RunStats {
  scenario: CacheBenchmarkScenario;
  repetition: number;
  durationMs: number;
  cacheEntries: number;
  cacheBytes: number;
  diagnosticFingerprint: string;
}

export interface CacheBenchmarkMetricSummary {
  mean: number;
  p50: number;
  p95: number;
}

export interface CacheBenchmarkScenarioReport {
  samples: CacheBenchmarkSample[];
  durationMs: CacheBenchmarkMetricSummary;
  requestsPerRun: number;
  cacheHitsPerRun: number;
  inputTokensPerRun: number;
  outputTokensPerRun: number;
  cacheEntries: number;
  cacheBytes: number;
}

export interface CacheBenchmarkReport {
  schemaVersion: 1;
  settings: CacheBenchmarkOptions;
  scenarios: Record<CacheBenchmarkScenario, CacheBenchmarkScenarioReport>;
  comparisons: {
    diagnosticsMatch: boolean;
    coldOverheadRatio: number;
    warmSpeedupRatio: number;
    providerCallsAvoidedPerWarmRun: number;
    inputTokensAvoidedPerWarmRun: number;
    outputTokensAvoidedPerWarmRun: number;
  };
}

interface BenchmarkCycle {
  uncached: CacheBenchmarkSample;
  cold: CacheBenchmarkSample;
  warm: CacheBenchmarkSample;
  incremental: CacheBenchmarkSample;
}

const benchmarkPlugin = definePlugin({
  rules: {
    check: () => ({
      description: "Exercise decision-cache reads and writes.",
      collect(document) {
        const target = document.functions[0];
        return target === undefined
          ? []
          : [
              {
                target,
                state: { source: target.source },
                question: { type: "noul", instructions: "Is this fixture unsafe?" },
              },
            ];
      },
      diagnose(answer, candidate) {
        return answer.type === "noul" && answer.noul >= 0.5
          ? {
              severity: "warning",
              message: "Benchmark finding",
              filename: candidate.target.filename,
              location: candidate.target.location,
            }
          : null;
      },
    }),
  },
});

export const runCacheBenchmark = async (
  options: CacheBenchmarkOptions,
): Promise<CacheBenchmarkReport> => {
  validatePositiveInteger(options.concurrency, "concurrency");
  validatePositiveInteger(options.providerDelayMs, "provider delay");
  validatePositiveInteger(options.repetitions, "repetitions");
  validateNonnegativeInteger(options.warmups, "warmups");
  validatePositiveInteger(options.workloadSize, "workload size");

  const root = await mkdtemp(join(tmpdir(), "scruple-cache-benchmark-"));
  try {
    await runCycles(options, join(root, "warmups"), options.warmups);
    const cycles = await runCycles(options, join(root, "measured"), options.repetitions);
    const scenarios = {
      uncached: summarizeScenario(cycles.map((cycle) => cycle.uncached)),
      cold: summarizeScenario(cycles.map((cycle) => cycle.cold)),
      warm: summarizeScenario(cycles.map((cycle) => cycle.warm)),
      incremental: summarizeScenario(cycles.map((cycle) => cycle.incremental)),
    };
    assertExpectedCacheBehavior(scenarios, options.workloadSize);
    const fingerprints = cycles.flatMap((cycle) => [
      cycle.uncached.diagnosticFingerprint,
      cycle.cold.diagnosticFingerprint,
      cycle.warm.diagnosticFingerprint,
      cycle.incremental.diagnosticFingerprint,
    ]);
    return {
      schemaVersion: 1,
      settings: options,
      scenarios,
      comparisons: {
        diagnosticsMatch: new Set(fingerprints).size === 1,
        coldOverheadRatio: scenarios.cold.durationMs.mean / scenarios.uncached.durationMs.mean,
        warmSpeedupRatio: scenarios.uncached.durationMs.mean / scenarios.warm.durationMs.mean,
        providerCallsAvoidedPerWarmRun:
          scenarios.uncached.requestsPerRun - scenarios.warm.requestsPerRun,
        inputTokensAvoidedPerWarmRun:
          scenarios.uncached.inputTokensPerRun - scenarios.warm.inputTokensPerRun,
        outputTokensAvoidedPerWarmRun:
          scenarios.uncached.outputTokensPerRun - scenarios.warm.outputTokensPerRun,
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const runCycles = async (
  options: CacheBenchmarkOptions,
  root: string,
  count: number,
  repetition = 1,
): Promise<BenchmarkCycle[]> => {
  if (repetition > count) {
    return [];
  }
  const cycle = await runCycle(options, join(root, `repetition-${repetition}`), repetition);
  return [cycle, ...(await runCycles(options, root, count, repetition + 1))];
};

const runCycle = async (
  options: CacheBenchmarkOptions,
  cacheDirectory: string,
  repetition: number,
): Promise<BenchmarkCycle> => {
  const files = benchmarkFiles(options.workloadSize);
  const provider = benchmarkProvider(options.concurrency, options.providerDelayMs);
  const config = {
    parser: oxcParser(),
    provider,
    plugins: { benchmark: benchmarkPlugin },
    rules: { "benchmark/check": "warn" as const },
  };
  const uncached = await runScenario("uncached", repetition, config, files);
  const cold = await runScenario("cold", repetition, config, files, cacheDirectory);
  const warm = await runScenario("warm", repetition, config, files, cacheDirectory);
  const incrementalFiles = files.with(0, {
    filename: files[0]!.filename,
    source: "function fixture1() { return 'changed'; }",
  });
  const incremental = await runScenario(
    "incremental",
    repetition,
    config,
    incrementalFiles,
    cacheDirectory,
  );
  return { uncached, cold, warm, incremental };
};

const runScenario = async (
  scenario: CacheBenchmarkScenario,
  repetition: number,
  config: Parameters<typeof runScruple>[0],
  files: SourceFile[],
  cacheDirectory?: string,
): Promise<CacheBenchmarkSample> => {
  const cache =
    cacheDirectory === undefined
      ? undefined
      : createFileDecisionCache({
          directory: cacheDirectory,
          onWarning(message, cause) {
            throw new Error(message, { cause });
          },
        });
  const started = performance.now();
  const result = await runScruple(config, files, undefined, cache === undefined ? {} : { cache });
  const durationMs = performance.now() - started;
  if (result.errors.length > 0) {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  const storage =
    cacheDirectory === undefined ? { entries: 0, bytes: 0 } : await cacheStorage(cacheDirectory);
  return {
    scenario,
    repetition,
    durationMs,
    cacheEntries: storage.entries,
    cacheBytes: storage.bytes,
    diagnosticFingerprint: diagnosticsFingerprint(result.diagnostics),
    ...result.stats,
  };
};

const benchmarkFiles = (workloadSize: number): SourceFile[] =>
  Array.from({ length: workloadSize }, (_, index) => ({
    filename: `fixture-${index + 1}.ts`,
    source: `function fixture${index + 1}() { return ${index + 1}; }`,
  }));

const benchmarkProvider = (concurrency: number, providerDelayMs: number): DecisionProvider => ({
  id: "cache-benchmark-provider",
  concurrency,
  async evaluate(request): Promise<DecisionResponse> {
    await delay(providerDelayMs);
    const answers: Record<string, DecisionAnswer> = Object.fromEntries(
      Object.keys(request.questions).map((id) => [id, { type: "noul" as const, noul: 0.9 }]),
    );
    return {
      model: "cache-benchmark-model",
      answers,
      usage: { inputTokens: 11, outputTokens: 2 },
    };
  },
});

const diagnosticsFingerprint = (diagnostics: readonly Diagnostic[]): string =>
  JSON.stringify(
    diagnostics.map(({ filename, message, ruleId, severity }) => ({
      filename,
      message,
      ruleId,
      severity,
    })),
  );

const summarizeScenario = (samples: CacheBenchmarkSample[]): CacheBenchmarkScenarioReport => ({
  samples,
  durationMs: summarizeMetric(samples.map((sample) => sample.durationMs)),
  requestsPerRun: consistentMetric(samples, "requests"),
  cacheHitsPerRun: consistentMetric(samples, "cacheHits"),
  inputTokensPerRun: consistentMetric(samples, "inputTokens"),
  outputTokensPerRun: consistentMetric(samples, "outputTokens"),
  cacheEntries: consistentMetric(samples, "cacheEntries"),
  cacheBytes: consistentMetric(samples, "cacheBytes"),
});

const consistentMetric = (
  samples: readonly CacheBenchmarkSample[],
  key: "requests" | "cacheHits" | "inputTokens" | "outputTokens" | "cacheEntries" | "cacheBytes",
): number => {
  const [first = 0] = samples.map((sample) => sample[key]);
  if (!samples.every((sample) => sample[key] === first)) {
    throw new Error(`Cache benchmark produced inconsistent ${key}`);
  }
  return first;
};

const summarizeMetric = (values: readonly number[]): CacheBenchmarkMetricSummary => ({
  mean: values.reduce((total, value) => total + value, 0) / values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
});

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
};

const assertExpectedCacheBehavior = (
  scenarios: CacheBenchmarkReport["scenarios"],
  workloadSize: number,
): void => {
  const valid =
    scenarios.uncached.requestsPerRun === workloadSize &&
    scenarios.uncached.cacheHitsPerRun === 0 &&
    scenarios.cold.requestsPerRun === workloadSize &&
    scenarios.cold.cacheHitsPerRun === 0 &&
    scenarios.warm.requestsPerRun === 0 &&
    scenarios.warm.cacheHitsPerRun === workloadSize &&
    scenarios.incremental.requestsPerRun === 1 &&
    scenarios.incremental.cacheHitsPerRun === workloadSize - 1;
  if (!valid) {
    throw new Error(
      "Cache benchmark did not observe the expected cold, warm, and incremental calls",
    );
  }
};

const cacheStorage = async (directory: string): Promise<{ entries: number; bytes: number }> => {
  const filenames = await readdir(directory);
  const sizes = await Promise.all(
    filenames.map(async (filename) => (await stat(join(directory, filename))).size),
  );
  return {
    entries: filenames.length,
    bytes: sizes.reduce((total, size) => total + size, 0),
  };
};

const validatePositiveInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
};

const validateNonnegativeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative integer`);
  }
};
