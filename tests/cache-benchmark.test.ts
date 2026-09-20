import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { runCacheBenchmark } from "@scruple/eval/cache-benchmark";

await test("cache benchmark measures cold, warm, and incremental runs", async () => {
  const report = await runCacheBenchmark({
    workloadSize: 8,
    warmups: 1,
    repetitions: 2,
    concurrency: 4,
    providerDelayMs: 1,
  });

  assert.deepEqual(report.settings, {
    workloadSize: 8,
    warmups: 1,
    repetitions: 2,
    concurrency: 4,
    providerDelayMs: 1,
  });
  assert.equal(report.scenarios.uncached.requestsPerRun, 8);
  assert.equal(report.scenarios.uncached.cacheHitsPerRun, 0);
  assert.equal(report.scenarios.cold.requestsPerRun, 8);
  assert.equal(report.scenarios.cold.cacheHitsPerRun, 0);
  assert.equal(report.scenarios.cold.cacheEntries, 8);
  assert.equal(report.scenarios.cold.cacheBytes > 0, true);
  assert.equal(report.scenarios.warm.requestsPerRun, 0);
  assert.equal(report.scenarios.warm.cacheHitsPerRun, 8);
  assert.equal(report.scenarios.warm.cacheEntries, 8);
  assert.equal(report.scenarios.incremental.requestsPerRun, 1);
  assert.equal(report.scenarios.incremental.cacheHitsPerRun, 7);
  assert.equal(report.scenarios.incremental.cacheEntries, 9);
  assert.equal(report.scenarios.incremental.cacheBytes > report.scenarios.warm.cacheBytes, true);
  assert.equal(report.comparisons.diagnosticsMatch, true);
  assert.equal(report.comparisons.providerCallsAvoidedPerWarmRun, 8);
  assert.equal(report.comparisons.inputTokensAvoidedPerWarmRun, 88);
  assert.equal(report.comparisons.outputTokensAvoidedPerWarmRun, 16);
  assert.equal(report.comparisons.coldOverheadRatio > 0, true);
  assert.equal(report.comparisons.warmSpeedupRatio > 0, true);
  assert.equal(report.scenarios.warm.samples.length, 2);
});

await test("cache benchmark CLI documents its deterministic controls", () => {
  const output = execFileSync(
    process.execPath,
    ["packages/eval/dist/cache-benchmark-cli.js", "--help"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.match(output, /Benchmark Scruple's decision cache/u);
  assert.match(output, /--workload-size <n>\s+Unique provider requests/u);
  assert.match(output, /--warmups <n>\s+Unmeasured cycles/u);
  assert.match(output, /--repetitions <n>\s+Measured cycles/u);
  assert.match(output, /--concurrency <n>\s+Maximum provider calls/u);
  assert.match(output, /--provider-delay-ms <n>\s+Simulated provider latency/u);
});
