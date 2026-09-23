import type {
  DecisionProvider,
  DecisionQuestion,
  DecisionRequest,
  DecisionResponse,
  JsonValue,
} from "@scruple/core";
import {
  TypeSafeClient,
  type EntryType,
  type Fetch,
  type Questions,
  type RequestOptions,
} from "@typesafe-ai/sdk";

export interface KevProviderOptions {
  /** Root of a Kev server, such as `http://127.0.0.1:8008`. Required so requests never default to TypeSafe. */
  baseURL: string;
  /** Needed only when the server sets `KEV_API_KEY`. */
  apiKey?: string;
  model?: string;
  /** Allow a non-loopback `baseURL`. Code then leaves this machine. */
  allowRemote?: boolean;
  concurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: Fetch;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Kev (github.com/jaredpalmer/kev) serves the System One API from open weights. */
export const kevProvider = (options: KevProviderOptions): DecisionProvider => {
  const root = new URL(options.baseURL);
  if (options.allowRemote !== true && !LOOPBACK_HOSTS.has(root.hostname)) {
    throw new RangeError(
      `Kev baseURL must be a loopback address unless allowRemote is true: ${options.baseURL}`,
    );
  }
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const model = options.model ?? "kev-latest";
  const concurrency = options.concurrency ?? 1;
  const timeout = options.timeoutMs ?? 60_000;
  const retry = { maxRetries: options.maxRetries ?? 0 };
  const client = new TypeSafeClient({
    apiKey: options.apiKey ?? "kev-local",
    baseURL: options.baseURL,
    defaultModel: model,
    timeout,
    retry,
    fetch: (input, init) =>
      new URL(input).origin === root.origin
        ? send(input, init)
        : Promise.reject(new Error(`Kev provider refused a request outside ${root.origin}`)),
  });
  // Kev answers one request at a time, so queue here rather than let callers' timeouts expire in the server.
  const limit = limiter(concurrency);

  return {
    id: `kev:${model}`,
    concurrency,

    evaluate: (request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse> =>
      limit(async () => {
        const requestOptions: RequestOptions = { timeout, retry };
        if (signal !== undefined) {
          requestOptions.signal = signal;
        }
        const response = await client.systemOne(
          {
            state: toEntry(request.state),
            questions: toQuestions(request.questions),
            model,
          },
          requestOptions,
        );

        return {
          model: response.model,
          answers: response.answers,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        };
      }),
  };
};

const limiter = (max: number) => {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
};

const toQuestions = (questions: Record<string, DecisionQuestion>): Questions => {
  const converted: Questions = {};
  for (const [name, question] of Object.entries(questions)) {
    if (question.type === "choice") {
      converted[name] = {
        type: "choice",
        instructions: toEntry(question.instructions),
        criteria: Object.fromEntries(
          Object.entries(question.criteria).map(([label, description]) => [
            label,
            toEntry(description),
          ]),
        ),
      };
    } else if (question.type === "score") {
      converted[name] = {
        type: "score",
        instructions: toEntry(question.instructions),
        criteria: [
          toEntry(question.criteria[0]),
          toEntry(question.criteria[1]),
          ...question.criteria.slice(2).map((description) => toEntry(description)),
        ],
      };
    } else {
      const convertedQuestion: Questions[string] = {
        type: "noul",
        instructions: toEntry(question.instructions),
      };
      if (question.criteria !== undefined) {
        const criteria: { true?: EntryType; false?: EntryType } = {};
        if (question.criteria.true !== undefined) {
          criteria.true = toEntry(question.criteria.true);
        }
        if (question.criteria.false !== undefined) {
          criteria.false = toEntry(question.criteria.false);
        }
        convertedQuestion.criteria = criteria;
      }
      converted[name] = convertedQuestion;
    }
  }
  return converted;
};

const toEntry = (value: JsonValue): EntryType => {
  if (typeof value === "number" || typeof value === "boolean") {
    return { value };
  }
  return value;
};
