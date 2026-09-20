import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type CodeqlCaseScope = "native" | "custom" | "unsupported";

export interface CodeqlManifestCase {
  id: string;
  sourceSha256: string;
  scope: CodeqlCaseScope;
  reason: string;
  officialQueryIds: string[];
  customQueryIds: string[];
}

export interface CodeqlManifest {
  schemaVersion: 1;
  corpus: string;
  pinnedFixtureList: string;
  officialSuite: string;
  cases: CodeqlManifestCase[];
}

export interface CodeqlFixture {
  id: string;
  filename: string;
  source: string;
  ruleId: string;
  expectedFinding: boolean;
}

export interface CodeqlFinding {
  fixtureId: string | null;
  ruleId: string;
  message: string;
  uri: string | null;
  startLine: number | null;
}

export interface CodeqlProcessResult {
  durationMs: number;
  exitCode: number | null;
  error: string | null;
  stderr: string | null;
}

export interface CodeqlAnalysisResult extends CodeqlProcessResult {
  kind: "official" | "custom";
  warmup: boolean;
  repetition: number;
  findings: CodeqlFinding[];
}

export interface CodeqlCaseResult {
  id: string;
  scope: CodeqlCaseScope;
  status: "matched" | "miss" | "error" | "unsupported";
  expectedFinding: boolean;
  queryIds: string[];
  findingCount: number;
  reason: string;
}

export interface CodeqlCoverageSummary {
  native: {
    denominator: number;
    matched: number;
    misses: number;
    errors: number;
    accuracy: number | null;
  };
  custom: {
    denominator: number;
    matched: number;
    misses: number;
    errors: number;
    accuracy: number | null;
  };
  unsupported: { count: number; cases: { id: string; reason: string }[] };
}

export interface CodeqlBenchmarkReport {
  schemaVersion: 1;
  tool: { name: "CodeQL"; version: string; queryPack: string };
  environment: { platform: string; architecture: string; node: string; cpuCount: number };
  settings: { warmups: number; repetitions: number };
  workload: { fixtureIds: string[]; sourceHashes: Record<string, string> };
  databaseCreation: CodeqlProcessResult;
  analyses: CodeqlAnalysisResult[];
  cases: CodeqlCaseResult[];
  summary: CodeqlCoverageSummary;
}

interface SarifLocation {
  physicalLocation?: {
    artifactLocation?: { uri?: unknown };
    region?: { startLine?: unknown };
  };
}

interface SarifResult {
  ruleId?: unknown;
  message?: { text?: unknown };
  locations?: SarifLocation[];
}

interface RunProcess {
  (command: string, arguments_: readonly string[]): Promise<CodeqlProcessResult>;
}

export const parseCodeqlManifest = (value: unknown): CodeqlManifest => {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || !Array.isArray(value["cases"])) {
    throw new TypeError("CodeQL fixture manifest must use schema version 1");
  }
  const corpus = requiredString(value, "corpus");
  const pinnedFixtureList = requiredString(value, "pinnedFixtureList");
  const officialSuite = requiredString(value, "officialSuite");
  const cases = value["cases"].map((entry, index) => parseManifestCase(entry, index));
  if (new Set(cases.map((entry) => entry.id)).size !== cases.length) {
    throw new Error("CodeQL fixture manifest IDs must be unique");
  }
  return { schemaVersion: 1, corpus, pinnedFixtureList, officialSuite, cases };
};

export const loadAndValidateCodeqlFixtures = async (
  repositoryRoot: string,
  manifest: CodeqlManifest,
): Promise<CodeqlFixture[]> => {
  const corpus: unknown = JSON.parse(await readFile(join(repositoryRoot, manifest.corpus), "utf8"));
  const pinned: unknown = JSON.parse(
    await readFile(join(repositoryRoot, manifest.pinnedFixtureList), "utf8"),
  );
  if (!isRecord(corpus) || !Array.isArray(corpus["fixtures"]) || !isStringArray(pinned)) {
    throw new TypeError("CodeQL benchmark corpus or pinned fixture list is invalid");
  }
  const fixtureRecords = corpus["fixtures"].filter(isRecord);
  const fixturesById = new Map(fixtureRecords.map((entry) => [entry["id"], entry]));
  const manifestIds = manifest.cases.map((entry) => entry.id);
  if (JSON.stringify(manifestIds) !== JSON.stringify(pinned)) {
    throw new Error("CodeQL manifest cases must match benchmarks/fixtures.json in order");
  }
  return manifest.cases.map((entry) => {
    const fixture = fixturesById.get(entry.id);
    if (fixture === undefined) {
      throw new Error(`CodeQL fixture is missing from the evaluation corpus: ${entry.id}`);
    }
    const source = requiredString(fixture, "source");
    const actualHash = sha256(source);
    if (actualHash !== entry.sourceSha256) {
      throw new Error(
        `CodeQL fixture drift for ${entry.id}: expected ${entry.sourceSha256}, received ${actualHash}`,
      );
    }
    return {
      id: entry.id,
      filename: requiredString(fixture, "filename"),
      source,
      ruleId: requiredString(fixture, "rule_id"),
      expectedFinding: requiredBoolean(fixture, "expected_finding"),
    };
  });
};

export const materializeCodeqlFixtures = async (
  sourceRoot: string,
  fixtures: readonly CodeqlFixture[],
): Promise<void> => {
  await rm(sourceRoot, { recursive: true, force: true });
  await Promise.all(
    fixtures.map(async (fixture) => {
      const directory = join(sourceRoot, fixture.id);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, basename(fixture.filename)), fixture.source, "utf8");
    }),
  );
};

export const parseCodeqlSarif = (
  value: unknown,
  fixtureIds: ReadonlySet<string>,
): CodeqlFinding[] => {
  if (!isRecord(value) || !Array.isArray(value["runs"])) {
    throw new TypeError("CodeQL SARIF must contain runs");
  }
  const findings: CodeqlFinding[] = [];
  for (const run of value["runs"].filter(isRecord)) {
    const results = Array.isArray(run["results"]) ? run["results"] : [];
    for (const rawResult of results) {
      if (!isRecord(rawResult)) {
        continue;
      }
      const result = rawResult as SarifResult;
      const location = result.locations?.[0]?.physicalLocation;
      const uri =
        typeof location?.artifactLocation?.uri === "string" ? location.artifactLocation.uri : null;
      const decodedUri = uri === null ? null : decodeURIComponent(uri).replaceAll("\\", "/");
      const fixtureId =
        [...fixtureIds].find((id) => decodedUri?.split("/").includes(id) === true) ?? null;
      findings.push({
        fixtureId,
        ruleId: typeof result.ruleId === "string" ? result.ruleId : "",
        message: typeof result.message?.text === "string" ? result.message.text : "",
        uri: decodedUri,
        startLine:
          typeof location?.region?.startLine === "number" ? location.region.startLine : null,
      });
    }
  }
  return findings;
};

export const classifyCodeqlCases = (
  manifest: CodeqlManifest,
  fixtures: readonly CodeqlFixture[],
  measuredAnalyses: readonly CodeqlAnalysisResult[],
): CodeqlCaseResult[] => {
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  return manifest.cases.map((entry) => {
    const fixture = fixturesById.get(entry.id)!;
    const queryIds = entry.scope === "native" ? entry.officialQueryIds : entry.customQueryIds;
    if (entry.scope === "unsupported") {
      return {
        id: entry.id,
        scope: entry.scope,
        status: "unsupported",
        expectedFinding: fixture.expectedFinding,
        queryIds,
        findingCount: 0,
        reason: entry.reason,
      };
    }
    const analysisKind = entry.scope === "native" ? "official" : "custom";
    const relevantAnalyses = measuredAnalyses.filter((analysis) => analysis.kind === analysisKind);
    if (
      relevantAnalyses.length === 0 ||
      relevantAnalyses.some((analysis) => analysis.exitCode !== 0)
    ) {
      return {
        id: entry.id,
        scope: entry.scope,
        status: "error",
        expectedFinding: fixture.expectedFinding,
        queryIds,
        findingCount: 0,
        reason: entry.reason,
      };
    }
    const findings = relevantAnalyses.flatMap((analysis) =>
      analysis.findings.filter(
        (finding) => finding.fixtureId === entry.id && queryIds.includes(finding.ruleId),
      ),
    );
    const matchedEachRepetition = relevantAnalyses.every((analysis) => {
      const found = analysis.findings.some(
        (finding) => finding.fixtureId === entry.id && queryIds.includes(finding.ruleId),
      );
      return found === fixture.expectedFinding;
    });
    return {
      id: entry.id,
      scope: entry.scope,
      status: matchedEachRepetition ? "matched" : "miss",
      expectedFinding: fixture.expectedFinding,
      queryIds,
      findingCount: findings.length,
      reason: entry.reason,
    };
  });
};

export const summarizeCodeqlCases = (
  cases: readonly CodeqlCaseResult[],
): CodeqlCoverageSummary => ({
  native: summarizeScope(cases, "native"),
  custom: summarizeScope(cases, "custom"),
  unsupported: {
    count: cases.filter((entry) => entry.status === "unsupported").length,
    cases: cases
      .filter((entry) => entry.status === "unsupported")
      .map((entry) => ({ id: entry.id, reason: entry.reason })),
  },
});

export const readSarifFile = async (
  path: string,
  fixtureIds: ReadonlySet<string>,
): Promise<CodeqlFinding[]> => {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseCodeqlSarif(value, fixtureIds);
};

const parseManifestCase = (value: unknown, index: number): CodeqlManifestCase => {
  if (!isRecord(value)) {
    throw new TypeError(`CodeQL manifest case ${index} must be an object`);
  }
  const scope = value["scope"];
  if (scope !== "native" && scope !== "custom" && scope !== "unsupported") {
    throw new TypeError(`CodeQL manifest case ${index} has an invalid scope`);
  }
  return {
    id: requiredString(value, "id"),
    sourceSha256: requiredString(value, "sourceSha256"),
    scope,
    reason: requiredString(value, "reason"),
    officialQueryIds: optionalStringArray(value["officialQueryIds"]),
    customQueryIds: optionalStringArray(value["customQueryIds"]),
  };
};

const requiredString = (value: Record<string, unknown>, key: string): string => {
  const entry = value[key];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`CodeQL benchmark requires nonempty ${key}`);
  }
  return entry;
};

const requiredBoolean = (value: Record<string, unknown>, key: string): boolean => {
  const entry = value[key];
  if (typeof entry !== "boolean") {
    throw new TypeError(`CodeQL benchmark requires boolean ${key}`);
  }
  return entry;
};

const optionalStringArray = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }
  if (!isStringArray(value)) {
    throw new TypeError("CodeQL query IDs must be an array of strings");
  }
  return value;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const summarizeScope = (
  cases: readonly CodeqlCaseResult[],
  scope: "native" | "custom",
): CodeqlCoverageSummary["native"] => {
  const supported = cases.filter((entry) => entry.scope === scope);
  const matched = supported.filter((entry) => entry.status === "matched").length;
  const misses = supported.filter((entry) => entry.status === "miss").length;
  const errors = supported.filter((entry) => entry.status === "error").length;
  const denominator = matched + misses;
  return {
    denominator,
    matched,
    misses,
    errors,
    accuracy: denominator === 0 ? null : matched / denominator,
  };
};

export type { RunProcess };
