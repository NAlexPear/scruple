import type { DecisionProvider } from "@scruple/core";
import { jevProvider, kevProvider } from "@scruple/provider-jev";

export interface EvalProviderOptions {
  concurrency?: number;
}

/** Jev by default. `SCRUPLE_PROVIDER=kev` with `KEV_BASE_URL` targets a local Kev server instead. */
export const createEvalProvider = (
  model: string,
  options: EvalProviderOptions = {},
): DecisionProvider => {
  const concurrency = options.concurrency === undefined ? {} : { concurrency: options.concurrency };
  const kind = process.env["SCRUPLE_PROVIDER"] ?? "jev";
  if (kind === "kev") {
    const baseURL = process.env["KEV_BASE_URL"];
    if (baseURL === undefined || baseURL.length === 0) {
      throw new Error("KEV_BASE_URL is required when SCRUPLE_PROVIDER=kev");
    }
    const apiKey = process.env["KEV_API_KEY"];
    return kevProvider({
      baseURL,
      model,
      ...(apiKey === undefined || apiKey.length === 0 ? {} : { apiKey }),
      ...concurrency,
    });
  }
  if (kind !== "jev") {
    throw new Error(`Unknown SCRUPLE_PROVIDER: ${kind}`);
  }
  const apiKey = process.env["TYPESAFE_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("TYPESAFE_API_KEY is required for Jev evaluations");
  }
  return jevProvider({ apiKey, model, ...concurrency });
};

/** The provider family recorded in reports, such as `jev` or `kev`. */
export const providerName = (provider: DecisionProvider): string =>
  provider.id.split(":")[0] ?? provider.id;
