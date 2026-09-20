import type { DecisionProvider, PluginMap, RuleConfiguration, SourceParser } from "@scruple/core";
import { runEvalCase, type EvalCaseResult, type EvalFixture } from "@scruple/eval";

export interface BenchmarkSample {
  repetition: number;
  durationMs: number;
  throughputCasesPerSecond: number;
  cases: EvalCaseResult[];
  failures: EvalCaseResult[];
  latencyMs: {
    p50: number;
    p95: number;
  };
  usage: BenchmarkUsage;
}

export interface BenchmarkUsage {
  inputTokens: number;
  modelCalls: number;
  outputTokens: number;
}

export interface BenchmarkMetricSummary {
  mean: number;
  p50: number;
  p95: number;
}

export interface BenchmarkReport {
  provider: string;
  requestedModel: string;
  resolvedModels: string[];
  workload: {
    fixtureCount: number;
    fixtureIds: string[];
  };
  settings: {
    concurrency: number;
    repetitions: number;
    warmups: number;
  };
  samples: BenchmarkSample[];
  summary: {
    cases: {
      total: number;
      passed: number;
      failed: number;
    };
    durationMs: BenchmarkMetricSummary;
    caseLatencyMs: BenchmarkMetricSummary;
    throughputCasesPerSecond: number;
    usage: BenchmarkUsage & {
      perRepetition: BenchmarkUsage;
    };
  };
}

export interface RunBenchmarkOptions {
  fixtures: readonly EvalFixture[];
  parser: SourceParser;
  plugins: PluginMap;
  rules?: Record<string, RuleConfiguration>;
  provider: DecisionProvider;
  providerName: string;
  requestedModel: string;
  warmups: number;
  repetitions: number;
  concurrency: number;
}

export const parseBenchmarkFixtureIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError("Benchmark fixture IDs must be an array");
  }
  const ids = value.filter((entry): entry is string => typeof entry === "string");
  if (ids.length !== value.length || ids.some((id) => id.length === 0)) {
    throw new TypeError("Benchmark fixture IDs must be nonempty strings");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Benchmark fixture IDs must be unique");
  }
  if (ids.length === 0) {
    throw new Error("Benchmark fixture IDs must not be empty");
  }
  return ids;
};

export const selectBenchmarkFixtures = (
  fixtures: readonly EvalFixture[],
  ids: readonly string[],
): EvalFixture[] => {
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  return ids.map((id) => {
    const fixture = fixturesById.get(id);
    if (fixture === undefined) {
      throw new Error(`Unknown benchmark fixture ID: ${id}`);
    }
    return fixture;
  });
};

export const sizeBenchmarkWorkload = (
  fixtures: readonly EvalFixture[],
  size: number,
): EvalFixture[] => {
  validatePositiveInteger(size, "workload size");
  if (fixtures.length === 0) {
    throw new Error("Cannot size an empty benchmark workload");
  }
  return Array.from({ length: size }, (_, index) => fixtures[index % fixtures.length]!);
};

export const runBenchmark = async (options: RunBenchmarkOptions): Promise<BenchmarkReport> => {
  validatePositiveInteger(options.concurrency, "concurrency");
  validatePositiveInteger(options.repetitions, "repetitions");
  validateNonnegativeInteger(options.warmups, "warmups");
  if (options.fixtures.length === 0) {
    throw new Error("A benchmark requires at least one fixture");
  }

  await runSequential(
    Array.from({ length: options.warmups }, () => 0),
    (repetition) => runSample(options, repetition),
  );
  const samples = await runSequential(
    Array.from({ length: options.repetitions }, (_, index) => index + 1),
    (repetition) => runSample(options, repetition),
  );

  const cases = samples.flatMap((sample) => sample.cases);
  const failures = cases.filter((result) => !result.accepted);
  const durationMs = summarizeMetric(samples.map((sample) => sample.durationMs));
  const usage = sumUsage(cases);
  return {
    provider: options.providerName,
    requestedModel: options.requestedModel,
    resolvedModels: [...new Set(cases.map((result) => result.model))].toSorted(),
    workload: {
      fixtureCount: options.fixtures.length,
      fixtureIds: options.fixtures.map((fixture) => fixture.id),
    },
    settings: {
      concurrency: options.concurrency,
      repetitions: options.repetitions,
      warmups: options.warmups,
    },
    samples,
    summary: {
      cases: {
        total: cases.length,
        passed: cases.length - failures.length,
        failed: failures.length,
      },
      durationMs,
      caseLatencyMs: summarizeMetric(cases.map((result) => result.latencyMs)),
      throughputCasesPerSecond:
        durationMs.mean === 0 ? 0 : (options.fixtures.length * 1_000) / durationMs.mean,
      usage: {
        ...usage,
        perRepetition: divideUsage(usage, options.repetitions),
      },
    },
  };
};

const runSample = async (
  options: RunBenchmarkOptions,
  repetition: number,
): Promise<BenchmarkSample> => {
  const started = performance.now();
  const cases = await mapConcurrent(options.fixtures, options.concurrency, (fixture) =>
    runEvalCase(
      fixture,
      options.parser,
      options.plugins,
      options.rules?.[fixture.ruleId] ?? "warn",
      options.provider,
    ),
  );
  const durationMs = performance.now() - started;
  const failures = cases.filter((result) => !result.accepted);
  const latencies = cases.map((result) => result.latencyMs);
  return {
    repetition,
    durationMs,
    throughputCasesPerSecond: durationMs === 0 ? 0 : (cases.length * 1_000) / durationMs,
    cases,
    failures,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    usage: sumUsage(cases),
  };
};

const mapConcurrent = async <Input, Output>(
  values: readonly Input[],
  concurrency: number,
  run: (value: Input) => Promise<Output>,
): Promise<Output[]> => {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);
  const runWorker = async (): Promise<{ index: number; value: Output }[]> => {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= values.length) {
      return [];
    }
    const value = values[index]!;
    const result = await run(value);
    return [{ index, value: result }, ...(await runWorker())];
  };
  const workers = Array.from({ length: workerCount }, () => runWorker());
  return (await Promise.all(workers))
    .flat()
    .toSorted((left, right) => left.index - right.index)
    .map((entry) => entry.value);
};

const runSequential = async <Input, Output>(
  values: readonly Input[],
  run: (value: Input) => Promise<Output>,
  index = 0,
): Promise<Output[]> => {
  if (index >= values.length) {
    return [];
  }
  const value = values[index]!;
  const result = await run(value);
  return [result, ...(await runSequential(values, run, index + 1))];
};

const summarizeMetric = (values: readonly number[]): BenchmarkMetricSummary => {
  return {
    mean: values.reduce((total, value) => total + value, 0) / values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
};

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
};

const sumUsage = (cases: readonly EvalCaseResult[]): BenchmarkUsage => {
  return cases.reduce<BenchmarkUsage>(
    (total, result) => ({
      inputTokens: total.inputTokens + result.usage.inputTokens,
      modelCalls: total.modelCalls + result.usage.modelCalls,
      outputTokens: total.outputTokens + result.usage.outputTokens,
    }),
    { inputTokens: 0, modelCalls: 0, outputTokens: 0 },
  );
};

const divideUsage = (usage: BenchmarkUsage, divisor: number): BenchmarkUsage => {
  return {
    inputTokens: usage.inputTokens / divisor,
    modelCalls: usage.modelCalls / divisor,
    outputTokens: usage.outputTokens / divisor,
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
