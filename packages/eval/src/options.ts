import { parseArgs } from "node:util";

export const DEFAULT_EVAL_MODEL = "jev-1.13.0";

export type EvalProvider = "jev" | "decider" | "cloudflare" | "kev" | "openai";

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
  --provider <name>      Provider to evaluate: jev, decider, cloudflare, kev, or openai (default: jev)
  --base-url <url>       Alternate Decider, Cloudflare, Kev, or OpenAI API base URL
  --model <model>        Model to evaluate; repeat to compare models
  --repetitions <count>  Runs per model (default: 1)
  --concurrency <count>  Maximum cases in flight (default: 64 Jev, 16 OpenAI, 4 Cloudflare, 1 Decider/Kev)
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
  pnpm eval --provider openai --model gpt-6-luna
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
  if (
    values.provider !== undefined &&
    values.provider !== "jev" &&
    values.provider !== "decider" &&
    values.provider !== "cloudflare" &&
    values.provider !== "kev" &&
    values.provider !== "openai"
  ) {
    throw new Error(`--provider must be "jev", "decider", "cloudflare", "kev", or "openai"`);
  }
  const provider = values.provider ?? "jev";
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be a positive integer");
  }
  const concurrency = Number(
    values.concurrency ??
      (provider === "jev"
        ? "64"
        : provider === "openai"
          ? "16"
          : provider === "cloudflare"
            ? "4"
            : "1"),
  );
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
    models: values.model ?? [defaultModel(provider)],
    provider,
    repetitions,
  };
};

const defaultModel = (provider: EvalProvider): string => {
  if (provider === "decider") {
    return "decider-4b-v2.1";
  }
  if (provider === "cloudflare") {
    return "clef";
  }
  if (provider === "kev") {
    return "jaredpalmer/kev-4b@v1.0";
  }
  return provider === "openai" ? "gpt-6-luna" : DEFAULT_EVAL_MODEL;
};
