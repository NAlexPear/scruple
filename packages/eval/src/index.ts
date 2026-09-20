import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  PluginMap,
  RuleConfiguration,
  SourceParser,
} from "@scruple/core";
import { runScruple } from "@scruple/core";

export { evaluationPlugins } from "@scruple/eval/plugins";

export interface EvalFixture {
  id: string;
  filename: string;
  source: string;
  ruleId: string;
  expectedFinding: boolean;
  expectedCandidates?: number;
  expectedChoice?: string;
  expectedAbstention?: boolean;
  rationale: string;
  tags: string[];
}

export interface EvalCaseResult {
  id: string;
  ruleId: string;
  expectedFinding: boolean;
  actualFinding: boolean;
  expectedCandidates?: number;
  actualCandidates: number;
  expectedChoice?: string;
  actualChoices: string[];
  expectedAbstention?: boolean;
  actualAbstention: boolean;
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
  plugins: PluginMap;
  rules?: Record<string, RuleConfiguration>;
  provider: DecisionProvider;
  providerName: string;
  requestedModel: string;
  repetition: number;
}

export const parseEvalFixtures = (value: unknown): EvalFixture[] => {
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
      ruleId: requiredString(entry, "rule_id", index),
      expectedFinding: requiredBoolean(entry, "expected_finding", index),
      ...optionalExpectedCandidates(entry, index),
      ...optionalExpectedChoice(entry, index),
      ...optionalExpectedAbstention(entry, index),
      rationale: requiredString(entry, "rationale", index),
      tags: requiredStrings(entry, "tags", index),
    };
    if (ids.has(fixture.id)) {
      throw new Error(`Duplicate evaluation fixture ID: ${fixture.id}`);
    }
    ids.add(fixture.id);
    return fixture;
  });
};

export const runEvalCase = async (
  fixture: EvalFixture,
  parser: SourceParser,
  plugins: PluginMap,
  ruleConfiguration: RuleConfiguration,
  provider: DecisionProvider,
): Promise<EvalCaseResult> => {
  let model = provider.id;
  let modelCalls = 0;
  const answers: DecisionAnswer[] = [];
  const trackingProvider: DecisionProvider = {
    id: provider.id,
    ...(provider.concurrency === undefined ? {} : { concurrency: provider.concurrency }),
    async evaluate(request, signal): Promise<DecisionResponse> {
      modelCalls += 1;
      const response = await provider.evaluate(request, signal);
      model = response.model;
      answers.push(...Object.values(response.answers));
      return response;
    },
  };
  const started = performance.now();
  const result = await runScruple(
    {
      parser,
      provider: trackingProvider,
      plugins,
      rules: { [fixture.ruleId]: ruleConfiguration },
    },
    [{ filename: fixture.filename, source: fixture.source }],
  );
  const actualFinding = result.diagnostics.some(
    (diagnostic) => diagnostic.ruleId === fixture.ruleId,
  );
  const actualCandidates = result.stats.candidates;
  const errors = result.errors.map((error) => error.message);
  const actualChoices = answers.flatMap((answer) =>
    answer.type === "choice" ? [answer.choice] : [],
  );
  const actualAbstention =
    actualChoices.length > 0 && actualChoices.every((choice) => choice === "insufficient_context");
  const choiceAccepted =
    fixture.expectedChoice === undefined ||
    (actualChoices.length > 0 &&
      actualChoices.every((choice) => choice === fixture.expectedChoice));
  const abstentionAccepted =
    fixture.expectedAbstention === undefined || fixture.expectedAbstention === actualAbstention;
  return {
    id: fixture.id,
    ruleId: fixture.ruleId,
    expectedFinding: fixture.expectedFinding,
    actualFinding,
    ...(fixture.expectedCandidates === undefined
      ? {}
      : { expectedCandidates: fixture.expectedCandidates }),
    actualCandidates,
    ...(fixture.expectedChoice === undefined ? {} : { expectedChoice: fixture.expectedChoice }),
    actualChoices,
    ...(fixture.expectedAbstention === undefined
      ? {}
      : { expectedAbstention: fixture.expectedAbstention }),
    actualAbstention,
    accepted:
      errors.length === 0 &&
      actualFinding === fixture.expectedFinding &&
      (fixture.expectedCandidates === undefined ||
        actualCandidates === fixture.expectedCandidates) &&
      choiceAccepted &&
      abstentionAccepted,
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
};

export const runEvaluation = async (options: RunEvaluationOptions): Promise<EvalRunReport> => {
  const cases = await Promise.all(
    options.fixtures.map((fixture) => {
      if (!hasRule(options.plugins, fixture.ruleId)) {
        throw new Error(`No rule configured for evaluation fixture: ${fixture.ruleId}`);
      }
      return runEvalCase(
        fixture,
        options.parser,
        options.plugins,
        options.rules?.[fixture.ruleId] ?? "warn",
        options.provider,
      );
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
};

export const hasEvalFailures = (runs: readonly EvalRunReport[]): boolean => {
  return runs.some((run) => run.failures.length > 0);
};

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
};

const sum = (
  results: readonly EvalCaseResult[],
  select: (result: EvalCaseResult) => number,
): number => {
  return results.reduce((total, result) => total + select(result), 0);
};

const requiredString = (value: Record<string, unknown>, key: string, index: number): string => {
  const entry = value[key];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new Error(`Evaluation fixture ${index} requires a nonempty ${key}`);
  }
  return entry;
};

const requiredBoolean = (value: Record<string, unknown>, key: string, index: number): boolean => {
  const entry = value[key];
  if (typeof entry !== "boolean") {
    throw new TypeError(`Evaluation fixture ${index} requires a boolean ${key}`);
  }
  return entry;
};

const optionalExpectedChoice = (
  value: Record<string, unknown>,
  index: number,
): { expectedChoice?: string } => {
  const entry = value["expected_choice"];
  if (entry === undefined) {
    return {};
  }
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`Evaluation fixture ${index} requires a nonempty expected_choice`);
  }
  return { expectedChoice: entry };
};

const optionalExpectedCandidates = (
  value: Record<string, unknown>,
  index: number,
): { expectedCandidates?: number } => {
  const entry = value["expected_candidates"];
  if (entry === undefined) {
    return {};
  }
  if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry < 0) {
    throw new TypeError(`Evaluation fixture ${index} requires a nonnegative expected_candidates`);
  }
  return { expectedCandidates: entry };
};

const optionalExpectedAbstention = (
  value: Record<string, unknown>,
  index: number,
): { expectedAbstention?: boolean } => {
  const entry = value["expected_abstention"];
  if (entry === undefined) {
    return {};
  }
  if (typeof entry !== "boolean") {
    throw new TypeError(`Evaluation fixture ${index} requires a boolean expected_abstention`);
  }
  return { expectedAbstention: entry };
};

const requiredStrings = (value: Record<string, unknown>, key: string, index: number): string[] => {
  const entry = value[key];
  if (!Array.isArray(entry)) {
    throw new TypeError(`Evaluation fixture ${index} requires a string array ${key}`);
  }
  const strings = entry.filter((item): item is string => typeof item === "string");
  if (strings.length !== entry.length || strings.some((item) => item.length === 0)) {
    throw new TypeError(`Evaluation fixture ${index} requires a string array ${key}`);
  }
  return strings;
};

const hasRule = (plugins: PluginMap, ruleId: string): boolean => {
  const separator = ruleId.indexOf("/");
  if (separator <= 0) {
    return false;
  }
  const plugin = plugins[ruleId.slice(0, separator)];
  return plugin?.rules[ruleId.slice(separator + 1)] !== undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};
