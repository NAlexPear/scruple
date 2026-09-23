import { parseArgs } from "node:util";

export const DEFAULT_EVAL_MODEL = "jev-1.13.0";

export interface EvalOptions {
  format: "json" | "stylish";
  help: boolean;
  models: string[];
  repetitions: number;
  /** JSON file of rule configurations, such as per-rule thresholds for another provider. */
  rules?: string;
}

export const EVAL_HELP = `Run Scruple's live semantic-plugin evaluations

Usage:
  pnpm eval [options]

Options:
  --model <model>        Jev model to evaluate; repeat to compare models
  --repetitions <count>  Runs per model (default: 1)
  --rules <file>         JSON rule configurations that replace rule defaults
  -f, --format <format>  json or stylish (default: json)
  -h, --help             Show this help

Environment:
  TYPESAFE_API_KEY  Required by Jev, the default provider
  SCRUPLE_PROVIDER  jev (default) or kev
  KEV_BASE_URL      Local Kev server when SCRUPLE_PROVIDER=kev

Examples:
  pnpm eval
  pnpm eval --format stylish
  pnpm eval --model jev-1.13.0 --repetitions 3
  pnpm eval --model jev-1.13.0 --model jev-latest
  SCRUPLE_PROVIDER=kev KEV_BASE_URL=http://127.0.0.1:8008 \\
    pnpm eval --model kev-4b --rules benchmarks/kev/kev-4b.rules.json
`;

export const parseEvalOptions = (argv: readonly string[]): EvalOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      model: { type: "string", multiple: true },
      repetitions: { type: "string", default: "1" },
      format: { type: "string", short: "f", default: "json" },
      rules: { type: "string" },
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
    format: values.format,
    help: values.help,
    models: values.model ?? [DEFAULT_EVAL_MODEL],
    repetitions,
    ...(values.rules === undefined ? {} : { rules: values.rules }),
  };
};
