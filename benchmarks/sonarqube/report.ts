import { createHash } from "node:crypto";

export interface FixtureMapping {
  id: string;
  scruple_rule: string;
  expected_finding: boolean;
  source_sha256: string;
  coverage: "native" | "custom" | "unsupported";
  sonar_rules?: string[];
  reason: string;
}

export interface SonarIssue {
  key: string;
  rule: string;
  component: string;
  message: string;
  status: string;
  severity?: string;
  type?: string;
  line?: number;
}

export interface CapabilitySummary {
  native: { count: number; ids: string[] };
  custom: { count: number; ids: string[] };
  unsupported: { count: number; cases: Array<{ id: string; reason: string }> };
  accuracy: {
    applicable: number;
    detected: number;
    misses: string[];
    recall: number;
  };
}

interface EvalFixtureShape {
  id: string;
  rule_id: string;
  expected_finding: boolean;
  source: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const requiredString = (value: unknown, field: string, context: string): string => {
  if (!isRecord(value) || typeof value[field] !== "string" || value[field].length === 0) {
    throw new TypeError(`${context}.${field} must be a nonempty string`);
  }
  return value[field];
};

const isEvalFixture = (value: unknown): value is EvalFixtureShape =>
  isRecord(value) &&
  typeof value["id"] === "string" &&
  typeof value["rule_id"] === "string" &&
  typeof value["expected_finding"] === "boolean" &&
  typeof value["source"] === "string";

const isCoverage = (value: string): value is FixtureMapping["coverage"] =>
  value === "native" || value === "custom" || value === "unsupported";

export const sourceSha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

export const validateFixtureMapping = (
  mapping: unknown,
  benchmarkIdsValue: unknown,
  fixturesValue: unknown,
): FixtureMapping[] => {
  if (
    !isRecord(mapping) ||
    mapping["schema_version"] !== 1 ||
    !Array.isArray(mapping["fixtures"])
  ) {
    throw new TypeError("SonarQube fixture mapping must use schema version 1");
  }
  if (
    !Array.isArray(benchmarkIdsValue) ||
    !benchmarkIdsValue.every((id) => typeof id === "string")
  ) {
    throw new TypeError("Benchmark fixture IDs must be strings");
  }
  if (!Array.isArray(fixturesValue) || !fixturesValue.every((value) => isEvalFixture(value))) {
    throw new TypeError("Evaluation fixtures have an invalid shape");
  }
  const benchmarkIds: string[] = benchmarkIdsValue;
  const fixtures: EvalFixtureShape[] = fixturesValue;
  const mappedIds = mapping["fixtures"].map((entry, index) => {
    return requiredString(entry, "id", `mapping fixture ${index}`);
  });
  if (new Set(mappedIds).size !== mappedIds.length) {
    throw new Error("SonarQube fixture mapping IDs must be unique");
  }
  if (JSON.stringify(mappedIds.toSorted()) !== JSON.stringify([...benchmarkIds].toSorted())) {
    throw new Error("SonarQube fixture mapping must cover exactly benchmarks/fixtures.json");
  }
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const parsedMappings: FixtureMapping[] = [];
  for (const entry of mapping["fixtures"]) {
    if (!isRecord(entry)) {
      throw new TypeError("SonarQube fixture mapping entries must be objects");
    }
    const id = requiredString(entry, "id", "mapping fixture");
    const fixture = fixturesById.get(id);
    if (fixture === undefined) {
      throw new Error(`Unknown mapped fixture: ${id}`);
    }
    const coverage = requiredString(entry, "coverage", id);
    if (!isCoverage(coverage)) {
      throw new Error(`${id}.coverage is invalid`);
    }
    if (
      entry["scruple_rule"] !== fixture.rule_id ||
      entry["expected_finding"] !== fixture.expected_finding
    ) {
      throw new Error(`${id} rule or expected finding drifted`);
    }
    if (entry["source_sha256"] !== sourceSha256(fixture.source)) {
      throw new Error(`${id} source drifted`);
    }
    const reason = requiredString(entry, "reason", id);
    let sonarRules: string[] | undefined;
    if (coverage === "native" || coverage === "custom") {
      if (!Array.isArray(entry["sonar_rules"]) || entry["sonar_rules"].length === 0) {
        throw new Error(`${id} applicable mapping requires sonar_rules`);
      }
      if (
        !entry["sonar_rules"].every(
          (rule) => typeof rule === "string" && rule.startsWith("javascript:"),
        )
      ) {
        throw new Error(`${id} has an invalid SonarQube rule`);
      }
      sonarRules = entry["sonar_rules"];
    } else if (entry["sonar_rules"] !== undefined) {
      throw new Error(`${id} unsupported mapping must not claim SonarQube rules`);
    }
    parsedMappings.push({
      id,
      scruple_rule: fixture.rule_id,
      expected_finding: fixture.expected_finding,
      source_sha256: sourceSha256(fixture.source),
      coverage,
      ...(sonarRules === undefined ? {} : { sonar_rules: sonarRules }),
      reason,
    });
  }
  return parsedMappings;
};

export const summarizeCapabilities = (
  mappings: readonly FixtureMapping[],
  issues: readonly SonarIssue[],
  projectKey: string,
): CapabilitySummary => {
  const byCoverage = (coverage: FixtureMapping["coverage"]): FixtureMapping[] =>
    mappings.filter((mapping) => mapping.coverage === coverage);
  const native = byCoverage("native");
  const custom = byCoverage("custom");
  const unsupported = byCoverage("unsupported");
  const applicable = [...native, ...custom];
  const detected = applicable.filter((mapping) => {
    const componentPrefix = `${projectKey}:${mapping.id}/`;
    return issues.some(
      (issue) =>
        issue.component.startsWith(componentPrefix) &&
        mapping.sonar_rules?.includes(issue.rule) === true,
    );
  });
  const detectedIds = new Set(detected.map((mapping) => mapping.id));
  return {
    native: { count: native.length, ids: native.map((mapping) => mapping.id) },
    custom: { count: custom.length, ids: custom.map((mapping) => mapping.id) },
    unsupported: {
      count: unsupported.length,
      cases: unsupported.map(({ id, reason }) => ({ id, reason })),
    },
    accuracy: {
      applicable: applicable.length,
      detected: detected.length,
      misses: applicable
        .filter((mapping) => !detectedIds.has(mapping.id))
        .map((mapping) => mapping.id),
      recall: applicable.length === 0 ? 0 : detected.length / applicable.length,
    },
  };
};

export const parseSonarIssues = (value: unknown): { total: number; issues: SonarIssue[] } => {
  if (!isRecord(value) || !Array.isArray(value["issues"])) {
    throw new TypeError("SonarQube issues response must contain an issues array");
  }
  const total = isRecord(value["paging"]) ? value["paging"]["total"] : value["total"];
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new TypeError("SonarQube issues response must contain a nonnegative total");
  }
  const issues = value["issues"].map((issue, index): SonarIssue => {
    const context = `SonarQube issue ${index}`;
    const parsed = {
      key: requiredString(issue, "key", context),
      rule: requiredString(issue, "rule", context),
      component: requiredString(issue, "component", context),
      message: requiredString(issue, "message", context),
      status: requiredString(issue, "status", context),
    };
    return {
      ...parsed,
      ...(isRecord(issue) && typeof issue["severity"] === "string"
        ? { severity: issue["severity"] }
        : {}),
      ...(isRecord(issue) && typeof issue["type"] === "string" ? { type: issue["type"] } : {}),
      ...(isRecord(issue) &&
      typeof issue["line"] === "number" &&
      Number.isSafeInteger(issue["line"])
        ? { line: issue["line"] }
        : {}),
    };
  });
  return { total, issues };
};
