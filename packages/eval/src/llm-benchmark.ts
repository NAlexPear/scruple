import { createHash } from "node:crypto";

import type { JsonValue, PluginMap, SourceParser } from "@scruple/core";
import type { EvalFixture } from "@scruple/eval";

export const OPENAI_MODEL = "gpt-4.1-2025-04-14";
export const LLM_PROMPT_VERSION = "scruple-direct-choice-v1";
export const LLM_SYSTEM_PROMPT =
  "You classify one Scruple rule question using only the supplied bounded evidence. Select exactly one listed choice. Select insufficient_context only when the evidence does not support another choice. Do not inspect or infer facts from the wider repository.";

export type ComparisonCategory = "detected/correct" | "applicable miss" | "unsupported capability";

export interface LlmBenchmarkTask {
  id: string;
  ruleId: string;
  expectedChoice: string;
  expectedFinding: boolean;
  evidence: JsonValue;
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  hash: string;
}

export interface LlmAnswer {
  choice: string;
  rationale: string;
}

export interface LlmCallResult {
  model: string;
  answer: LlmAnswer;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmEvaluator {
  evaluate(task: LlmBenchmarkTask, signal?: AbortSignal): Promise<LlmCallResult>;
  unsupportedReason?(task: LlmBenchmarkTask): string | undefined;
}

export interface LlmCaseResult {
  id: string;
  ruleId: string;
  repetition: number;
  expectedChoice: string;
  expectedFinding: boolean;
  actualChoice?: string;
  rationale?: string;
  abstained: boolean;
  category: ComparisonCategory;
  unsupportedReason?: string;
  operationalError?: string;
  latencyMs: number;
  model?: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmBenchmarkReport {
  schemaVersion: 1;
  benchmark: "direct-hosted-llm";
  provider: string;
  requestedModel: string;
  prompt: { version: string; sha256: string; system: string };
  settings: { temperature: 0; concurrency: number; repetitions: number; warmups: number };
  workload: { fixtureCount: number; fixtureIds: string[]; taskHashes: Record<string, string> };
  cases: LlmCaseResult[];
  summary: {
    categories: Record<ComparisonCategory, number>;
    correctness: { correct: number; denominator: number; rate: number | null };
    recall: { correctFindings: number; denominator: number; rate: number | null };
    abstentions: number;
    operationalErrors: number;
    latencyMs: { mean: number; p50: number; p95: number };
    throughputCasesPerSecond: number;
    usage: { inputTokens: number; outputTokens: number };
  };
}

export const buildLlmBenchmarkTasks = (
  fixtures: readonly EvalFixture[],
  parser: SourceParser,
  plugins: PluginMap,
): LlmBenchmarkTask[] => {
  return fixtures.flatMap((fixture) => {
    const separator = fixture.ruleId.indexOf("/");
    const plugin = plugins[fixture.ruleId.slice(0, separator)];
    const factory = plugin?.rules[fixture.ruleId.slice(separator + 1)];
    if (factory === undefined) {
      throw new Error(`No rule configured for benchmark fixture: ${fixture.ruleId}`);
    }
    const candidates = factory().collect(parser.parse(fixture.filename, fixture.source));
    if (candidates.length !== fixture.expectedCandidates) {
      throw new Error(
        `${fixture.id} expected ${fixture.expectedCandidates} candidates, received ${candidates.length}`,
      );
    }
    return candidates.map((candidate, index) => {
      if (candidate.question.type !== "choice") {
        throw new Error(`${fixture.id} candidate ${index} is not a choice question`);
      }
      const expectedChoice = fixture.expectedChoices[index];
      if (expectedChoice === undefined) {
        throw new Error(`${fixture.id} has no expected choice for candidate ${index}`);
      }
      const content = {
        id: fixture.id,
        ruleId: fixture.ruleId,
        expectedChoice,
        expectedFinding: fixture.expectedFinding,
        evidence: candidate.state,
        question: {
          instructions: candidate.question.instructions,
          criteria: candidate.question.criteria,
        },
      };
      return Object.assign(content, { hash: sha256(stableJson(content)) });
    });
  });
};

export const verifyTaskManifest = (tasks: readonly LlmBenchmarkTask[], manifest: unknown): void => {
  if (!isRecord(manifest) || manifest["schemaVersion"] !== 1 || !isRecord(manifest["tasks"])) {
    throw new Error("LLM benchmark manifest must contain schemaVersion 1 and tasks");
  }
  const expected = manifest["tasks"];
  const actual = Object.fromEntries(tasks.map((task) => [task.id, task.hash]));
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      "LLM benchmark fixture drift detected; review and update the pinned task manifest",
    );
  }
};

export const parseStructuredAnswer = (value: unknown, choices: readonly string[]): LlmAnswer => {
  if (!isRecord(value)) {
    throw new Error("Structured response must be an object");
  }
  const choice = value["choice"];
  const rationale = value["rationale"];
  if (typeof choice !== "string" || !choices.includes(choice)) {
    throw new Error("Structured response choice is not one of the requested choices");
  }
  if (typeof rationale !== "string" || rationale.length === 0) {
    throw new Error("Structured response requires a nonempty rationale");
  }
  return { choice, rationale };
};

export const runLlmBenchmark = async (options: {
  tasks: readonly LlmBenchmarkTask[];
  evaluator: LlmEvaluator;
  provider: string;
  requestedModel: string;
  concurrency: number;
  repetitions: number;
  warmups: number;
}): Promise<LlmBenchmarkReport> => {
  positiveInteger(options.concurrency, "concurrency");
  positiveInteger(options.repetitions, "repetitions");
  if (!Number.isSafeInteger(options.warmups) || options.warmups < 0) {
    throw new Error("warmups must be a nonnegative integer");
  }
  if (options.tasks.length === 0) {
    throw new Error("LLM benchmark requires at least one task");
  }

  await runRepetitions(options.warmups, () =>
    mapConcurrent(options.tasks, options.concurrency, (task) =>
      runCase(task, 0, options.evaluator),
    ),
  );
  const started = performance.now();
  const samples = await runRepetitions(options.repetitions, (index) =>
    mapConcurrent(options.tasks, options.concurrency, (task) =>
      runCase(task, index + 1, options.evaluator),
    ),
  );
  const cases = samples.flat();
  const durationMs = performance.now() - started;
  return createReport(options, cases, durationMs);
};

const runCase = async (
  task: LlmBenchmarkTask,
  repetition: number,
  evaluator: LlmEvaluator,
): Promise<LlmCaseResult> => {
  const started = performance.now();
  const unsupportedReason = evaluator.unsupportedReason?.(task);
  if (unsupportedReason !== undefined) {
    return {
      ...caseIdentity(task, repetition),
      abstained: false,
      category: "unsupported capability",
      unsupportedReason,
      latencyMs: performance.now() - started,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
  try {
    const result = await evaluator.evaluate(task);
    return {
      ...caseIdentity(task, repetition),
      actualChoice: result.answer.choice,
      rationale: result.answer.rationale,
      abstained: result.answer.choice === "insufficient_context",
      category:
        result.answer.choice === task.expectedChoice ? "detected/correct" : "applicable miss",
      latencyMs: performance.now() - started,
      model: result.model,
      usage: result.usage,
    };
  } catch (error) {
    return {
      ...caseIdentity(task, repetition),
      abstained: false,
      category: "applicable miss",
      operationalError: error instanceof Error ? error.message : String(error),
      latencyMs: performance.now() - started,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
};

const createReport = (
  options: {
    tasks: readonly LlmBenchmarkTask[];
    provider: string;
    requestedModel: string;
    concurrency: number;
    repetitions: number;
    warmups: number;
  },
  cases: LlmCaseResult[],
  durationMs: number,
): LlmBenchmarkReport => {
  const applicable = cases.filter((item) => item.category !== "unsupported capability");
  const correct = applicable.filter((item) => item.category === "detected/correct");
  const positive = applicable.filter((item) => item.expectedFinding);
  const correctPositive = positive.filter((item) => item.category === "detected/correct");
  const categories: Record<ComparisonCategory, number> = {
    "detected/correct": correct.length,
    "applicable miss": cases.filter((item) => item.category === "applicable miss").length,
    "unsupported capability": cases.filter((item) => item.category === "unsupported capability")
      .length,
  };
  const latencies = applicable.map((item) => item.latencyMs);
  return {
    schemaVersion: 1,
    benchmark: "direct-hosted-llm",
    provider: options.provider,
    requestedModel: options.requestedModel,
    prompt: {
      version: LLM_PROMPT_VERSION,
      sha256: sha256(LLM_SYSTEM_PROMPT),
      system: LLM_SYSTEM_PROMPT,
    },
    settings: {
      temperature: 0,
      concurrency: options.concurrency,
      repetitions: options.repetitions,
      warmups: options.warmups,
    },
    workload: {
      fixtureCount: options.tasks.length,
      fixtureIds: options.tasks.map((task) => task.id),
      taskHashes: Object.fromEntries(options.tasks.map((task) => [task.id, task.hash])),
    },
    cases,
    summary: {
      categories,
      correctness: metric(correct.length, applicable.length),
      recall: {
        correctFindings: correctPositive.length,
        denominator: positive.length,
        rate: ratio(correctPositive.length, positive.length),
      },
      abstentions: cases.filter((item) => item.abstained).length,
      operationalErrors: cases.filter((item) => item.operationalError !== undefined).length,
      latencyMs: {
        mean: latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length),
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
      },
      throughputCasesPerSecond: durationMs === 0 ? 0 : (applicable.length * 1_000) / durationMs,
      usage: {
        inputTokens: cases.reduce((sum, item) => sum + item.usage.inputTokens, 0),
        outputTokens: cases.reduce((sum, item) => sum + item.usage.outputTokens, 0),
      },
    },
  };
};

const caseIdentity = (task: LlmBenchmarkTask, repetition: number) => ({
  id: task.id,
  ruleId: task.ruleId,
  repetition,
  expectedChoice: task.expectedChoice,
  expectedFinding: task.expectedFinding,
});

const metric = (correct: number, denominator: number) => ({
  correct,
  denominator,
  rate: ratio(correct, denominator),
});
const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;
const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
};
const positiveInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
};
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    isRecord(entry)
      ? Object.fromEntries(
          Object.entries(entry).toSorted(([left], [right]) => left.localeCompare(right)),
        )
      : entry,
  );
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mapConcurrent = async <Input, Output>(
  values: readonly Input[],
  concurrency: number,
  run: (value: Input) => Promise<Output>,
): Promise<Output[]> => {
  let nextIndex = 0;
  const runWorker = async (): Promise<{ index: number; value: Output }[]> => {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= values.length) {
      return [];
    }
    const value = await run(values[index]!);
    return [{ index, value }, ...(await runWorker())];
  };
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker());
  return (await Promise.all(workers))
    .flat()
    .toSorted((left, right) => left.index - right.index)
    .map((entry) => entry.value);
};

const runRepetitions = async <Output>(
  count: number,
  run: (index: number) => Promise<Output>,
  index = 0,
): Promise<Output[]> => {
  if (index >= count) {
    return [];
  }
  const result = await run(index);
  return [result, ...(await runRepetitions(count, run, index + 1))];
};
