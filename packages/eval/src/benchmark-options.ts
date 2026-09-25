import { parseArgs } from "node:util";

import { parseModels } from "@scruple/eval/options";

export interface BenchmarkOptions {
  baseURL?: string;
  concurrency: number;
  fixtureIds: string[];
  help: boolean;
  models: string[];
  provider: string;
  repetitions: number;
  warmups: number;
  workloadSize?: number;
}

export const BENCHMARK_HELP = `Benchmark Scruple with a decision provider

Usage:
  pnpm benchmark [options]

Options:
  --provider <name>      jev, decider, or kev (default: jev)
  --base-url <url>       Provider API root; required for kev (decider default: http://127.0.0.1:8000)
  --model <model>        Model to benchmark; repeat to compare models (default: jev-1.13.0 for jev,
                         decider-4b-v2.1 for decider)
  --fixture <id>         Benchmark only this fixture; repeat to select several
  --workload-size <n>    Cycle selected fixtures to create exactly n cases
  --warmups <count>      Unmeasured runs per model (default: 1)
  --repetitions <count>  Measured runs per model (default: 3)
  --concurrency <count>  Maximum cases in flight (default: 1)
  -h, --help             Show this help

Environment:
  TYPESAFE_API_KEY  Required by jev
  DECIDER_BASE_URL  Optional Decider API base URL
  DECIDER_API_KEY   Optional bearer token for a Decider proxy
  KEV_API_KEY       Sent to kev when the server sets one

Examples:
  pnpm benchmark
  pnpm benchmark --model jev-1.13.0 --repetitions 5
  pnpm benchmark --model jev-1.13.0 --model jev-latest
  pnpm benchmark --provider decider --model decider-4b-v2.1
  pnpm benchmark --provider kev --base-url http://127.0.0.1:8008 --model kev-4b
`;

export const parseBenchmarkOptions = (argv: readonly string[]): BenchmarkOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      provider: { type: "string", default: "jev" },
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
    models: parseModels(values.provider, values.model),
    provider: values.provider,
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
