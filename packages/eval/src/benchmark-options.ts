import { parseArgs } from "node:util";

import { DEFAULT_EVAL_MODEL } from "@scruple/eval/options";

export type BenchmarkProvider = "jev" | "decider";

export interface BenchmarkOptions {
  baseURL?: string;
  concurrency: number;
  fixtureIds: string[];
  help: boolean;
  models: string[];
  provider: BenchmarkProvider;
  repetitions: number;
  warmups: number;
  workloadSize?: number;
}

export const BENCHMARK_HELP = `Benchmark Scruple with a decision provider

Usage:
  pnpm benchmark [options]

Options:
  --provider <name>      Provider to benchmark: jev or decider (default: jev)
  --base-url <url>       Decider API base URL (default: http://127.0.0.1:8000)
  --model <model>        Model to benchmark; repeat to compare models
  --fixture <id>         Benchmark only this fixture; repeat to select several
  --workload-size <n>    Cycle selected fixtures to create exactly n cases
  --warmups <count>      Unmeasured runs per model (default: 1)
  --repetitions <count>  Measured runs per model (default: 3)
  --concurrency <count>  Maximum cases in flight (default: 1)
  -h, --help             Show this help

Environment:
  TYPESAFE_API_KEY  Required by Jev
  DECIDER_BASE_URL  Optional Decider API base URL
  DECIDER_API_KEY   Optional bearer token for a Decider proxy

Examples:
  pnpm benchmark
  pnpm benchmark --model jev-1.13.0 --repetitions 5
  pnpm benchmark --model jev-1.13.0 --model jev-latest
  pnpm benchmark --provider decider --model decider-4b-v2.1
`;

export const parseBenchmarkOptions = (argv: readonly string[]): BenchmarkOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      provider: { type: "string" },
      "base-url": { type: "string" },
      model: { type: "string", multiple: true },
      fixture: { type: "string", multiple: true },
      "workload-size": { type: "string" },
      warmups: { type: "string", default: "1" },
      repetitions: { type: "string", default: "3" },
      concurrency: { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.provider !== undefined && values.provider !== "jev" && values.provider !== "decider") {
    throw new Error(`--provider must be either "jev" or "decider"`);
  }
  const provider = values.provider ?? "jev";
  const warmups = parseCount(values.warmups, "--warmups", true);
  const repetitions = parseCount(values.repetitions, "--repetitions", false);
  const concurrency = parseCount(values.concurrency, "--concurrency", false);
  const workloadSize =
    values["workload-size"] === undefined
      ? undefined
      : parseCount(values["workload-size"], "--workload-size", false);
  return {
    ...(values["base-url"] === undefined ? {} : { baseURL: values["base-url"] }),
    concurrency,
    fixtureIds: values.fixture ?? [],
    help: values.help,
    models: values.model ?? [provider === "decider" ? "decider-4b-v2.1" : DEFAULT_EVAL_MODEL],
    provider,
    repetitions,
    warmups,
    ...(workloadSize === undefined ? {} : { workloadSize }),
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
