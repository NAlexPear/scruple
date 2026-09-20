import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

import type { EvalFixture } from "@scruple/eval";

export type SemgrepCoverage = "benchmark_owned" | "unsupported";

export interface SemgrepCaseMapping {
  id: string;
  sourceSha256: string;
  coverage: SemgrepCoverage;
  ruleId?: string;
  reason?: string;
}

export interface SemgrepFinding {
  checkId: string;
  path: string;
  line: number;
}

export interface ParsedSemgrepOutput {
  version: string;
  findings: SemgrepFinding[];
  errors: unknown[];
}

export interface SemgrepProcessResult {
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  processError: string | null;
  stderr: string;
  output: ParsedSemgrepOutput | null;
}

export interface SemgrepCaseResult {
  id: string;
  expectedFinding: boolean;
  coverage: SemgrepCoverage;
  status: "hit" | "miss" | "correct_rejection" | "false_positive" | "unsupported";
  findingCount: number;
  ruleIds: string[];
  reason?: string;
}

export interface SemgrepProfileReport {
  profile: "official-default" | "benchmark-owned";
  config: string;
  warmupRuns: SemgrepProcessResult[];
  measuredRuns: SemgrepProcessResult[];
  cases: SemgrepCaseResult[];
  summary: {
    supported: number;
    correct: number;
    misses: number;
    falsePositives: number;
    accuracy: number | null;
    expectedIssues: number;
    detectedExpectedIssues: number;
    recall: number | null;
    unsupported: { count: number; ids: string[] };
    findings: number;
    durationMs: { mean: number; min: number; max: number };
    exitCodes: (number | null)[];
    processErrors: number;
    semgrepErrors: number;
  };
}

export const parseSemgrepCaseMappings = (value: unknown): SemgrepCaseMapping[] => {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || !Array.isArray(value["fixtures"])) {
    throw new TypeError("Semgrep case mappings require schemaVersion 1 and a fixtures array");
  }
  const mappings = value["fixtures"].map((entry, index) => parseMapping(entry, index));
  if (new Set(mappings.map((mapping) => mapping.id)).size !== mappings.length) {
    throw new Error("Semgrep case mapping IDs must be unique");
  }
  return mappings;
};

export const parseSemgrepOutput = (stdout: string): ParsedSemgrepOutput => {
  const value: unknown = JSON.parse(stdout);
  if (!isRecord(value) || typeof value["version"] !== "string") {
    throw new TypeError("Semgrep JSON output requires a version");
  }
  if (!Array.isArray(value["results"]) || !Array.isArray(value["errors"])) {
    throw new TypeError("Semgrep JSON output requires results and errors arrays");
  }
  return {
    version: value["version"],
    findings: value["results"].map((result, index) => parseFinding(result, index)),
    errors: value["errors"],
  };
};

export const fixtureFingerprint = (fixture: EvalFixture): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        filename: fixture.filename,
        source: fixture.source,
        ruleId: fixture.ruleId,
        expectedFinding: fixture.expectedFinding,
      }),
    )
    .digest("hex");

export const validateSemgrepMappings = (
  fixtures: readonly EvalFixture[],
  mappings: readonly SemgrepCaseMapping[],
): void => {
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  if (fixtures.length !== mappings.length) {
    throw new Error("Semgrep mappings must cover every pinned benchmark fixture");
  }
  for (const mapping of mappings) {
    const fixture = fixturesById.get(mapping.id);
    if (fixture === undefined) {
      throw new Error(`Unknown Semgrep benchmark fixture: ${mapping.id}`);
    }
    if (fixtureFingerprint(fixture) !== mapping.sourceSha256) {
      throw new Error(`Semgrep benchmark fixture drifted: ${mapping.id}`);
    }
  }
};

export const runSemgrepProfile = async (options: {
  semgrepBin: string;
  profile: "official-default" | "benchmark-owned";
  config: string;
  configLabel?: string;
  fixtures: readonly EvalFixture[];
  mappings: readonly SemgrepCaseMapping[];
  warmups: number;
  repetitions: number;
}): Promise<SemgrepProfileReport> => {
  const root = await mkdtemp(join(tmpdir(), "scruple-semgrep-"));
  try {
    await materializeFixtures(root, options.fixtures);
    const run = (): Promise<SemgrepProcessResult> =>
      runSemgrep(options.semgrepBin, options.config, root);
    const warmupRuns = await runSequential(options.warmups, run);
    const measuredRuns = await runSequential(options.repetitions, run);
    const cases = classifyCases(options.profile, options.fixtures, options.mappings, measuredRuns);
    const durations = measuredRuns.map((sample) => sample.durationMs);
    return {
      profile: options.profile,
      config: options.configLabel ?? options.config,
      warmupRuns,
      measuredRuns,
      cases,
      summary: {
        ...summarizeSemgrepCases(cases),
        findings: measuredRuns.reduce(
          (total, runResult) => total + (runResult.output?.findings.length ?? 0),
          0,
        ),
        durationMs: {
          mean: durations.reduce((total, duration) => total + duration, 0) / durations.length,
          min: Math.min(...durations),
          max: Math.max(...durations),
        },
        exitCodes: measuredRuns.map((sample) => sample.exitCode),
        processErrors: measuredRuns.filter((sample) => sample.processError !== null).length,
        semgrepErrors: measuredRuns.reduce(
          (total, sample) => total + (sample.output?.errors.length ?? 0),
          0,
        ),
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const runSemgrep = (
  semgrepBin: string,
  config: string,
  target: string,
): Promise<SemgrepProcessResult> => {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(
      semgrepBin,
      ["scan", "--config", config, "--json", "--metrics", "off", "--disable-version-check", target],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let processError: string | null = null;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      processError = error.message;
    });
    child.on("close", (exitCode, signal) => {
      let output: ParsedSemgrepOutput | null = null;
      if (stdout.length > 0) {
        try {
          output = parseSemgrepOutput(stdout);
          output.findings = output.findings.map((finding) => ({
            ...finding,
            path: relative(target, finding.path).replaceAll("\\", "/"),
          }));
        } catch (error) {
          processError = error instanceof Error ? error.message : String(error);
        }
      }
      resolve({
        durationMs: performance.now() - started,
        exitCode,
        signal,
        processError,
        stderr: stderr.trim().replaceAll(target, "<fixture-root>"),
        output,
      });
    });
  });
};

const materializeFixtures = async (
  root: string,
  fixtures: readonly EvalFixture[],
): Promise<void> => {
  await Promise.all(
    fixtures.map(async (fixture) => {
      const directory = join(root, fixture.id);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, basename(fixture.filename)), fixture.source, "utf8");
    }),
  );
};

const classifyCases = (
  profile: "official-default" | "benchmark-owned",
  fixtures: readonly EvalFixture[],
  mappings: readonly SemgrepCaseMapping[],
  runs: readonly SemgrepProcessResult[],
): SemgrepCaseResult[] => {
  const mappingsById = new Map(mappings.map((mapping) => [mapping.id, mapping]));
  return fixtures.map((fixture) => {
    const mapping = mappingsById.get(fixture.id)!;
    if (profile === "official-default" || mapping.coverage === "unsupported") {
      const reason =
        profile === "official-default"
          ? "No applicable rule in the official p/default ruleset is mapped to this fixture."
          : mapping.reason!;
      return {
        id: fixture.id,
        expectedFinding: fixture.expectedFinding,
        coverage: "unsupported",
        status: "unsupported",
        findingCount: 0,
        ruleIds: [],
        reason,
      };
    }
    const findings = runs
      .flatMap((run) => run.output?.findings ?? [])
      .filter((finding) => {
        const inFixture = finding.path.split("/").at(-2) === fixture.id;
        return inFixture && finding.checkId.endsWith(mapping.ruleId!);
      });
    const detected = findings.length > 0;
    return {
      id: fixture.id,
      expectedFinding: fixture.expectedFinding,
      coverage: mapping.coverage,
      status: fixture.expectedFinding
        ? detected
          ? "hit"
          : "miss"
        : detected
          ? "false_positive"
          : "correct_rejection",
      findingCount: findings.length,
      ruleIds: [...new Set(findings.map((finding) => finding.checkId))].toSorted(),
    };
  });
};

export const summarizeSemgrepCases = (
  cases: readonly SemgrepCaseResult[],
): Pick<
  SemgrepProfileReport["summary"],
  | "supported"
  | "correct"
  | "misses"
  | "falsePositives"
  | "accuracy"
  | "expectedIssues"
  | "detectedExpectedIssues"
  | "recall"
  | "unsupported"
> => {
  const supported = cases.filter((result) => result.status !== "unsupported");
  const correct = supported.filter(
    (result) => result.status === "hit" || result.status === "correct_rejection",
  ).length;
  const expectedIssues = supported.filter((result) => result.expectedFinding).length;
  const detectedExpectedIssues = supported.filter((result) => result.status === "hit").length;
  const unsupported = cases.filter((result) => result.status === "unsupported");
  return {
    supported: supported.length,
    correct,
    misses: supported.filter((result) => result.status === "miss").length,
    falsePositives: supported.filter((result) => result.status === "false_positive").length,
    accuracy: supported.length === 0 ? null : correct / supported.length,
    expectedIssues,
    detectedExpectedIssues,
    recall: expectedIssues === 0 ? null : detectedExpectedIssues / expectedIssues,
    unsupported: { count: unsupported.length, ids: unsupported.map((result) => result.id) },
  };
};

const runSequential = async <Output>(
  count: number,
  run: () => Promise<Output>,
  index = 0,
): Promise<Output[]> => {
  if (index >= count) {
    return [];
  }
  const result = await run();
  return [result, ...(await runSequential(count, run, index + 1))];
};

const parseMapping = (value: unknown, index: number): SemgrepCaseMapping => {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    typeof value["sourceSha256"] !== "string"
  ) {
    throw new TypeError(`Invalid Semgrep case mapping at index ${index}`);
  }
  const coverage = value["coverage"];
  if (coverage !== "benchmark_owned" && coverage !== "unsupported") {
    throw new TypeError(`Invalid Semgrep coverage at index ${index}`);
  }
  if (coverage === "benchmark_owned" && typeof value["ruleId"] !== "string") {
    throw new TypeError(`Benchmark-owned Semgrep mapping requires ruleId at index ${index}`);
  }
  if (coverage === "unsupported" && typeof value["reason"] !== "string") {
    throw new TypeError(`Unsupported Semgrep mapping requires reason at index ${index}`);
  }
  return {
    id: value["id"],
    sourceSha256: value["sourceSha256"],
    coverage,
    ...(typeof value["ruleId"] === "string" ? { ruleId: value["ruleId"] } : {}),
    ...(typeof value["reason"] === "string" ? { reason: value["reason"] } : {}),
  };
};

const parseFinding = (value: unknown, index: number): SemgrepFinding => {
  if (
    !isRecord(value) ||
    typeof value["check_id"] !== "string" ||
    typeof value["path"] !== "string"
  ) {
    throw new TypeError(`Invalid Semgrep finding at index ${index}`);
  }
  const start = value["start"];
  if (!isRecord(start) || typeof start["line"] !== "number") {
    throw new TypeError(`Invalid Semgrep finding location at index ${index}`);
  }
  return { checkId: value["check_id"], path: value["path"], line: start["line"] };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
