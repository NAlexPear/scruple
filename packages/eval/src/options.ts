import { parseArgs } from "node:util";

import { evalProvider } from "./provider.js";

export interface EvalOptions {
  baseURL: string | undefined;
  format: "json" | "stylish";
  help: boolean;
  models: string[];
  provider: string;
  repetitions: number;
}

export const EVAL_HELP = `Run Scruple's live semantic-plugin evaluations

Usage:
  pnpm eval [options]

Options:
  --provider <name>      jev or kev (default: jev)
  --base-url <url>       Provider API root; required for kev
  --model <model>        Model to evaluate; repeat to compare models (default: jev-1.13.0 for jev)
  --repetitions <count>  Runs per model (default: 1)
  -f, --format <format>  json or stylish (default: json)
  -h, --help             Show this help

Environment:
  TYPESAFE_API_KEY  Required by jev
  KEV_API_KEY       Sent to kev when the server sets one

Examples:
  pnpm eval
  pnpm eval --format stylish
  pnpm eval --model jev-1.13.0 --repetitions 3
  pnpm eval --model jev-1.13.0 --model jev-latest
  pnpm eval --provider kev --base-url http://127.0.0.1:8008 --model kev-4b
`;

export const parseEvalOptions = (argv: readonly string[]): EvalOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      provider: { type: "string", default: "jev" },
      "base-url": { type: "string" },
      model: { type: "string", multiple: true },
      repetitions: { type: "string", default: "1" },
      format: { type: "string", short: "f", default: "json" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be a positive integer");
  }
  if (values.format !== "json" && values.format !== "stylish") {
    throw new Error(`Unknown output format: ${values.format}`);
  }
  return {
    baseURL: values["base-url"],
    format: values.format,
    help: values.help,
    models: parseModels(values.provider, values.model),
    provider: values.provider,
    repetitions,
  };
};

/** The requested models, or the provider's default when `--model` is omitted. */
export const parseModels = (provider: string, models: string[] | undefined): string[] => {
  const { defaultModel } = evalProvider(provider);
  if (models !== undefined) {
    return models;
  }
  if (defaultModel === undefined) {
    throw new Error(`--model is required for ${provider}`);
  }
  return [defaultModel];
};
