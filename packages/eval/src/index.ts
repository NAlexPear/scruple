import type {
  AnySemanticRule,
  CollectionContext,
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  PluginMap,
  RuleCandidate,
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
  expectedCandidates: number;
  expectedChoices: string[];
  /** Recorded collection-time choices used for deterministic corpus validation and task building. */
  collectionChoices?: string[];
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
  answers: DecisionAnswer[];
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

/** Detection quality for a set of cases, derived from the finding expectations fixtures already carry. */
export interface DetectionMetrics {
  /** Total cases represented, including invalid cases that were not scored. */
  cases: number;
  invalid: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  /** Null rather than zero when nothing was predicted. */
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositiveRate: number | null;
  specificity: number | null;
}

export interface AbstentionMetrics {
  expected: number;
  actual: number;
  correct: number;
  unexpected: number;
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
  detection: DetectionMetrics;
  /** Per rule, so severity can be chosen per rule rather than globally. */
  detectionByRule: Record<string, DetectionMetrics>;
  /** Decision-level abstention quality, separate from diagnostic detection quality. */
  abstention: AbstentionMetrics;
  abstentionByRule: Record<string, AbstentionMetrics>;
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
      ...optionalCollectionChoices(entry, index),
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

export const validateEvalCorpus = async (
  fixtures: readonly EvalFixture[],
  parser: SourceParser,
  plugins: PluginMap,
): Promise<void> => {
  const fixturesByRule = new Map<string, EvalFixture[]>();
  for (const fixture of fixtures) {
    const ruleFixtures = fixturesByRule.get(fixture.ruleId) ?? [];
    ruleFixtures.push(fixture);
    fixturesByRule.set(fixture.ruleId, ruleFixtures);
  }
  const registeredRules = new Map<string, AnySemanticRule>();
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
  await Promise.all(
    [...registeredRules].map(async ([ruleId, rule]) => {
      const ruleFixtures = fixturesByRule.get(ruleId) ?? [];
      if (ruleFixtures.length === 0) {
        throw new Error(`Registered semantic rule has no evaluation fixtures: ${ruleId}`);
      }
      const outcomes = new Set(ruleFixtures.map((fixture) => fixture.expectedFinding));
      if (!outcomes.has(true) || !outcomes.has(false)) {
        throw new Error(`Evaluation rule requires positive and safe fixtures: ${ruleId}`);
      }
      const collectedFixtures = await Promise.all(
        ruleFixtures.map(async (fixture) => ({
          fixture,
          candidates: await collectEvalCandidates(fixture, rule, parser),
        })),
      );
      for (const { fixture, candidates } of collectedFixtures) {
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
    }),
  );
};

export const collectEvalCandidates = async (
  fixture: EvalFixture,
  rule: AnySemanticRule,
  parser: SourceParser,
): Promise<RuleCandidate[]> => {
  const document = parser.parse(fixture.filename, fixture.source);
  if (fixture.collectionChoices === undefined) {
    return rule.collect(document);
  }
  let nextChoice = 0;
  const context: CollectionContext = {
    provider: {
      id: "eval-fixture",
      evaluate(_target, request): Promise<DecisionResponse> {
        const answers: Record<string, DecisionAnswer> = {};
        for (const [id, question] of Object.entries(request.questions)) {
          if (question.type !== "choice") {
            throw new Error(`${fixture.id} collection_choices can only answer choice questions`);
          }
          const choice = fixture.collectionChoices?.[nextChoice];
          if (choice === undefined) {
            throw new Error(`${fixture.id} has fewer collection_choices than collection questions`);
          }
          if (!(choice in question.criteria)) {
            throw new Error(`${fixture.id} collection choice ${choice} is not a criterion`);
          }
          nextChoice += 1;
          answers[id] = {
            type: "choice",
            choice,
            confidence: 1,
            probabilities: { [choice]: 1 },
          };
        }
        return Promise.resolve({ model: "eval-fixture", answers });
      },
    },
  };
  const candidates = await rule.collect(document, context);
  if (nextChoice !== fixture.collectionChoices.length) {
    throw new Error(`${fixture.id} has unused collection_choices`);
  }
  return candidates;
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
    undefined,
    { includeDecisions: true },
  );
  const actualFinding = result.diagnostics.some(
    (diagnostic) => diagnostic.ruleId === fixture.ruleId,
  );
  const actualCandidates = result.stats.candidates;
  const errors = result.errors.map((error) => error.message);
  const answers = (result.decisions ?? []).map((decision) => decision.answer);
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
    answers,
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

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

const detectionMetrics = (cases: readonly EvalCaseResult[]): DetectionMetrics => {
  const scored = cases.filter((result) => result.errors.length === 0);
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  for (const result of scored) {
    if (result.expectedFinding && result.actualFinding) {
      truePositives += 1;
    } else if (!result.expectedFinding && result.actualFinding) {
      falsePositives += 1;
    } else if (result.expectedFinding && !result.actualFinding) {
      falseNegatives += 1;
    } else {
      trueNegatives += 1;
    }
  }
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  const falsePositiveRate = ratio(falsePositives, falsePositives + trueNegatives);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return {
    cases: cases.length,
    invalid: cases.length - scored.length,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    f1,
    falsePositiveRate,
    specificity: ratio(trueNegatives, trueNegatives + falsePositives),
  };
};

const casesByRuleId = (cases: readonly EvalCaseResult[]): Map<string, EvalCaseResult[]> => {
  const grouped = new Map<string, EvalCaseResult[]>();
  for (const result of cases) {
    const bucket = grouped.get(result.ruleId) ?? [];
    bucket.push(result);
    grouped.set(result.ruleId, bucket);
  }
  return grouped;
};

const detectionByRuleId = (cases: readonly EvalCaseResult[]): Record<string, DetectionMetrics> => {
  const grouped = casesByRuleId(cases);
  const byRule: Record<string, DetectionMetrics> = {};
  for (const ruleId of [...grouped.keys()].toSorted()) {
    byRule[ruleId] = detectionMetrics(grouped.get(ruleId) ?? []);
  }
  return byRule;
};

const abstentionMetrics = (cases: readonly EvalCaseResult[]): AbstentionMetrics => {
  const valid = cases.filter((result) => result.errors.length === 0);
  return {
    expected: cases.filter((result) => result.expectedAbstention === true).length,
    actual: valid.filter((result) => result.actualAbstention).length,
    correct: valid.filter((result) => result.expectedAbstention === true && result.actualAbstention)
      .length,
    unexpected: valid.filter(
      (result) => result.expectedAbstention !== true && result.actualAbstention,
    ).length,
  };
};

const abstentionByRuleId = (
  cases: readonly EvalCaseResult[],
): Record<string, AbstentionMetrics> => {
  const grouped = casesByRuleId(cases);
  const byRule: Record<string, AbstentionMetrics> = {};
  for (const ruleId of [...grouped.keys()].toSorted()) {
    byRule[ruleId] = abstentionMetrics(grouped.get(ruleId) ?? []);
  }
  return byRule;
};

export const runEvaluation = async (options: RunEvaluationOptions): Promise<EvalRunReport> => {
  const cases: EvalCaseResult[] = [];
  const concurrency = Math.max(1, Math.floor(options.provider.concurrency ?? 1));
  const entries = options.fixtures.entries();
  const runWorker = async (): Promise<void> => {
    const next = entries.next();
    if (next.done !== true) {
      const [index, fixture] = next.value;
      cases[index] = await runEvalCase(
        fixture,
        options.parser,
        options.plugins,
        options.rules?.[fixture.ruleId] ?? "warn",
        options.provider,
      );
      await runWorker();
    }
  };
  // Each case runs its own runScruple, so bound cases by the provider's concurrency too.
  await Promise.all(
    Array.from({ length: Math.min(concurrency, options.fixtures.length) }, runWorker),
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
    detection: detectionMetrics(cases),
    detectionByRule: detectionByRuleId(cases),
    abstention: abstentionMetrics(cases),
    abstentionByRule: abstentionByRuleId(cases),
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

export const formatEvalRuns = (runs: readonly EvalRunReport[]): string => {
  if (runs.length === 0) {
    return "No evaluation runs.\n";
  }
  const grouped = new Map<
    string,
    { provider: string; requestedModel: string; runs: EvalRunReport[] }
  >();
  for (const run of runs) {
    const key = JSON.stringify([run.provider, run.requestedModel]);
    const group = grouped.get(key) ?? {
      provider: run.provider,
      requestedModel: run.requestedModel,
      runs: [],
    };
    group.runs.push(run);
    grouped.set(key, group);
  }
  return `${[...grouped.values()].map((group) => formatEvalRunGroup(group)).join("\n")}\n`;
};

const formatEvalRunGroup = (group: {
  provider: string;
  requestedModel: string;
  runs: readonly EvalRunReport[];
}): string => {
  const cases = group.runs.flatMap((run) => run.cases);
  const detection = detectionMetrics(cases);
  const detectionByRule = detectionByRuleId(cases);
  const abstention = abstentionMetrics(cases);
  const abstentionByRule = abstentionByRuleId(cases);
  const failures = group.runs.flatMap((run) =>
    run.failures.map((failure) => ({ failure, repetition: run.repetition })),
  );
  const ruleIds = Object.keys(detectionByRule).toSorted();
  const ruleWidth = Math.max("Rule".length, ...ruleIds.map((ruleId) => ruleId.length));
  const lines = [
    `${group.provider}/${group.requestedModel} · ${group.runs.length} ${group.runs.length === 1 ? "run" : "runs"}`,
    `Cases: ${cases.length} · passed ${cases.length - failures.length} · failed ${failures.length}`,
    `Detection: ${detection.cases - detection.invalid} scored · ${detection.invalid} invalid`,
    `Abstentions: ${abstention.correct}/${abstention.expected} expected correct · ${abstention.actual} actual · ${abstention.unexpected} unexpected`,
    "",
    `${"Rule".padEnd(ruleWidth)}  ${"Cases".padStart(5)}  ${"Err".padStart(3)}  ${"TP".padStart(3)}  ${"FP".padStart(3)}  ${"TN".padStart(3)}  ${"FN".padStart(3)}  ${"Prec".padStart(6)}  ${"Recall".padStart(6)}  ${"FPR".padStart(6)}  ${"Abstain".padStart(7)}  ${"Unexp".padStart(5)}`,
  ];
  for (const ruleId of ruleIds) {
    const metrics = detectionByRule[ruleId];
    const ruleAbstention = abstentionByRule[ruleId];
    if (metrics === undefined || ruleAbstention === undefined) {
      continue;
    }
    lines.push(
      `${ruleId.padEnd(ruleWidth)}  ${formatCount(metrics.cases, 5)}  ${formatCount(metrics.invalid, 3)}  ${formatCount(metrics.truePositives, 3)}  ${formatCount(metrics.falsePositives, 3)}  ${formatCount(metrics.trueNegatives, 3)}  ${formatCount(metrics.falseNegatives, 3)}  ${formatRate(metrics.precision)}  ${formatRate(metrics.recall)}  ${formatRate(metrics.falsePositiveRate)}  ${`${ruleAbstention.correct}/${ruleAbstention.expected}`.padStart(7)}  ${formatCount(ruleAbstention.unexpected, 5)}`,
    );
  }
  lines.push("", "Rates describe this fixture corpus; Cases shows the sample support.");
  if (failures.length > 0) {
    lines.push("", "Failures:");
    for (const { failure, repetition } of failures) {
      lines.push(`  run ${repetition}: ${failure.id} (${failure.ruleId})`);
    }
  }
  return lines.join("\n");
};

const formatCount = (value: number, width: number): string => String(value).padStart(width);

const formatRate = (value: number | null): string =>
  (value === null ? "—" : `${(value * 100).toFixed(1)}%`).padStart(6);

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

const optionalCollectionChoices = (
  value: Record<string, unknown>,
  index: number,
): { collectionChoices?: string[] } => {
  if (value["collection_choices"] === undefined) {
    return {};
  }
  return { collectionChoices: requiredStrings(value, "collection_choices", index) };
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
