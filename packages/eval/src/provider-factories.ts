import type { DecisionProvider } from "@scruple/core";

import { createCloudflareProvider } from "./cloudflare-provider.js";
import { createDeciderProvider } from "./decider-provider.js";
import { createJevProvider } from "./jev-provider.js";
import { createKevProvider } from "./kev-provider.js";

export interface EvaluationProviderFactory {
  create: (model: string, options: { baseURL?: string; concurrency: number }) => DecisionProvider;
  defaultConcurrency: number;
  defaultModel: string;
}

export type EvaluationProvider = "jev" | "decider" | "cloudflare" | "kev";

export const PROVIDER_FACTORIES: Record<EvaluationProvider, EvaluationProviderFactory> = {
  jev: { create: createJevProvider, defaultConcurrency: 64, defaultModel: "jev-1.13.0" },
  decider: {
    create: createDeciderProvider,
    defaultConcurrency: 1,
    defaultModel: "decider-4b-v2.1",
  },
  cloudflare: { create: createCloudflareProvider, defaultConcurrency: 4, defaultModel: "clef" },
  kev: {
    create: createKevProvider,
    defaultConcurrency: 1,
    defaultModel: "jaredpalmer/kev-4b@v1.0",
  },
};

export const parseProvider = (name = "jev"): EvaluationProvider => {
  if (!isProvider(name)) {
    throw new Error(`--provider must be one of: ${Object.keys(PROVIDER_FACTORIES).join(", ")}`);
  }
  return name;
};

const isProvider = (name: string): name is EvaluationProvider =>
  Object.hasOwn(PROVIDER_FACTORIES, name);
