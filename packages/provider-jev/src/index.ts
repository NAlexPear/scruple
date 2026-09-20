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
  type Questions,
  type RequestOptions,
  type TypeSafeClientConfig,
} from "@typesafe-ai/sdk";

export interface JevProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export function jevProvider(options: JevProviderOptions = {}): DecisionProvider {
  const model = options.model ?? "jev-1.13.0";
  const clientConfig: TypeSafeClientConfig = {
    defaultModel: model,
    timeout: options.timeoutMs ?? 10_000,
    retry: { maxRetries: options.maxRetries ?? 2 },
  };
  if (options.apiKey !== undefined) {
    clientConfig.apiKey = options.apiKey;
  }
  if (options.baseURL !== undefined) {
    clientConfig.baseURL = options.baseURL;
  }
  const client = new TypeSafeClient(clientConfig);

  return {
    id: `jev:${model}`,

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
}

function toQuestions(questions: Record<string, DecisionQuestion>): Questions {
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
}

function toEntry(value: JsonValue): EntryType {
  if (typeof value === "number" || typeof value === "boolean") {
    return { value };
  }
  return value;
}
