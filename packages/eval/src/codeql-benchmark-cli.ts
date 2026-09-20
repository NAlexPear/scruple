import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  classifyCodeqlCases,
  loadAndValidateCodeqlFixtures,
  materializeCodeqlFixtures,
  parseCodeqlManifest,
  readSarifFile,
  summarizeCodeqlCases,
  type CodeqlAnalysisResult,
  type CodeqlBenchmarkReport,
  type CodeqlProcessResult,
} from "@scruple/eval/codeql-benchmark";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

const main = async (): Promise<void> => {
  const cliArguments = process.argv.slice(2);
  const codeql = option(cliArguments, "--codeql") ?? "codeql";
  const warmups = integerOption(cliArguments, "--warmups", 1, true);
  const repetitions = integerOption(cliArguments, "--repetitions", 3, false);
  const workDirectory = await mkdtemp(join(tmpdir(), "scruple-codeql-"));

  try {
    const manifest = parseCodeqlManifest(
      JSON.parse(await readFile(join(repositoryRoot, "benchmarks/codeql/fixtures.json"), "utf8")),
    );
    const fixtures = await loadAndValidateCodeqlFixtures(repositoryRoot, manifest);
    const sourceRoot = join(workDirectory, "source");
    const database = join(workDirectory, "database");
    await materializeCodeqlFixtures(sourceRoot, fixtures);

    const versionResult = await execute(codeql, ["version", "--format=json"]);
    if (versionResult.exitCode !== 0) {
      throw new Error(versionResult.error ?? versionResult.stderr ?? "CodeQL version failed");
    }
    const versionOutput = await execFileAsync(codeql, ["version", "--format=json"], {
      encoding: "utf8",
    });
    const versionValue: unknown = JSON.parse(versionOutput.stdout);
    const version =
      isRecord(versionValue) && typeof versionValue["version"] === "string"
        ? versionValue["version"]
        : "unknown";

    const databaseCreation = await execute(codeql, [
      "database",
      "create",
      database,
      "--language=javascript-typescript",
      "--build-mode=none",
      `--source-root=${sourceRoot}`,
      "--overwrite",
    ]);

    const analyses: CodeqlAnalysisResult[] = [];
    if (databaseCreation.exitCode === 0) {
      for (let index = 0; index < warmups + repetitions; index += 1) {
        const warmup = index < warmups;
        const repetition = warmup ? index + 1 : index - warmups + 1;
        analyses.push(
          // The benchmark runs analyses sequentially to avoid measuring contention.
          // eslint-disable-next-line no-await-in-loop
          await analyze(
            codeql,
            database,
            manifest.officialSuite,
            "official",
            warmup,
            repetition,
            workDirectory,
            new Set(fixtures.map((fixture) => fixture.id)),
          ),
          // The custom query remains a separate process and timing sample.
          // eslint-disable-next-line no-await-in-loop
          await analyze(
            codeql,
            database,
            join(repositoryRoot, "benchmarks/codeql/custom/TautologicalAssertEqual.ql"),
            "custom",
            warmup,
            repetition,
            workDirectory,
            new Set(fixtures.map((fixture) => fixture.id)),
          ),
        );
      }
    }

    const measured = analyses.filter((analysis) => !analysis.warmup);
    const cases = classifyCodeqlCases(manifest, fixtures, measured);
    const report: CodeqlBenchmarkReport = {
      schemaVersion: 1,
      tool: { name: "CodeQL", version, queryPack: manifest.officialSuite },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        cpuCount: cpus().length,
      },
      settings: { warmups, repetitions },
      workload: {
        fixtureIds: fixtures.map((fixture) => fixture.id),
        sourceHashes: Object.fromEntries(
          manifest.cases.map((entry) => [entry.id, entry.sourceSha256]),
        ),
      },
      databaseCreation,
      analyses,
      cases,
      summary: summarizeCodeqlCases(cases),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode =
      databaseCreation.exitCode === 0 && analyses.every((analysis) => analysis.exitCode === 0)
        ? 0
        : 1;
  } catch (error) {
    process.stderr.write(`scruple CodeQL benchmark: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
};

const analyze = async (
  codeql: string,
  database: string,
  query: string,
  kind: "official" | "custom",
  warmup: boolean,
  repetition: number,
  workDirectory: string,
  fixtureIds: ReadonlySet<string>,
): Promise<CodeqlAnalysisResult> => {
  const output = join(
    workDirectory,
    `${kind}-${warmup ? "warmup" : "measured"}-${repetition}.sarif`,
  );
  const result = await execute(codeql, [
    "database",
    "analyze",
    database,
    query,
    "--format=sarif-latest",
    `--output=${output}`,
    "--threads=0",
    "--rerun",
  ]);
  const findings = result.exitCode === 0 ? await readSarifFile(output, fixtureIds) : [];
  return { ...result, kind, warmup, repetition, findings };
};

const execute = async (
  command: string,
  commandArguments: readonly string[],
): Promise<CodeqlProcessResult> => {
  const started = performance.now();
  try {
    await execFileAsync(command, commandArguments, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      durationMs: performance.now() - started,
      exitCode: 0,
      error: null,
      stderr: null,
    };
  } catch (error) {
    const record = isRecord(error) ? error : {};
    return {
      durationMs: performance.now() - started,
      exitCode: typeof record["code"] === "number" ? record["code"] : null,
      error: errorMessage(error),
      stderr: typeof record["stderr"] === "string" ? record["stderr"].trim() : "",
    };
  }
};

const execFileAsync = (
  command: string,
  commandArguments: readonly string[],
  options: { encoding: "utf8"; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile(command, commandArguments, options, (error, stdout, stderr) => {
      if (error !== null) {
        const executionError = Object.assign(new Error(error.message), error, { stdout, stderr });
        rejectPromise(executionError);
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });

const option = (values: readonly string[], name: string): string | undefined => {
  const index = values.indexOf(name);
  return index === -1 ? undefined : values[index + 1];
};

const integerOption = (
  values: readonly string[],
  name: string,
  fallback: number,
  allowZero: boolean,
): number => {
  const raw = option(values, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? "a nonnegative" : "a positive"} integer`);
  }
  return value;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

await main();
