import type { DecisionProvider } from "@scruple/core";
import type { EvalProviderSpec } from "@scruple/eval/options";
import { jevProvider } from "@scruple/provider-jev";
import { layaProvider, type LayaModel } from "@scruple/provider-laya";

export interface LiveProviderOptions {
  concurrency?: number;
  layaDevice?: string;
  layaPython?: string;
}

export const createLiveProvider = (
  spec: EvalProviderSpec,
  options: LiveProviderOptions = {},
): DecisionProvider => {
  if (spec.provider === "jev") {
    const apiKey = process.env["TYPESAFE_API_KEY"];
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error("TYPESAFE_API_KEY is required for Jev evaluations");
    }
    return jevProvider({
      apiKey,
      model: spec.model,
      ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    });
  }
  if (!isLayaModel(spec.model)) {
    throw new Error(`Unsupported Laya model: ${spec.model}`);
  }
  return layaProvider({
    model: spec.model,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(options.layaDevice === undefined ? {} : { device: options.layaDevice }),
    ...(options.layaPython === undefined ? {} : { python: options.layaPython }),
  });
};

const isLayaModel = (model: string): model is LayaModel => {
  return ["auto", "english", "multilingual", "typed-decisions"].includes(model);
};
