import type { DecisionProvider } from "@scruple/core";
import { jevProvider } from "@scruple/provider-jev";

export interface JevProviderOptions {
  concurrency?: number;
}

export const createJevProvider = (
  model: string,
  options: JevProviderOptions = {},
): DecisionProvider => {
  const apiKey = process.env["TYPESAFE_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("TYPESAFE_API_KEY is required for Jev evaluations");
  }
  return jevProvider({
    apiKey,
    model,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
};
