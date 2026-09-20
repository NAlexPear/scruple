import { parseArgs } from "node:util";

export const DEFAULT_EVAL_MODEL = "jev-1.13.0";

export interface EvalOptions {
  help: boolean;
  models: string[];
  repetitions: number;
}

export const EVAL_HELP = `Run Scruple's live semantic-plugin evaluations

Usage:
  pnpm eval [options]

Options:
  --model <model>        Jev model to evaluate; repeat to compare models
  --repetitions <count>  Runs per model (default: 1)
  -h, --help             Show this help

Examples:
  pnpm eval
  pnpm eval --model jev-1.13.0 --repetitions 3
  pnpm eval --model jev-1.13.0 --model jev-latest
`;

export const parseEvalOptions = (argv: readonly string[]): EvalOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      model: { type: "string", multiple: true },
      repetitions: { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be a positive integer");
  }
  return {
    help: values.help,
    models: values.model ?? [DEFAULT_EVAL_MODEL],
    repetitions,
  };
};
