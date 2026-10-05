import { parseArgs } from "node:util";

import {
  PROVIDER_FACTORIES,
  parseProvider,
  type EvaluationProvider,
} from "./provider-factories.js";

export interface EvalOptions {
  baseURL?: string;
  concurrency: number;
  format: "json" | "stylish";
  help: boolean;
  models: string[];
  provider: EvaluationProvider;
  repetitions: number;
}

export const EVAL_HELP = `Run Scruple's live semantic-plugin evaluations

Usage:
  pnpm eval [options]

Options:
  --provider <name>      Provider to evaluate: jev, decider, cloudflare, or kev (default: jev)
  --base-url <url>       Alternate Decider, Cloudflare, or Kev API base URL
  --model <model>        Model to evaluate; repeat to compare models
  --repetitions <count>  Runs per model (default: 1)
  --concurrency <count>  Maximum cases in flight (default: 64 Jev, 4 Cloudflare, 1 Decider/Kev)
  -f, --format <format>  json or stylish (default: json)
  -h, --help             Show this help

Examples:
  pnpm eval
  pnpm eval --format stylish
  pnpm eval --model jev-1.13.0 --repetitions 3
  pnpm eval --model jev-1.13.0 --model jev-latest
  pnpm eval --provider decider --base-url http://127.0.0.1:8000
  pnpm eval --provider cloudflare --model clef --model clef-flash
  pnpm eval --provider kev --base-url http://127.0.0.1:8009 --model jaredpalmer/kev-4b@v1.0
`;

export const parseEvalOptions = (argv: readonly string[]): EvalOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      provider: { type: "string" },
      "base-url": { type: "string" },
      model: { type: "string", multiple: true },
      repetitions: { type: "string", default: "1" },
      concurrency: { type: "string" },
      format: { type: "string", short: "f", default: "json" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const provider = parseProvider(values.provider);
  const { defaultConcurrency, defaultModel } = PROVIDER_FACTORIES[provider];
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be a positive integer");
  }
  const concurrency = Number(values.concurrency ?? defaultConcurrency);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (values.format !== "json" && values.format !== "stylish") {
    throw new Error(`Unknown output format: ${values.format}`);
  }
  return {
    ...(values["base-url"] === undefined ? {} : { baseURL: values["base-url"] }),
    concurrency,
    format: values.format,
    help: values.help,
    models: values.model ?? [defaultModel],
    provider,
    repetitions,
  };
};
