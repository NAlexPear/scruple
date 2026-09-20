import { arch, cpus, platform, release, totalmem } from "node:os";
import { parseArgs } from "node:util";

import { runCacheBenchmark } from "@scruple/eval/cache-benchmark";

const help = `Benchmark Scruple's decision cache

Usage:
  pnpm benchmark-cache [options]

Options:
  --workload-size <n>       Unique provider requests per run (default: 100)
  --warmups <n>             Unmeasured cycles (default: 1)
  --repetitions <n>         Measured cycles (default: 5)
  --concurrency <n>         Maximum provider calls in flight (default: 16)
  --provider-delay-ms <n>   Simulated provider latency in milliseconds (default: 10)
  -h, --help                Show this help
`;

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      "workload-size": { type: "string", default: "100" },
      warmups: { type: "string", default: "1" },
      repetitions: { type: "string", default: "5" },
      concurrency: { type: "string", default: "16" },
      "provider-delay-ms": { type: "string", default: "10" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  const report = await runCacheBenchmark({
    workloadSize: positiveInteger(values["workload-size"], "--workload-size"),
    warmups: nonnegativeInteger(values.warmups, "--warmups"),
    repetitions: positiveInteger(values.repetitions, "--repetitions"),
    concurrency: positiveInteger(values.concurrency, "--concurrency"),
    providerDelayMs: positiveInteger(values["provider-delay-ms"], "--provider-delay-ms"),
  });
  const processors = cpus();
  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environment: {
          node: process.version,
          platform: platform(),
          release: release(),
          architecture: arch(),
          cpu: processors[0]?.model ?? "unknown",
          logicalCpuCount: processors.length,
          totalMemoryBytes: totalmem(),
        },
        ...report,
      },
      null,
      2,
    )}\n`,
  );
};

const positiveInteger = (value: string, option: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
};

const nonnegativeInteger = (value: string, option: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${option} must be a nonnegative integer`);
  }
  return parsed;
};

try {
  await main();
} catch (error) {
  process.stderr.write(
    `scruple cache benchmark: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
