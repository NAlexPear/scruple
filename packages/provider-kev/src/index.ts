import type {
  ChoiceAnswer,
  DecisionAnswer,
  DecisionProvider,
  DecisionQuestion,
  DecisionRequest,
  DecisionResponse,
  JsonValue,
  ScoreAnswer,
} from "@scruple/core";

export interface KevProviderOptions {
  apiKey?: string;
  baseURL?: string;
  checkpoint?: string;
  concurrency?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const kevProvider = (options: KevProviderOptions = {}): DecisionProvider => {
  if (options.apiKey !== undefined && options.apiKey.trim().length === 0) {
    throw new TypeError("Kev apiKey must not be empty");
  }
  const checkpoint =
    options.checkpoint === undefined
      ? "kev-latest"
      : requiredOption(options.checkpoint, "checkpoint");
  const concurrency = positiveInteger(options.concurrency ?? 32, "concurrency");
  const timeoutMs = positiveInteger(options.timeoutMs ?? 60_000, "timeoutMs");
  const baseURL = requiredOption(options.baseURL ?? "http://127.0.0.1:8009", "baseURL").replace(
    /\/+$/u,
    "",
  );
  const request = options.fetch ?? fetch;

  return {
    id: `kev:${checkpoint}`,
    concurrency,

    async evaluate(decision: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse> {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const requestSignal =
        signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
      };
      if (options.apiKey !== undefined) {
        headers["authorization"] = `Bearer ${options.apiKey}`;
      }
      const response = await request(`${baseURL}/v1/systemone`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "kev-latest",
          state: decision.state,
          questions: decision.questions,
        }),
        signal: requestSignal,
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        throw new Error(`Kev HTTP ${response.status}: ${apiError(payload)}`);
      }
      return parseDecisionResponse(payload, decision.questions);
    },
  };
};

const requiredOption = (value: string, name: string): string => {
  if (value.trim().length === 0) {
    throw new TypeError(`Kev ${name} must not be empty`);
  }
  return value;
};

const positiveInteger = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Kev ${name} must be a positive integer`);
  }
  return value;
};

const responsePayload = async (response: Response): Promise<unknown> => {
  const body = await response.text();
  try {
    return JSON.parse(body) as unknown;
  } catch (cause) {
    if (!response.ok) {
      throw new Error(`Kev HTTP ${response.status}: invalid JSON response`, { cause });
    }
    throw new TypeError("Kev response must be valid JSON", { cause });
  }
};

const apiError = (payload: unknown): string => {
  if (!isRecord(payload)) {
    return "unknown API error";
  }
  const detail = payload["detail"];
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((entry) =>
      isRecord(entry) && typeof entry["msg"] === "string" ? [entry["msg"]] : [],
    );
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  return "unknown API error";
};

const parseDecisionResponse = (
  value: unknown,
  questions: Record<string, DecisionQuestion>,
): DecisionResponse => {
  if (
    !isRecord(value) ||
    typeof value["model"] !== "string" ||
    value["model"].trim().length === 0 ||
    !isRecord(value["answers"])
  ) {
    throw new TypeError("Kev response must contain a model and answers");
  }
  const rawAnswers = value["answers"];
  if (!sameKeys(rawAnswers, Object.keys(questions))) {
    throw new TypeError("Kev response answer names must match the request");
  }
  const answers: Record<string, DecisionAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    answers[name] = parseAnswer(name, rawAnswers[name], question);
  }
  if (!isRecord(value["usage"])) {
    throw new TypeError("Kev response must contain usage");
  }
  const inputTokens = tokenCount(value["usage"]["input_tokens"], "input_tokens");
  const outputTokens = tokenCount(value["usage"]["output_tokens"], "output_tokens");
  return { model: value["model"], answers, usage: { inputTokens, outputTokens } };
};

const parseAnswer = (name: string, value: unknown, question: DecisionQuestion): DecisionAnswer => {
  if (!isRecord(value) || value["type"] !== question.type) {
    throw new TypeError(`Kev answer ${name} has the wrong type`);
  }
  if (question.type === "noul") {
    return { type: "noul", noul: probability(value["noul"], `${name}.noul`) };
  }
  if (question.type === "choice") {
    const choice = value["choice"];
    if (typeof choice !== "string" || !(choice in question.criteria)) {
      throw new TypeError(`Kev answer ${name} has an invalid choice`);
    }
    return {
      type: "choice",
      choice,
      confidence: probability(value["confidence"], `${name}.confidence`),
      probabilities: probabilityMap(value["probabilities"], Object.keys(question.criteria), name),
    } satisfies ChoiceAnswer;
  }
  const labels = question.criteria.map((_criterion, index) => String(index));
  const score = value["score"];
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > question.criteria.length - 1
  ) {
    throw new TypeError(`Kev answer ${name} has an invalid score`);
  }
  return {
    type: "score",
    score,
    confidence: probability(value["confidence"], `${name}.confidence`),
    probabilities: probabilityMap(value["probabilities"], labels, name),
    legend: legend(value["legend"], labels, name),
  } satisfies ScoreAnswer;
};

const probabilityMap = (
  value: unknown,
  expectedLabels: readonly string[],
  name: string,
): Record<string, number> => {
  if (!isRecord(value) || !sameKeys(value, expectedLabels)) {
    throw new TypeError(`Kev answer ${name} has invalid probability labels`);
  }
  return Object.fromEntries(
    expectedLabels.map((label) => [label, probability(value[label], `${name}.${label}`)]),
  );
};

const legend = (
  value: unknown,
  expectedLabels: readonly string[],
  name: string,
): Record<string, JsonValue> => {
  if (!isRecord(value) || !sameKeys(value, expectedLabels)) {
    throw new TypeError(`Kev answer ${name} has an invalid legend`);
  }
  const parsed: Record<string, JsonValue> = {};
  for (const label of expectedLabels) {
    const entry = value[label];
    if (!isJsonValue(entry)) {
      throw new TypeError(`Kev answer ${name} has an invalid legend value`);
    }
    parsed[label] = entry;
  }
  return parsed;
};

const sameKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => key in value);
};

const probability = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`Kev probability ${name} must be between 0 and 1`);
  }
  return value;
};

const tokenCount = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`Kev usage ${name} must be a non-negative integer`);
  }
  return value;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }
  return isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
