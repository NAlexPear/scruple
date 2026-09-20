#!/usr/bin/env node
/* oxlint-disable eslint/no-await-in-loop, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parseSonarIssues, summarizeCapabilities, validateFixtureMapping } from "./report.ts";

const SERVER_IMAGE =
  "sonarqube:26.9.0.129388-community@sha256:58b068af30bdfdccf91222de36e310529033e853dfae221b429cba80d10d5751";
const SCANNER_IMAGE =
  "sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0@sha256:a3f4215076706c95a17a68c19322ee916e40a3acd081a8c1a1e839e0194afa57";
const PROJECT_KEY = "scruple-sonarqube-benchmark";
const root = fileURLToPath(new URL("../..", import.meta.url));

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({ exitCode, signal, stdout, stderr, durationMs: performance.now() - started });
    });
  });

const checked = async (command, args, options) => {
  const result = await run(command, args, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command} ${args[0] ?? ""} failed (${result.exitCode}): ${result.stderr.trim()}`,
    );
  }
  return result;
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const api = async (baseUrl, path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`SonarQube API ${path} returned ${response.status}`);
  }
  return response.json();
};

const waitForServer = async (baseUrl, deadline = Date.now() + 180_000) => {
  while (Date.now() < deadline) {
    try {
      const status = await api(baseUrl, "/api/system/status");
      if (status.status === "UP") {
        return status;
      }
    } catch {}
    await new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    });
  }
  throw new Error("SonarQube did not become ready within 180 seconds");
};

const basic = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

const createToken = async (baseUrl, password, suffix) => {
  const change = new URLSearchParams({ login: "admin", previousPassword: "admin", password });
  const changed = await fetch(`${baseUrl}/api/users/change_password`, {
    method: "POST",
    headers: { Authorization: basic("admin", "admin") },
    body: change,
  });
  if (!changed.ok) {
    throw new Error(`Password setup returned ${changed.status}`);
  }
  const tokenResponse = await fetch(`${baseUrl}/api/user_tokens/generate`, {
    method: "POST",
    headers: { Authorization: basic("admin", password) },
    body: new URLSearchParams({ name: `scruple-benchmark-${suffix}` }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Token setup returned ${tokenResponse.status}`);
  }
  const body = await tokenResponse.json();
  if (typeof body.token !== "string") {
    throw new TypeError("Token setup returned no token");
  }
  return body.token;
};

const fetchIssues = async (baseUrl, token) => {
  const query = new URLSearchParams({ componentKeys: PROJECT_KEY, ps: "500", p: "1" });
  const body = await api(baseUrl, `/api/issues/search?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const parsed = parseSonarIssues(body);
  if (parsed.total > parsed.issues.length) {
    throw new Error(`Issue response was truncated at ${parsed.issues.length} of ${parsed.total}`);
  }
  return parsed;
};

const scan = ({ cacheVolume, network, scannerImage, sourceDir, token }) => {
  const args = [
    "run",
    "--rm",
    "--network",
    network,
    "-e",
    "SONAR_HOST_URL=http://sonarqube:9000",
    "-e",
    `SONAR_TOKEN=${token}`,
    "-v",
    `${sourceDir}:/usr/src`,
    "-v",
    `${cacheVolume}:/opt/sonar-scanner/.sonar/cache`,
    scannerImage,
    `-Dsonar.projectKey=${PROJECT_KEY}`,
    "-Dsonar.projectName=Scruple SonarQube benchmark",
    "-Dsonar.sources=.",
    "-Dsonar.sourceEncoding=UTF-8",
    "-Dsonar.qualitygate.wait=true",
    "-Dsonar.qualitygate.timeout=120",
  ];
  return run("docker", args);
};

const summarizeFixtureFindings = (issues, mappings) =>
  mappings.map((mapping) => {
    const prefix = `${PROJECT_KEY}:${mapping.id}/`;
    const fixtureIssues = issues.filter((issue) => issue.component.startsWith(prefix));
    const expectedRules = new Set(mapping.sonar_rules ?? []);
    return {
      fixtureId: mapping.id,
      expectedRules: mapping.sonar_rules ?? [],
      matchedFindingCount: fixtureIssues.filter((issue) => expectedRules.has(issue.rule)).length,
      allFindingCount: fixtureIssues.length,
    };
  });

const main = async () => {
  const { values } = parseArgs({
    options: {
      repetitions: { type: "string", default: "3" },
      warmups: { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help === true) {
    process.stdout.write("Usage: pnpm benchmark-sonarqube [--warmups N] [--repetitions N]\n");
    return;
  }
  const warmups = Number(values.warmups);
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(warmups) || warmups < 0) {
    throw new Error("--warmups must be nonnegative");
  }
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be positive");
  }

  const [corpus, benchmarkIds, mapping] = await Promise.all([
    readJson(join(root, "tests/eval-fixtures.json")),
    readJson(join(root, "benchmarks/fixtures.json")),
    readJson(join(root, "benchmarks/sonarqube/fixture-map.json")),
  ]);
  const mappings = validateFixtureMapping(mapping, benchmarkIds, corpus.fixtures);
  const fixturesById = new Map(corpus.fixtures.map((fixture) => [fixture.id, fixture]));
  const suffix = randomUUID().slice(0, 8);
  const names = {
    server: `scruple-sonarqube-${suffix}`,
    network: `scruple-sonarqube-${suffix}`,
    cache: `scruple-sonarqube-cache-${suffix}`,
  };
  const sourceDir = await mkdtemp(join(tmpdir(), "scruple-sonarqube-"));
  await chmod(sourceDir, 0o777);
  for (const mappingEntry of mappings) {
    const fixture = fixturesById.get(mappingEntry.id);
    const fixtureDir = join(sourceDir, fixture.id);
    await mkdir(fixtureDir);
    await chmod(fixtureDir, 0o777);
    await writeFile(join(fixtureDir, fixture.filename), fixture.source);
  }

  let serverUrl;
  try {
    const dockerVersion = await checked("docker", ["version", "--format", "{{json .}}"]);
    const pullsStarted = performance.now();
    await checked("docker", ["pull", SERVER_IMAGE]);
    await checked("docker", ["pull", SCANNER_IMAGE]);
    const imagePullDurationMs = performance.now() - pullsStarted;
    await checked("docker", ["network", "create", names.network]);
    await checked("docker", ["volume", "create", names.cache]);

    const setupStarted = performance.now();
    await checked("docker", [
      "run",
      "-d",
      "--name",
      names.server,
      "--network",
      names.network,
      "--network-alias",
      "sonarqube",
      "-p",
      "127.0.0.1::9000",
      SERVER_IMAGE,
    ]);
    const port = (await checked("docker", ["port", names.server, "9000/tcp"])).stdout
      .trim()
      .split(":")
      .at(-1);
    serverUrl = `http://127.0.0.1:${port}`;
    const initialStatus = await waitForServer(serverUrl);
    const password = `Scruple-${suffix}-benchmark`;
    const token = await createToken(serverUrl, password, suffix);
    const setupDurationMs = performance.now() - setupStarted;
    const scannerVersion = await checked("docker", ["run", "--rm", SCANNER_IMAGE, "--version"]);

    const warmupSamples = [];
    for (let index = 0; index < warmups; index += 1) {
      const result = await scan({
        cacheVolume: names.cache,
        network: names.network,
        scannerImage: SCANNER_IMAGE,
        sourceDir,
        token,
      });
      if (result.exitCode !== 0) {
        throw new Error(`Warmup scan failed: ${result.stderr.trim()}`);
      }
      warmupSamples.push({
        warmup: index + 1,
        scannerWallTimeMs: result.durationMs,
        process: { exitCode: result.exitCode, signal: result.signal, errors: [] },
      });
    }

    const samples = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const sampleStarted = performance.now();
      const processResult = await scan({
        cacheVolume: names.cache,
        network: names.network,
        scannerImage: SCANNER_IMAGE,
        sourceDir,
        token,
      });
      let reportDurationMs = 0;
      let findings = { total: 0, issues: [] };
      let reportError;
      if (processResult.exitCode === 0) {
        const reportStarted = performance.now();
        try {
          findings = await fetchIssues(serverUrl, token);
        } catch (error) {
          reportError = error instanceof Error ? error.message : String(error);
        }
        reportDurationMs = performance.now() - reportStarted;
      }
      samples.push({
        repetition,
        wallTimeMs: performance.now() - sampleStarted,
        scannerWallTimeMs: processResult.durationMs,
        reportFetchTimeMs: reportDurationMs,
        process: {
          exitCode: processResult.exitCode,
          signal: processResult.signal,
          errors: [
            ...(processResult.exitCode === 0 ? [] : [processResult.stderr.trim()]),
            ...(reportError === undefined ? [] : [reportError]),
          ],
        },
        findings: {
          total: findings.total,
          byFixture: summarizeFixtureFindings(findings.issues, mappings),
          capabilities: summarizeCapabilities(mappings, findings.issues, PROJECT_KEY),
          issues: findings.issues,
        },
      });
    }
    const processors = cpus();
    process.stdout.write(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          tool: {
            serverImage: SERVER_IMAGE,
            serverVersion: initialStatus.version,
            scannerImage: SCANNER_IMAGE,
            scannerVersionOutput: scannerVersion.stdout.trim(),
          },
          environment: {
            node: process.version,
            platform: platform(),
            release: release(),
            architecture: arch(),
            cpu: processors[0]?.model ?? "unknown",
            logicalCpuCount: processors.length,
            totalMemoryBytes: totalmem(),
            dockerVersion: JSON.parse(dockerVersion.stdout),
          },
          setup: {
            imagePullDurationMs,
            serverSetupDurationMs: setupDurationMs,
            scannerVersionDiscoveryDurationMs: scannerVersion.durationMs,
            warmups: warmupSamples,
          },
          settings: { warmups, repetitions, qualityGateWait: true },
          workload: {
            fixtureIds: mappings.map((entry) => entry.id),
            casesPerRepetition: mappings.length,
            measuredCaseEvaluations: mappings.length * repetitions,
          },
          fixtureMapping: mappings,
          samples,
        },
        null,
        2,
      )}\n`,
    );
    if (
      samples.some((sample) => sample.process.exitCode !== 0 || sample.process.errors.length > 0)
    ) {
      process.exitCode = 1;
    }
  } finally {
    await run("docker", ["rm", "-f", names.server]).catch(() => {});
    await run("docker", ["network", "rm", names.network]).catch(() => {});
    await run("docker", ["volume", "rm", names.cache]).catch(() => {});
    await rm(sourceDir, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  process.stderr.write(
    `sonarqube benchmark: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
