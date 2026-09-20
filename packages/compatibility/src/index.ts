export type ApiExportKind = "class" | "function" | "type" | "value";

export interface ExportedApiEntry {
  entryPoint: string;
  name: string;
  kind: ApiExportKind;
  /** A producer-normalized public declaration, excluding implementation details. */
  declaration: string;
}

export interface ExportedApiSnapshot {
  schemaVersion: 1;
  packageName: string;
  packageVersion: string;
  exports: readonly ExportedApiEntry[];
}

export type SnapshotEvidence =
  | { status: "complete"; snapshot: ExportedApiSnapshot }
  | { status: "partial"; snapshot: ExportedApiSnapshot; reason: string }
  | { status: "unavailable"; reason: string };

export interface MigrationPath {
  exportId: string;
  description: string;
}

export type MigrationEvidence =
  | { status: "complete"; paths: readonly MigrationPath[] }
  | { status: "partial"; paths: readonly MigrationPath[]; reason: string }
  | { status: "unavailable"; reason: string };

export interface ApiComparisonEvidence {
  before: SnapshotEvidence;
  after: SnapshotEvidence;
}

export interface CompatibilityEvidence extends ApiComparisonEvidence {
  migrations: MigrationEvidence;
}

export interface AddedApiExport {
  kind: "added";
  exportId: string;
  after: ExportedApiEntry;
}

export interface RemovedApiExport {
  kind: "removed";
  exportId: string;
  before: ExportedApiEntry;
}

export interface ChangedApiExport {
  kind: "changed";
  exportId: string;
  before: ExportedApiEntry;
  after: ExportedApiEntry;
}

export type ApiChange = AddedApiExport | RemovedApiExport | ChangedApiExport;
export type BreakingApiChange = RemovedApiExport | ChangedApiExport;

export type ApiComparison =
  | { status: "complete"; changes: readonly ApiChange[] }
  | { status: "insufficient-context"; reasons: readonly string[] };

export type CompatibilityRuleId = "no-breaking-api-changes" | "require-migration-path";

export interface CompatibilityFinding {
  ruleId: CompatibilityRuleId;
  exportId: string;
  message: string;
  change: BreakingApiChange;
}

export type CompatibilityRuleResult =
  | { status: "complete"; findings: readonly CompatibilityFinding[] }
  | { status: "insufficient-context"; reasons: readonly string[] };

export interface CompatibilityRules {
  "no-breaking-api-changes": (evidence: ApiComparisonEvidence) => CompatibilityRuleResult;
  "require-migration-path": (evidence: CompatibilityEvidence) => CompatibilityRuleResult;
}

export interface CompatibilityPolicySet {
  readonly rules: CompatibilityRules;
}

export const compatibility = (): CompatibilityPolicySet => {
  return {
    rules: {
      "no-breaking-api-changes": noBreakingApiChanges,
      "require-migration-path": requireMigrationPath,
    },
  };
};

export const apiExportId = (entry: Pick<ExportedApiEntry, "entryPoint" | "name">): string => {
  return `${entry.entryPoint}#${entry.name}`;
};

export const compareExportedApi = (evidence: ApiComparisonEvidence): ApiComparison => {
  const reasons = snapshotEvidenceProblems(evidence);
  if (reasons.length > 0) {
    return { status: "insufficient-context", reasons };
  }

  const before = requireCompleteSnapshot(evidence.before);
  const after = requireCompleteSnapshot(evidence.after);
  if (before.packageName !== after.packageName) {
    return {
      status: "insufficient-context",
      reasons: [`Package identity changed from ${before.packageName} to ${after.packageName}.`],
    };
  }

  const duplicateReasons = [
    ...duplicateExportReasons("before", before.exports),
    ...duplicateExportReasons("after", after.exports),
  ];
  if (duplicateReasons.length > 0) {
    return { status: "insufficient-context", reasons: duplicateReasons };
  }

  const beforeById = new Map(before.exports.map((entry) => [apiExportId(entry), entry]));
  const afterById = new Map(after.exports.map((entry) => [apiExportId(entry), entry]));
  const changes: ApiChange[] = [];

  for (const [exportId, beforeEntry] of beforeById) {
    const afterEntry = afterById.get(exportId);
    if (afterEntry === undefined) {
      changes.push({ kind: "removed", exportId, before: beforeEntry });
    } else if (
      beforeEntry.kind !== afterEntry.kind ||
      beforeEntry.declaration !== afterEntry.declaration
    ) {
      changes.push({ kind: "changed", exportId, before: beforeEntry, after: afterEntry });
    }
  }
  for (const [exportId, afterEntry] of afterById) {
    if (!beforeById.has(exportId)) {
      changes.push({ kind: "added", exportId, after: afterEntry });
    }
  }

  return { status: "complete", changes: changes.toSorted(compareChanges) };
};

const noBreakingApiChanges = (evidence: ApiComparisonEvidence): CompatibilityRuleResult => {
  const comparison = compareExportedApi(evidence);
  if (comparison.status === "insufficient-context") {
    return comparison;
  }
  return {
    status: "complete",
    findings: breakingChanges(comparison.changes).map((change) => ({
      ruleId: "no-breaking-api-changes",
      exportId: change.exportId,
      message:
        change.kind === "removed"
          ? `Public export ${change.exportId} was removed.`
          : `Public export ${change.exportId} changed its kind or declaration.`,
      change,
    })),
  };
};

const requireMigrationPath = (evidence: CompatibilityEvidence): CompatibilityRuleResult => {
  const comparison = compareExportedApi(evidence);
  if (comparison.status === "insufficient-context") {
    return comparison;
  }
  if (evidence.migrations.status !== "complete") {
    return {
      status: "insufficient-context",
      reasons: [
        `Migration evidence is ${evidence.migrations.status}: ${evidence.migrations.reason}`,
      ],
    };
  }

  const documented = new Set(
    evidence.migrations.paths
      .filter((path) => path.description.trim().length > 0)
      .map((path) => path.exportId),
  );
  return {
    status: "complete",
    findings: breakingChanges(comparison.changes)
      .filter((change) => !documented.has(change.exportId))
      .map((change) => ({
        ruleId: "require-migration-path",
        exportId: change.exportId,
        message: `Document a migration path for breaking change to ${change.exportId}.`,
        change,
      })),
  };
};

const snapshotEvidenceProblems = (evidence: ApiComparisonEvidence): string[] => {
  return (["before", "after"] as const).flatMap((side) => {
    const value = evidence[side];
    return value.status === "complete"
      ? []
      : [`${capitalize(side)} API evidence is ${value.status}: ${value.reason}`];
  });
};

const requireCompleteSnapshot = (evidence: SnapshotEvidence): ExportedApiSnapshot => {
  if (evidence.status !== "complete") {
    throw new Error("Snapshot evidence must be complete");
  }
  return evidence.snapshot;
};

const duplicateExportReasons = (side: string, entries: readonly ExportedApiEntry[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    const id = apiExportId(entry);
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  return [...duplicates].toSorted().map((id) => `${capitalize(side)} snapshot repeats ${id}.`);
};

const breakingChanges = (changes: readonly ApiChange[]): BreakingApiChange[] => {
  return changes.filter((change): change is BreakingApiChange => change.kind !== "added");
};

const compareChanges = (left: ApiChange, right: ApiChange): number => {
  return left.exportId.localeCompare(right.exportId) || left.kind.localeCompare(right.kind);
};

const capitalize = (value: string): string => {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
};
