import type {
  DecisionProvider,
  DecisionResponse,
  SemanticPlugin,
  SourceParser,
} from "@scruple/core";
import { runScruple } from "@scruple/core";

export interface EvalFixture {
  id: string;
  filename: string;
  source: string;
  pluginId: string;
  expectedFinding: boolean;
}

export interface EvalCaseResult {
  id: string;
  pluginId: string;
  expectedFinding: boolean;
  actualFinding: boolean;
  accepted: boolean;
  diagnostics: number;
  errors: string[];
  latencyMs: number;
  model: string;
  usage: {
    inputTokens: number;
    modelCalls: number;
    outputTokens: number;
  };
}

export interface EvalRunReport {
  provider: string;
  requestedModel: string;
  repetition: number;
  cases: EvalCaseResult[];
  failures: EvalCaseResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  latencyMs: {
    p50: number;
    p95: number;
    total: number;
  };
  usage: {
    inputTokens: number;
    modelCalls: number;
    outputTokens: number;
  };
}

export interface RunEvaluationOptions {
  fixtures: readonly EvalFixture[];
  parser: SourceParser;
  plugins: readonly SemanticPlugin[];
  provider: DecisionProvider;
  providerName: string;
  requestedModel: string;
  repetition: number;
}

export function parseEvalFixtures(value: unknown): EvalFixture[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Evaluation fixtures must be an array");
  }
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Evaluation fixture ${index} must be an object`);
    }
    const fixture: EvalFixture = {
      id: requiredString(entry, "id", index),
      filename: requiredString(entry, "filename", index),
      source: requiredString(entry, "source", index),
      pluginId: requiredString(entry, "plugin_id", index),
      expectedFinding: requiredBoolean(entry, "expected_finding", index),
    };
    if (ids.has(fixture.id)) {
      throw new Error(`Duplicate evaluation fixture ID: ${fixture.id}`);
    }
    ids.add(fixture.id);
    return fixture;
  });
}

export async function runEvalCase(
  fixture: EvalFixture,
  parser: SourceParser,
  plugin: SemanticPlugin,
  provider: DecisionProvider,
): Promise<EvalCaseResult> {
  let model = provider.id;
  let modelCalls = 0;
  const trackingProvider: DecisionProvider = {
    id: provider.id,
    async evaluate(request, signal): Promise<DecisionResponse> {
      modelCalls += 1;
      const response = await provider.evaluate(request, signal);
      model = response.model;
      return response;
    },
  };
  const started = performance.now();
  const result = await runScruple({ parser, provider: trackingProvider, plugins: [plugin] }, [
    { filename: fixture.filename, source: fixture.source },
  ]);
  const actualFinding = result.diagnostics.some(
    (diagnostic) => diagnostic.pluginId === fixture.pluginId,
  );
  const errors = result.errors.map((error) => error.message);
  return {
    id: fixture.id,
    pluginId: fixture.pluginId,
    expectedFinding: fixture.expectedFinding,
    actualFinding,
    accepted: errors.length === 0 && actualFinding === fixture.expectedFinding,
    diagnostics: result.diagnostics.length,
    errors,
    latencyMs: performance.now() - started,
    model,
    usage: {
      inputTokens: result.stats.inputTokens,
      modelCalls,
      outputTokens: result.stats.outputTokens,
    },
  };
}

export async function runEvaluation(options: RunEvaluationOptions): Promise<EvalRunReport> {
  const plugins = new Map(options.plugins.map((plugin) => [plugin.id, plugin]));
  const cases = await Promise.all(
    options.fixtures.map((fixture) => {
      const plugin = plugins.get(fixture.pluginId);
      if (plugin === undefined) {
        throw new Error(`No plugin configured for evaluation fixture: ${fixture.pluginId}`);
      }
      return runEvalCase(fixture, options.parser, plugin, options.provider);
    }),
  );
  const failures = cases.filter((result) => !result.accepted);
  const latencies = cases.map((result) => result.latencyMs);
  return {
    provider: options.providerName,
    requestedModel: options.requestedModel,
    repetition: options.repetition,
    cases,
    failures,
    summary: {
      total: cases.length,
      passed: cases.length - failures.length,
      failed: failures.length,
    },
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      total: latencies.reduce((total, value) => total + value, 0),
    },
    usage: {
      inputTokens: sum(cases, (result) => result.usage.inputTokens),
      modelCalls: sum(cases, (result) => result.usage.modelCalls),
      outputTokens: sum(cases, (result) => result.usage.outputTokens),
    },
  };
}

export function hasEvalFailures(runs: readonly EvalRunReport[]): boolean {
  return runs.some((run) => run.failures.length > 0);
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function sum(
  results: readonly EvalCaseResult[],
  select: (result: EvalCaseResult) => number,
): number {
  return results.reduce((total, result) => total + select(result), 0);
}

function requiredString(value: Record<string, unknown>, key: string, index: number): string {
  const entry = value[key];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new Error(`Evaluation fixture ${index} requires a nonempty ${key}`);
  }
  return entry;
}

function requiredBoolean(value: Record<string, unknown>, key: string, index: number): boolean {
  const entry = value[key];
  if (typeof entry !== "boolean") {
    throw new TypeError(`Evaluation fixture ${index} requires a boolean ${key}`);
  }
  return entry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
