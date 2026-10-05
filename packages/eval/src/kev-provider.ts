import type { DecisionProvider } from "@scruple/core";
import { kevProvider } from "@scruple/provider-kev";

export interface KevEvaluationProviderOptions {
  baseURL?: string;
  concurrency?: number;
}

export const createKevProvider = (
  checkpoint: string,
  options: KevEvaluationProviderOptions = {},
): DecisionProvider => {
  const baseURL = options.baseURL ?? process.env["KEV_BASE_URL"];
  const apiKey = process.env["KEV_API_KEY"];
  return kevProvider({
    checkpoint,
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
};
