import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

await test("public packages satisfy their distribution contract", () => {
  const packages = releaseManifest();
  const version = packages[0]?.version;
  assert.ok(version !== undefined);
  assert.match(runReleaseScript("validate", `v${version}`), /Validated public packages/u);
  assert.deepEqual(missingPublishedFiles(packages), []);
  assert.deepEqual(publicationOrderViolations(packages), []);
});

interface ReleasePackage {
  directory: string;
  name: string;
  tarball: string;
  version: string;
  workspaceDependencies: readonly string[];
}

function releaseManifest(): ReleasePackage[] {
  const value: unknown = JSON.parse(runReleaseScript("manifest"));
  if (!Array.isArray(value) || !value.every((entry) => isReleasePackage(entry))) {
    throw new TypeError("Release manifest has an invalid shape");
  }
  return value;
}

function runReleaseScript(...arguments_: readonly string[]): string {
  return execFileSync(process.execPath, ["scripts/release-packages.ts", ...arguments_], {
    cwd: root,
    encoding: "utf8",
  });
}

function missingPublishedFiles(packages: readonly ReleasePackage[]): string[] {
  return packages.flatMap((entry) => {
    const manifest: unknown = JSON.parse(
      readFileSync(join(root, entry.directory, "package.json"), "utf8"),
    );
    if (!isRecord(manifest)) {
      return [`${entry.name}: package.json`];
    }
    const paths = [
      ...conditionalExportPaths(manifest["exports"]),
      ...recordStringValues(manifest["bin"]),
    ];
    return paths
      .filter((path) => !existsSync(join(root, entry.directory, path)))
      .map((path) => `${entry.name}: ${path}`);
  });
}

function publicationOrderViolations(packages: readonly ReleasePackage[]): string[] {
  const positions = new Map(packages.map((entry, index) => [entry.name, index]));
  return packages.flatMap((entry, index) =>
    entry.workspaceDependencies
      .filter((dependency) => (positions.get(dependency) ?? Number.POSITIVE_INFINITY) >= index)
      .map((dependency) => `${dependency} must precede ${entry.name}`),
  );
}

function conditionalExportPaths(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).flatMap((entry) => recordStringValues(entry));
}

function recordStringValues(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).filter((entry): entry is string => typeof entry === "string");
}

function isReleasePackage(value: unknown): value is ReleasePackage {
  return (
    isRecord(value) &&
    typeof value["directory"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["tarball"] === "string" &&
    typeof value["version"] === "string" &&
    Array.isArray(value["workspaceDependencies"]) &&
    value["workspaceDependencies"].every((entry) => typeof entry === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
