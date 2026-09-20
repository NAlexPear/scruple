import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  PluginMap,
  RuleCandidate,
  RuleConfiguration,
  SemanticRule,
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
  expectedCandidates: number;
  expectedChoices: string[];
  expectedAbstention?: boolean;
  rationale: string;
  tags: string[];
}

export interface EvalCaseResult {
  id: string;
  ruleId: string;
  expectedFinding: boolean;
  actualFinding: boolean;
  expectedCandidates: number;
  actualCandidates: number;
  expectedChoices: string[];
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

interface FixtureDefaults {
  expectedCandidates?: number;
  ruleChoices?: Record<string, { finding: string; safe: string }>;
}

export const parseEvalFixtures = (value: unknown): EvalFixture[] => {
  const { entries, defaults } = fixtureEntries(value);
  const ids = new Set<string>();
  const fixtures: EvalFixture[] = [];
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Evaluation fixture ${index} must be an object`);
    }
    const ruleId = requiredString(entry, "rule_id", index);
    const expectedFinding = requiredBoolean(entry, "expected_finding", index);
    const expectedCandidates = expectedCandidateCount(entry, defaults, index);
    const fixture: EvalFixture = {
      id: requiredString(entry, "id", index),
      filename: requiredString(entry, "filename", index),
      source: requiredString(entry, "source", index),
      ruleId,
      expectedFinding,
      expectedCandidates,
      expectedChoices: expectedChoices(
        entry,
        defaults.ruleChoices?.[ruleId],
        expectedFinding,
        expectedCandidates,
        index,
      ),
      ...optionalExpectedAbstention(entry, index),
      rationale: requiredString(entry, "rationale", index),
      tags: requiredStrings(entry, "tags", index),
    };
    if (ids.has(fixture.id)) {
      throw new Error(`Duplicate evaluation fixture ID: ${fixture.id}`);
    }
    ids.add(fixture.id);
    fixtures.push(fixture);
  });
  return fixtures;
};

export const validateEvalCorpus = (
  fixtures: readonly EvalFixture[],
  parser: SourceParser,
  plugins: PluginMap,
): void => {
  const fixturesByRule = new Map<string, EvalFixture[]>();
  for (const fixture of fixtures) {
    const ruleFixtures = fixturesByRule.get(fixture.ruleId) ?? [];
    ruleFixtures.push(fixture);
    fixturesByRule.set(fixture.ruleId, ruleFixtures);
  }
  const registeredRules = new Map<string, SemanticRule>();
  for (const [namespace, plugin] of Object.entries(plugins)) {
    for (const [ruleName, factory] of Object.entries(plugin.rules)) {
      registeredRules.set(`${namespace}/${ruleName}`, factory());
    }
  }

  for (const ruleId of fixturesByRule.keys()) {
    if (!registeredRules.has(ruleId)) {
      throw new Error(`Evaluation fixture rule is not registered: ${ruleId}`);
    }
  }
  for (const [ruleId, rule] of registeredRules) {
    const ruleFixtures = fixturesByRule.get(ruleId) ?? [];
    if (ruleFixtures.length === 0) {
      throw new Error(`Registered semantic rule has no evaluation fixtures: ${ruleId}`);
    }
    const outcomes = new Set(ruleFixtures.map((fixture) => fixture.expectedFinding));
    if (!outcomes.has(true) || !outcomes.has(false)) {
      throw new Error(`Evaluation rule requires positive and safe fixtures: ${ruleId}`);
    }
    for (const fixture of ruleFixtures) {
      const candidates = rule.collect(parser.parse(fixture.filename, fixture.source));
      if (candidates.length !== fixture.expectedCandidates) {
        throw new Error(
          `${fixture.id} expected ${fixture.expectedCandidates} candidates for ${ruleId}, received ${candidates.length}`,
        );
      }
      assertUniqueCandidates(fixture, candidates);
      if (fixture.expectedChoices.length !== candidates.length) {
        throw new Error(
          `${fixture.id} expected_choices must contain one choice per candidate (${candidates.length})`,
        );
      }
      candidates.forEach((candidate, index) => {
        if (candidate.question.type !== "choice") {
          throw new Error(`${fixture.id} candidate ${index} does not use a choice question`);
        }
        const expectedChoice = fixture.expectedChoices[index];
        if (expectedChoice === undefined || !(expectedChoice in candidate.question.criteria)) {
          throw new Error(
            `${fixture.id} expected choice ${String(expectedChoice)} is not a criterion for candidate ${index}`,
          );
        }
      });
    }
  }
};

export const runEvalCase = async (
  fixture: EvalFixture,
  parser: SourceParser,
  plugins: PluginMap,
  ruleConfiguration: RuleConfiguration,
  provider: DecisionProvider,
): Promise<EvalCaseResult> => {
  if (!hasRule(plugins, fixture.ruleId)) {
    throw new Error(`No rule configured for evaluation fixture: ${fixture.ruleId}`);
  }
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
      const expectedIds = Object.keys(request.questions);
      const answerIds = Object.keys(response.answers);
      const missingIds = expectedIds.filter((id) => !(id in response.answers));
      const unexpectedIds = answerIds.filter((id) => !(id in request.questions));
      if (missingIds.length > 0 || unexpectedIds.length > 0) {
        const details = [
          ...(missingIds.length === 0 ? [] : [`missing: ${missingIds.join(", ")}`]),
          ...(unexpectedIds.length === 0 ? [] : [`unexpected: ${unexpectedIds.join(", ")}`]),
        ];
        throw new Error(`Provider answer IDs do not match request (${details.join("; ")})`);
      }
      answers.push(...expectedIds.map((id) => response.answers[id]!));
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
  const choiceAccepted = arraysEqual(actualChoices, fixture.expectedChoices);
  const abstentionAccepted =
    fixture.expectedAbstention === undefined || fixture.expectedAbstention === actualAbstention;
  return {
    id: fixture.id,
    ruleId: fixture.ruleId,
    expectedFinding: fixture.expectedFinding,
    actualFinding,
    expectedCandidates: fixture.expectedCandidates,
    actualCandidates,
    expectedChoices: fixture.expectedChoices,
    actualChoices,
    ...(fixture.expectedAbstention === undefined
      ? {}
      : { expectedAbstention: fixture.expectedAbstention }),
    actualAbstention,
    accepted:
      errors.length === 0 &&
      actualFinding === fixture.expectedFinding &&
      actualCandidates === fixture.expectedCandidates &&
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
    options.fixtures.map((fixture) =>
      runEvalCase(
        fixture,
        options.parser,
        options.plugins,
        options.rules?.[fixture.ruleId] ?? "warn",
        options.provider,
      ),
    ),
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

const requiredString = (
  value: Record<string, unknown>,
  key: string,
  index: number | string,
): string => {
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

const fixtureEntries = (value: unknown): { entries: unknown[]; defaults: FixtureDefaults } => {
  if (Array.isArray(value)) {
    return { entries: value, defaults: {} };
  }
  if (!isRecord(value) || !Array.isArray(value["fixtures"])) {
    throw new TypeError("Evaluation fixtures must be an array or a corpus object");
  }
  const defaultCandidates = value["default_expected_candidates"];
  if (
    typeof defaultCandidates !== "number" ||
    !Number.isSafeInteger(defaultCandidates) ||
    defaultCandidates < 0
  ) {
    throw new TypeError("Evaluation corpus requires a nonnegative default_expected_candidates");
  }
  const rawRuleChoices = value["rule_choices"];
  if (!isRecord(rawRuleChoices)) {
    throw new TypeError("Evaluation corpus requires rule_choices");
  }
  const ruleChoices: Record<string, { finding: string; safe: string }> = {};
  for (const [ruleId, choices] of Object.entries(rawRuleChoices)) {
    if (!isRecord(choices)) {
      throw new TypeError(`Evaluation rule choices for ${ruleId} must be an object`);
    }
    ruleChoices[ruleId] = {
      finding: requiredString(choices, "finding", ruleId),
      safe: requiredString(choices, "safe", ruleId),
    };
  }
  return {
    entries: value["fixtures"],
    defaults: { expectedCandidates: defaultCandidates, ruleChoices },
  };
};

const expectedChoices = (
  value: Record<string, unknown>,
  defaults: { finding: string; safe: string } | undefined,
  expectedFinding: boolean,
  expectedCandidates: number,
  index: number,
): string[] => {
  const entries = value["expected_choices"];
  if (entries !== undefined) {
    if (!Array.isArray(entries)) {
      throw new TypeError(`Evaluation fixture ${index} requires string array expected_choices`);
    }
    const choices = entries.filter((entry): entry is string => typeof entry === "string");
    if (choices.length !== entries.length || choices.some((choice) => choice.length === 0)) {
      throw new TypeError(`Evaluation fixture ${index} requires string array expected_choices`);
    }
    return choices;
  }
  const entry = value["expected_choice"];
  if (entry !== undefined && (typeof entry !== "string" || entry.length === 0)) {
    throw new TypeError(`Evaluation fixture ${index} requires a nonempty expected_choice`);
  }
  if (expectedCandidates === 0) {
    if (entry !== undefined) {
      throw new Error(`Evaluation fixture ${index} cannot expect a choice with zero candidates`);
    }
    return [];
  }
  if (expectedCandidates !== 1) {
    throw new Error(
      `Evaluation fixture ${index} requires expected_choices for ${expectedCandidates} candidates`,
    );
  }
  const choice = entry ?? (expectedFinding ? defaults?.finding : defaults?.safe);
  if (choice === undefined) {
    throw new Error(`Evaluation fixture ${index} requires an exact expected choice`);
  }
  return [choice];
};

const expectedCandidateCount = (
  value: Record<string, unknown>,
  defaults: FixtureDefaults,
  index: number,
): number => {
  const entry = value["expected_candidates"] ?? defaults.expectedCandidates;
  if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry < 0) {
    throw new TypeError(`Evaluation fixture ${index} requires a nonnegative expected_candidates`);
  }
  return entry;
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

const assertUniqueCandidates = (
  fixture: EvalFixture,
  candidates: readonly RuleCandidate[],
): void => {
  const identities = new Set<string>();
  for (const candidate of candidates) {
    const identity = JSON.stringify([
      candidate.target.kind,
      candidate.target.filename,
      candidate.target.range.start,
      candidate.target.range.end,
    ]);
    if (identities.has(identity)) {
      throw new Error(
        `${fixture.id} produced a duplicate candidate at ${candidate.target.location.start.line}`,
      );
    }
    identities.add(identity);
  }
};

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean => {
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};
