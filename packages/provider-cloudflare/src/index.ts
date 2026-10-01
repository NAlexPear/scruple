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

export type CloudflareModel = "clef" | "clef-flash";

export interface CloudflareProviderOptions {
  accountId: string;
  apiToken: string;
  model?: CloudflareModel;
  baseURL?: string;
  concurrency?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const cloudflareProvider = (options: CloudflareProviderOptions): DecisionProvider => {
  const accountId = requiredOption(options.accountId, "accountId");
  const apiToken = requiredOption(options.apiToken, "apiToken");
  const model = options.model ?? "clef";
  if (model !== "clef" && model !== "clef-flash") {
    throw new TypeError('Cloudflare model must be "clef" or "clef-flash"');
  }
  const concurrency = positiveInteger(options.concurrency ?? 4, "concurrency");
  const timeoutMs = positiveInteger(options.timeoutMs ?? 30_000, "timeoutMs");
  const baseURL = requiredOption(
    options.baseURL ?? "https://api.cloudflare.com/client/v4",
    "baseURL",
  ).replace(/\/+$/u, "");
  const request = options.fetch ?? fetch;
  const endpoint = `${baseURL}/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/cloudflare/${model}`;

  return {
    id: `cloudflare:${model}`,
    concurrency,

    async evaluate(decision: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse> {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const requestSignal =
        signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
      const response = await request(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, state: decision.state, questions: decision.questions }),
        signal: requestSignal,
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        throw new Error(`Cloudflare HTTP ${response.status}: ${apiError(payload)}`);
      }
      if (!isRecord(payload) || payload["success"] !== true) {
        throw new TypeError("Cloudflare response must be a successful API envelope");
      }
      return parseDecisionResponse(payload["result"], decision.questions);
    },
  };
};

const requiredOption = (value: string, name: string): string => {
  if (value.trim().length === 0) {
    throw new TypeError(`Cloudflare ${name} must not be empty`);
  }
  return value;
};

const positiveInteger = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Cloudflare ${name} must be a positive integer`);
  }
  return value;
};

const responsePayload = async (response: Response): Promise<unknown> => {
  const body = await response.text();
  try {
    return JSON.parse(body) as unknown;
  } catch (cause) {
    if (!response.ok) {
      throw new Error(`Cloudflare HTTP ${response.status}: invalid JSON response`, { cause });
    }
    throw new TypeError("Cloudflare response must be valid JSON", { cause });
  }
};

const apiError = (payload: unknown): string => {
  if (!isRecord(payload)) {
    return "unknown API error";
  }
  const errors = payload["errors"];
  if (Array.isArray(errors)) {
    for (const error of errors) {
      if (isRecord(error) && typeof error["message"] === "string") {
        return error["message"];
      }
    }
  }
  return "unknown API error";
};

const parseDecisionResponse = (
  value: unknown,
  questions: Record<string, DecisionQuestion>,
): DecisionResponse => {
  if (!isRecord(value) || typeof value["model"] !== "string" || !isRecord(value["answers"])) {
    throw new TypeError("Cloudflare result must contain a model and answers");
  }
  const rawAnswers = value["answers"];
  if (Object.keys(rawAnswers).some((name) => questions[name] === undefined)) {
    throw new TypeError("Cloudflare result contains an unexpected answer");
  }
  const answers: Record<string, DecisionAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    answers[name] = parseAnswer(name, rawAnswers[name], question);
  }
  if (!isRecord(value["usage"])) {
    throw new TypeError("Cloudflare result must contain usage");
  }
  const inputTokens = tokenCount(value["usage"]["input_tokens"], "input_tokens");
  const outputTokens = tokenCount(value["usage"]["output_tokens"], "output_tokens");
  return { model: value["model"], answers, usage: { inputTokens, outputTokens } };
};

const parseAnswer = (name: string, value: unknown, question: DecisionQuestion): DecisionAnswer => {
  if (!isRecord(value) || value["type"] !== question.type) {
    throw new TypeError(`Cloudflare answer ${name} has the wrong type`);
  }
  if (question.type === "noul") {
    return { type: "noul", noul: probability(value["noul"], `${name}.noul`) };
  }
  if (question.type === "choice") {
    const choice = value["choice"];
    if (typeof choice !== "string" || question.criteria[choice] === undefined) {
      throw new TypeError(`Cloudflare answer ${name} has an invalid choice`);
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
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new TypeError(`Cloudflare answer ${name} has an invalid score`);
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
    throw new TypeError(`Cloudflare answer ${name} has invalid probability labels`);
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
    throw new TypeError(`Cloudflare answer ${name} has an invalid legend`);
  }
  const parsed: Record<string, JsonValue> = {};
  for (const label of expectedLabels) {
    const entry = value[label];
    if (!isJsonValue(entry)) {
      throw new TypeError(`Cloudflare answer ${name} has an invalid legend value`);
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
    throw new TypeError(`Cloudflare probability ${name} must be between 0 and 1`);
  }
  return value;
};

const tokenCount = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`Cloudflare usage ${name} must be a non-negative integer`);
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
