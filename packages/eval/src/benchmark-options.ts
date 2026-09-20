import { parseArgs } from "node:util";

import { DEFAULT_EVAL_MODEL } from "@scruple/eval/options";

export interface BenchmarkOptions {
  concurrency: number;
  fixtureIds: string[];
  help: boolean;
  models: string[];
  repetitions: number;
  warmups: number;
}

export const BENCHMARK_HELP = `Benchmark Scruple with Jev

Usage:
  pnpm benchmark [options]

Options:
  --model <model>        Jev model to benchmark; repeat to compare models
  --fixture <id>         Benchmark only this fixture; repeat to select several
  --warmups <count>      Unmeasured runs per model (default: 1)
  --repetitions <count>  Measured runs per model (default: 3)
  --concurrency <count>  Maximum cases in flight (default: 1)
  -h, --help             Show this help

Environment:
  TYPESAFE_API_KEY  Required by Jev

Examples:
  pnpm benchmark
  pnpm benchmark --model jev-1.13.0 --repetitions 5
  pnpm benchmark --model jev-1.13.0 --model jev-latest
`;

export const parseBenchmarkOptions = (argv: readonly string[]): BenchmarkOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      model: { type: "string", multiple: true },
      fixture: { type: "string", multiple: true },
      warmups: { type: "string", default: "1" },
      repetitions: { type: "string", default: "3" },
      concurrency: { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const warmups = parseCount(values.warmups, "--warmups", true);
  const repetitions = parseCount(values.repetitions, "--repetitions", false);
  const concurrency = parseCount(values.concurrency, "--concurrency", false);
  return {
    concurrency,
    fixtureIds: values.fixture ?? [],
    help: values.help,
    models: values.model ?? [DEFAULT_EVAL_MODEL],
    repetitions,
    warmups,
  };
};

const parseCount = (value: string, option: string, allowZero: boolean): number => {
  const count = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(count) || count < minimum) {
    throw new Error(`${option} must be a ${allowZero ? "nonnegative" : "positive"} integer`);
  }
  return count;
};
