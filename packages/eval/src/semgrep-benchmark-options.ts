import { parseArgs } from "node:util";

export interface SemgrepBenchmarkOptions {
  help: boolean;
  profiles: ("official-default" | "benchmark-owned")[];
  repetitions: number;
  semgrepBin: string;
  warmups: number;
}

export const SEMGREP_BENCHMARK_HELP = `Benchmark Semgrep against Scruple's pinned workload

Usage:
  pnpm benchmark-semgrep [options]

Options:
  --profile <name>       official-default or benchmark-owned; repeat to select both
  --semgrep-bin <path>   Semgrep executable (default: semgrep)
  --warmups <n>          Unmeasured runs per profile (default: 1)
  --repetitions <n>      Measured runs per profile (default: 3)
  --help                 Show this help
`;

export const parseSemgrepBenchmarkOptions = (args: readonly string[]): SemgrepBenchmarkOptions => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      help: { type: "boolean", default: false },
      profile: { type: "string", multiple: true },
      "semgrep-bin": { type: "string", default: "semgrep" },
      warmups: { type: "string", default: "1" },
      repetitions: { type: "string", default: "3" },
    },
    strict: true,
  });
  const rawProfiles = values.profile ?? ["official-default", "benchmark-owned"];
  const profiles = rawProfiles.map((profile) => {
    if (profile !== "official-default" && profile !== "benchmark-owned") {
      throw new Error(`Unknown Semgrep benchmark profile: ${profile}`);
    }
    return profile;
  });
  if (new Set(profiles).size !== profiles.length) {
    throw new Error("Semgrep benchmark profiles must be unique");
  }
  return {
    help: values.help,
    profiles,
    repetitions: parseCount(values.repetitions, "repetitions", false),
    semgrepBin: values["semgrep-bin"],
    warmups: parseCount(values.warmups, "warmups", true),
  };
};

const parseCount = (value: string, name: string, allowZero: boolean): number => {
  const count = Number(value);
  if (!Number.isInteger(count) || count < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? "a nonnegative" : "a positive"} integer`);
  }
  return count;
};
