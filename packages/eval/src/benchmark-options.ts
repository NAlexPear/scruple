import { parseArgs } from "node:util";

import { parseEvalProviderSpecs, type EvalProviderSpec } from "@scruple/eval/options";

export interface BenchmarkOptions {
  concurrency: number;
  fixtureIds: string[];
  help: boolean;
  repetitions: number;
  specs: EvalProviderSpec[];
  warmups: number;
}

export const BENCHMARK_HELP = `Benchmark Scruple with live decision providers

Usage:
  pnpm benchmark --provider <jev|laya> [options]

Options:
  --provider <jev|laya>  Provider to benchmark; repeat to compare providers
  --model <model>        Model paired by position with each provider
  --fixture <id>         Benchmark only this fixture; repeat to select several
  --warmups <count>      Unmeasured runs per provider/model pair (default: 1)
  --repetitions <count>  Measured runs per provider/model pair (default: 3)
  --concurrency <count>  Maximum cases in flight (default: 1)
  -h, --help             Show this help

Environment:
  TYPESAFE_API_KEY  Required by Jev
  LAYA_PYTHON       Python executable containing Laya (default: python3)
  LAYA_DEVICE       Optional Laya device override

Examples:
  pnpm benchmark --provider jev
  pnpm benchmark --provider laya --model typed-decisions
  pnpm benchmark --provider jev --provider laya --model jev-1.13.0 --model auto
`;

export const parseBenchmarkOptions = (argv: readonly string[]): BenchmarkOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      provider: { type: "string", multiple: true },
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
  const providers = values.provider ?? [];
  if (!values.help && providers.length === 0) {
    throw new Error("Specify at least one --provider");
  }
  return {
    concurrency,
    fixtureIds: values.fixture ?? [],
    help: values.help,
    repetitions,
    specs: parseEvalProviderSpecs(providers, values.model ?? []),
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
