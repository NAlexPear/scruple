import type { DecisionProvider } from "@scruple/core";
import { openaiProvider } from "@scruple/provider-openai";

export interface OpenAIEvaluationProviderOptions {
  baseURL?: string;
  concurrency?: number;
}

export const createOpenAIProvider = (
  model: string,
  options: OpenAIEvaluationProviderOptions = {},
): DecisionProvider => {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("OPENAI_API_KEY is required for OpenAI runs");
  }
  return openaiProvider({
    apiKey,
    model,
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
};
