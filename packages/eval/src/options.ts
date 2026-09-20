import { parseArgs } from "node:util";

export type EvalProviderName = "jev" | "laya";

export interface EvalProviderSpec {
  provider: EvalProviderName;
  model: string;
}

export interface EvalOptions {
  help: boolean;
  repetitions: number;
  specs: EvalProviderSpec[];
}

export const EVAL_HELP = `Run Scruple's live semantic-plugin evaluations

Usage:
  pnpm eval [options]

Options:
  --provider <jev|laya>  Provider to evaluate; repeat to compare providers
  --model <model>        Model paired by position with each provider
  --repetitions <count>  Runs per provider/model pair (default: 1)
  -h, --help             Show this help

Examples:
  pnpm eval
  pnpm eval --provider laya --model typed-decisions
  pnpm eval --provider jev --provider laya --model jev-1.13.0 --model auto
`;

export const parseEvalOptions = (argv: readonly string[]): EvalOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      provider: { type: "string", multiple: true },
      model: { type: "string", multiple: true },
      repetitions: { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be a positive integer");
  }
  const providers = values.provider ?? [];
  const models = values.model ?? [];
  if (providers.length === 0) {
    if (models.length > 0) {
      throw new Error("--model requires --provider");
    }
    return {
      help: values.help,
      repetitions,
      specs: [{ provider: "jev", model: "jev-1.13.0" }],
    };
  }
  return { help: values.help, repetitions, specs: parseEvalProviderSpecs(providers, models) };
};

export const parseEvalProviderSpecs = (
  providers: readonly string[],
  models: readonly string[],
): EvalProviderSpec[] => {
  if (models.length > 0 && models.length !== providers.length) {
    throw new Error("Provide exactly one --model for each --provider");
  }
  return providers.map((provider, index) => {
    if (provider !== "jev" && provider !== "laya") {
      throw new Error(`Unsupported evaluation provider: ${provider}`);
    }
    return {
      provider,
      model: models[index] ?? (provider === "jev" ? "jev-1.13.0" : "auto"),
    };
  });
};
