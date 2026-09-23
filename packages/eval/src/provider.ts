import type { DecisionProvider } from "@scruple/core";
import { jevProvider, type JevProviderOptions } from "@scruple/provider-jev";
import { kevProvider, type KevProviderOptions } from "@scruple/provider-kev";

export interface EvalProviderSettings {
  model: string;
  baseURL: string | undefined;
  concurrency?: number;
}

export interface EvalProvider {
  /** Used when `--model` is omitted. Kev has none because its model must name the server's checkpoint. */
  defaultModel?: string;
  create: (settings: EvalProviderSettings) => DecisionProvider;
}

/** Providers by `--provider` name. Only secrets come from the environment. */
export const EVAL_PROVIDERS: Record<string, EvalProvider> = {
  jev: {
    defaultModel: "jev-1.13.0",
    create: ({ baseURL, ...settings }) => {
      const apiKey = process.env["TYPESAFE_API_KEY"];
      if (apiKey === undefined || apiKey.length === 0) {
        throw new Error("TYPESAFE_API_KEY is required for Jev evaluations");
      }
      const options: JevProviderOptions = { ...settings, apiKey };
      if (baseURL !== undefined) {
        options.baseURL = baseURL;
      }
      return jevProvider(options);
    },
  },
  kev: {
    create: ({ baseURL, ...settings }) => {
      if (baseURL === undefined) {
        throw new Error("--base-url is required for Kev evaluations");
      }
      const options: KevProviderOptions = { ...settings, baseURL };
      const apiKey = process.env["KEV_API_KEY"];
      if (apiKey !== undefined) {
        options.apiKey = apiKey;
      }
      return kevProvider(options);
    },
  },
};

export const evalProvider = (name: string): EvalProvider => {
  const provider = EVAL_PROVIDERS[name];
  if (provider === undefined) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
};
