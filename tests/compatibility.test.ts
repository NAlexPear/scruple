import assert from "node:assert/strict";
import test from "node:test";

import {
  compareExportedApi,
  compatibility,
  type CompatibilityEvidence,
  type ExportedApiEntry,
} from "@scruple/compatibility";

const existingExport: ExportedApiEntry = {
  entryPoint: ".",
  name: "parse",
  kind: "function",
  declaration: "function parse(source: string): Document",
};

const addedExport: ExportedApiEntry = {
  entryPoint: ".",
  name: "format",
  kind: "function",
  declaration: "function format(document: Document): string",
};

const snapshot = (packageVersion: string, exports: readonly ExportedApiEntry[]) => {
  return {
    schemaVersion: 1 as const,
    packageName: "example",
    packageVersion,
    exports,
  };
};

const evidence = (
  before: readonly ExportedApiEntry[],
  after: readonly ExportedApiEntry[],
): CompatibilityEvidence => {
  return {
    before: {
      status: "complete",
      snapshot: snapshot("1.0.0", before),
    },
    after: {
      status: "complete",
      snapshot: snapshot("2.0.0", after),
    },
    migrations: { status: "complete", paths: [] },
  };
};

await test("comparison distinguishes additive exports from breaking changes", () => {
  const additive = evidence([existingExport], [existingExport, addedExport]);
  assert.deepEqual(compareExportedApi(additive), {
    status: "complete",
    changes: [
      {
        kind: "added",
        exportId: ".#format",
        after: addedExport,
      },
    ],
  });
  assert.deepEqual(compatibility().rules["no-breaking-api-changes"](additive), {
    status: "complete",
    findings: [],
  });

  const breaking = evidence(
    [existingExport],
    [{ ...existingExport, declaration: "function parse(source: Uint8Array): Document" }],
  );
  const result = compatibility().rules["no-breaking-api-changes"](breaking);
  assert.ok(result.status === "complete");
  assert.equal(result.findings[0]?.change.kind, "changed");
});

await test("migration rule requires a documented path for each breaking export", () => {
  const undocumented = evidence([existingExport], []);
  const rule = compatibility().rules["require-migration-path"];
  const finding = rule(undocumented);
  assert.ok(finding.status === "complete");
  assert.equal(finding.findings[0]?.exportId, ".#parse");

  const documented: CompatibilityEvidence = {
    ...undocumented,
    migrations: {
      status: "complete",
      paths: [{ exportId: ".#parse", description: "Use parseDocument(source) instead." }],
    },
  };
  assert.deepEqual(rule(documented), { status: "complete", findings: [] });
});

await test("incomplete before, after, or migration evidence is explicit", () => {
  const complete = evidence([existingExport], []);
  assert.deepEqual(
    compareExportedApi({
      before: { status: "unavailable", reason: "baseline artifact was not retained" },
      after: complete.after,
    }),
    {
      status: "insufficient-context",
      reasons: ["Before API evidence is unavailable: baseline artifact was not retained"],
    },
  );
  assert.deepEqual(
    compareExportedApi({
      before: complete.before,
      after: {
        status: "partial",
        snapshot: snapshot("2.0.0", []),
        reason: "declaration emit failed for one entry point",
      },
    }),
    {
      status: "insufficient-context",
      reasons: ["After API evidence is partial: declaration emit failed for one entry point"],
    },
  );

  const result = compatibility().rules["require-migration-path"]({
    ...complete,
    migrations: { status: "partial", paths: [], reason: "only one guide was indexed" },
  });
  assert.deepEqual(result, {
    status: "insufficient-context",
    reasons: ["Migration evidence is partial: only one guide was indexed"],
  });
});
