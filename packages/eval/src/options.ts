import { parseArgs } from "node:util";

export const DEFAULT_EVAL_MODEL = "jev-1.13.0";

export type EvalProvider = "jev" | "decider";

export interface EvalOptions {
  baseURL?: string;
  concurrency: number;
  format: "json" | "stylish";
  help: boolean;
  models: string[];
  provider: EvalProvider;
  repetitions: number;
}

export const EVAL_HELP = `Run Scruple's live semantic-plugin evaluations

Usage:
  pnpm eval [options]

Options:
  --provider <name>      Provider to evaluate: jev or decider (default: jev)
  --base-url <url>       Decider API base URL (default: http://127.0.0.1:8000)
  --model <model>        Model to evaluate; repeat to compare models
  --repetitions <count>  Runs per model (default: 1)
  --concurrency <count>  Maximum cases in flight (default: 64 for Jev, 1 for Decider)
  -f, --format <format>  json or stylish (default: json)
  -h, --help             Show this help

Examples:
  pnpm eval
  pnpm eval --format stylish
  pnpm eval --model jev-1.13.0 --repetitions 3
  pnpm eval --model jev-1.13.0 --model jev-latest
  pnpm eval --provider decider --base-url http://127.0.0.1:8000
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
  if (values.provider !== undefined && values.provider !== "jev" && values.provider !== "decider") {
    throw new Error(`--provider must be either "jev" or "decider"`);
  }
  const provider = values.provider ?? "jev";
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be a positive integer");
  }
  const concurrency = Number(values.concurrency ?? (provider === "decider" ? "1" : "64"));
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
    models: values.model ?? [provider === "decider" ? "decider-4b-v2.1" : DEFAULT_EVAL_MODEL],
    provider,
    repetitions,
  };
};
