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
  type TypeSafeClientConfig,
} from "@typesafe-ai/sdk";

export interface JevProviderOptions {
  apiKey: string;
  baseURL?: string;
  model?: string;
  concurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: Fetch;
}

export const jevProvider = (options: JevProviderOptions): DecisionProvider => {
  if (options.apiKey.trim().length === 0) {
    throw new TypeError("Jev apiKey must not be empty");
  }
  const model = options.model ?? "jev-1.13.0";
  const clientConfig: TypeSafeClientConfig = {
    apiKey: options.apiKey,
    defaultModel: model,
    timeout: options.timeoutMs ?? 10_000,
    retry: { maxRetries: options.maxRetries ?? 2 },
  };
  if (options.baseURL !== undefined) {
    clientConfig.baseURL = options.baseURL;
  }
  if (options.fetch !== undefined) {
    clientConfig.fetch = options.fetch;
  }
  const client = new TypeSafeClient(clientConfig);

  return {
    id: `jev:${model}`,
    concurrency: options.concurrency ?? 64,

    async evaluate(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse> {
      const requestOptions: RequestOptions = {
        timeout: options.timeoutMs ?? 10_000,
        retry: { maxRetries: options.maxRetries ?? 2 },
      };
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
    },
  };
};

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

/** Kev (github.com/jaredpalmer/kev) serves the same System One API as Jev from open weights. */
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
  const provider = jevProvider({
    apiKey: options.apiKey ?? "kev-local",
    baseURL: options.baseURL,
    model,
    concurrency,
    timeoutMs: options.timeoutMs ?? 60_000,
    maxRetries: options.maxRetries ?? 0,
    fetch: (input, init) =>
      new URL(input).origin === root.origin
        ? send(input, init)
        : Promise.reject(new Error(`Kev provider refused a request outside ${root.origin}`)),
  });
  // Kev answers one request at a time, so queue here rather than let callers' timeouts expire in the server.
  const limit = limiter(concurrency);
  return {
    ...provider,
    id: `kev:${model}`,
    evaluate: (request, signal) => limit(() => provider.evaluate(request, signal)),
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
