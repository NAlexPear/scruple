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

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  concurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  organization?: string;
  project?: string;
  fetch?: typeof fetch;
}

export const openaiProvider = (options: OpenAIProviderOptions): DecisionProvider => {
  const apiKey = requiredOption(options.apiKey, "apiKey");
  const model = requiredOption(options.model ?? "gpt-6-luna", "model");
  const baseURL = requiredOption(options.baseURL ?? "https://api.openai.com/v1", "baseURL").replace(
    /\/+$/u,
    "",
  );
  const concurrency = positiveInteger(options.concurrency ?? 16, "concurrency");
  const timeoutMs = positiveInteger(options.timeoutMs ?? 30_000, "timeoutMs");
  const maxRetries = nonNegativeInteger(options.maxRetries ?? 2, "maxRetries");
  const organization = optionalOption(options.organization, "organization");
  const project = optionalOption(options.project, "project");
  const request = options.fetch ?? fetch;

  return {
    id: `openai:${model}`,
    concurrency,

    async evaluate(decision: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse> {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const requestSignal =
        signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
      const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      };
      if (organization !== undefined) {
        headers["openai-organization"] = organization;
      }
      if (project !== undefined) {
        headers["openai-project"] = project;
      }
      const response = await sendWithRetries(
        request,
        `${baseURL}/decisions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            input: stableStringify(decision.state),
            questions: toQuestions(decision.questions),
          }),
          signal: requestSignal,
        },
        maxRetries,
        requestSignal,
        0,
      );
      const payload = await responsePayload(response);
      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}: ${apiError(payload)}`);
      }
      return parseDecisionResponse(payload, decision.questions);
    },
  };
};

interface OpenAIQuestion {
  type: "predicate" | "choice" | "score";
  name: string;
  instructions: string;
  choices?: { value: string; description: string }[];
  levels?: { label: string; description: string }[];
}

const toQuestions = (questions: Record<string, DecisionQuestion>): OpenAIQuestion[] =>
  Object.entries(questions).map(([name, question]) => {
    if (question.type === "choice") {
      return {
        type: "choice",
        name,
        instructions: decisionText(question.instructions),
        choices: Object.entries(question.criteria).map(([value, description]) => ({
          value,
          description: decisionText(description),
        })),
      };
    }
    if (question.type === "score") {
      return {
        type: "score",
        name,
        instructions: decisionText(question.instructions),
        levels: question.criteria.map((description, index) => ({
          label: String(index),
          description: decisionText(description),
        })),
      };
    }
    const criteria = question.criteria;
    const instructions = [
      decisionText(question.instructions),
      ...(criteria?.true === undefined ? [] : [`True criteria: ${decisionText(criteria.true)}`]),
      ...(criteria?.false === undefined ? [] : [`False criteria: ${decisionText(criteria.false)}`]),
    ].join("\n\n");
    return { type: "predicate", name, instructions };
  });

const parseDecisionResponse = (
  value: unknown,
  questions: Record<string, DecisionQuestion>,
): DecisionResponse => {
  if (
    !isRecord(value) ||
    typeof value["model"] !== "string" ||
    value["model"].trim().length === 0 ||
    !Array.isArray(value["answers"]) ||
    !isRecord(value["usage"])
  ) {
    throw new TypeError("OpenAI response must contain a model, answers, and usage");
  }
  const answers: Record<string, DecisionAnswer> = {};
  for (const rawAnswer of value["answers"]) {
    if (!isRecord(rawAnswer) || typeof rawAnswer["name"] !== "string") {
      throw new TypeError("OpenAI answer must contain a name");
    }
    const name = rawAnswer["name"];
    const question = questions[name];
    if (question === undefined || answers[name] !== undefined) {
      throw new TypeError(`OpenAI response contains an unexpected answer: ${name}`);
    }
    if (rawAnswer["type"] === "refusal") {
      throw new Error(`OpenAI refused question ${name}`);
    }
    answers[name] = parseAnswer(name, rawAnswer, question);
  }
  if (!sameKeys(answers, Object.keys(questions))) {
    throw new TypeError("OpenAI response answer names must match the request");
  }
  const inputTokens = tokenCount(value["usage"]["input_tokens"], "input_tokens");
  const outputTokens = tokenCount(value["usage"]["output_tokens"], "output_tokens");
  return { model: value["model"], answers, usage: { inputTokens, outputTokens } };
};

const parseAnswer = (
  name: string,
  value: Record<string, unknown>,
  question: DecisionQuestion,
): DecisionAnswer => {
  if (question.type === "noul") {
    if (value["type"] !== "predicate") {
      throw new TypeError(`OpenAI answer ${name} has the wrong type`);
    }
    return { type: "noul", noul: probability(value["probability"], `${name}.probability`) };
  }
  if (question.type === "choice") {
    if (value["type"] !== "choice") {
      throw new TypeError(`OpenAI answer ${name} has the wrong type`);
    }
    const choice = value["choice"];
    if (typeof choice !== "string" || !(choice in question.criteria)) {
      throw new TypeError(`OpenAI answer ${name} has an invalid choice`);
    }
    return {
      type: "choice",
      choice,
      confidence: probability(value["confidence"], `${name}.confidence`),
      probabilities: choiceProbabilities(
        value["probabilities"],
        Object.keys(question.criteria),
        name,
      ),
    } satisfies ChoiceAnswer;
  }
  if (value["type"] !== "score") {
    throw new TypeError(`OpenAI answer ${name} has the wrong type`);
  }
  const labels = question.criteria.map((_criterion, index) => String(index));
  const score = value["score"];
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > question.criteria.length - 1
  ) {
    throw new TypeError(`OpenAI answer ${name} has an invalid score`);
  }
  return {
    type: "score",
    score,
    confidence: probability(value["confidence"], `${name}.confidence`),
    probabilities: scoreProbabilities(value["probabilities"], labels, name),
    legend: Object.fromEntries(
      question.criteria.map((criterion, index) => [String(index), criterion]),
    ),
  } satisfies ScoreAnswer;
};

const choiceProbabilities = (
  value: unknown,
  expectedLabels: readonly string[],
  name: string,
): Record<string, number> => {
  if (!Array.isArray(value) || value.length !== expectedLabels.length) {
    throw new TypeError(`OpenAI answer ${name} has invalid probabilities`);
  }
  const probabilities: Record<string, number> = {};
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry["value"] !== "string") {
      throw new TypeError(`OpenAI answer ${name} has invalid probabilities`);
    }
    const label = entry["value"];
    if (!expectedLabels.includes(label) || probabilities[label] !== undefined) {
      throw new TypeError(`OpenAI answer ${name} has invalid probability labels`);
    }
    probabilities[label] = probability(entry["probability"], `${name}.${label}`);
  }
  if (!sameKeys(probabilities, expectedLabels)) {
    throw new TypeError(`OpenAI answer ${name} has invalid probability labels`);
  }
  return probabilities;
};

const scoreProbabilities = (
  value: unknown,
  expectedLabels: readonly string[],
  name: string,
): Record<string, number> => {
  if (!Array.isArray(value) || value.length !== expectedLabels.length) {
    throw new TypeError(`OpenAI answer ${name} has invalid probabilities`);
  }
  const probabilities: Record<string, number> = {};
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry["value"] !== "number" ||
      !Number.isInteger(entry["value"]) ||
      entry["label"] !== String(entry["value"])
    ) {
      throw new TypeError(`OpenAI answer ${name} has invalid probabilities`);
    }
    const label = String(entry["value"]);
    if (!expectedLabels.includes(label) || probabilities[label] !== undefined) {
      throw new TypeError(`OpenAI answer ${name} has invalid probability labels`);
    }
    probabilities[label] = probability(entry["probability"], `${name}.${label}`);
  }
  if (!sameKeys(probabilities, expectedLabels)) {
    throw new TypeError(`OpenAI answer ${name} has invalid probability labels`);
  }
  return probabilities;
};

const sendWithRetries = async (
  request: typeof fetch,
  url: string,
  init: RequestInit,
  retriesRemaining: number,
  signal: AbortSignal,
  attempt: number,
): Promise<Response> => {
  const response = await request(url, init);
  if ((response.status !== 429 && response.status !== 503) || retriesRemaining === 0) {
    return response;
  }
  await response.body?.cancel();
  await wait(retryDelayMs(response, attempt), signal);
  return sendWithRetries(request, url, init, retriesRemaining - 1, signal, attempt + 1);
};

const retryDelayMs = (response: Response, attempt: number): number => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.max(0, date - Date.now());
    }
  }
  return 250 * 2 ** attempt + Math.random() * 100;
};

const wait = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error("OpenAI request aborted", { cause: signal.reason });

const responsePayload = async (response: Response): Promise<unknown> => {
  const body = await response.text();
  try {
    return JSON.parse(body) as unknown;
  } catch (cause) {
    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}: invalid JSON response`, { cause });
    }
    throw new TypeError("OpenAI response must be valid JSON", { cause });
  }
};

const apiError = (payload: unknown): string => {
  if (
    isRecord(payload) &&
    isRecord(payload["error"]) &&
    typeof payload["error"]["message"] === "string"
  ) {
    return payload["error"]["message"];
  }
  return "unknown API error";
};

const requiredOption = (value: string, name: string): string => {
  if (value.trim().length === 0) {
    throw new TypeError(`OpenAI ${name} must not be empty`);
  }
  return value;
};

const optionalOption = (value: string | undefined, name: string): string | undefined =>
  value === undefined ? undefined : requiredOption(value, name);

const positiveInteger = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`OpenAI ${name} must be a positive integer`);
  }
  return value;
};

const nonNegativeInteger = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`OpenAI ${name} must be a non-negative integer`);
  }
  return value;
};

const probability = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`OpenAI probability ${name} must be between 0 and 1`);
  }
  return value;
};

const tokenCount = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`OpenAI usage ${name} must be a non-negative integer`);
  }
  return value;
};

const decisionText = (value: JsonValue): string =>
  typeof value === "string" ? value : stableStringify(value);

const stableStringify = (value: JsonValue): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] ?? null)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sameKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => key in value);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
