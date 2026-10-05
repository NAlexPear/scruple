import type { DecisionProvider } from "@scruple/core";
import { deciderProvider } from "@scruple/provider-decider";

export interface DeciderEvaluationProviderOptions {
  baseURL?: string;
  concurrency?: number;
}

export const createDeciderProvider = (
  model: string,
  options: DeciderEvaluationProviderOptions = {},
): DecisionProvider => {
  const baseURL = options.baseURL ?? process.env["DECIDER_BASE_URL"];
  const apiKey = process.env["DECIDER_API_KEY"];
  return deciderProvider({
    model,
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
};
