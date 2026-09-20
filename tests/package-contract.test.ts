import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

interface ReleasePackage {
  directory: string;
  name: string;
  tarball: string;
  version: string;
  workspaceDependencies: readonly string[];
}

const releaseManifest = (): ReleasePackage[] => {
  const value: unknown = JSON.parse(runReleaseScript("manifest"));
  if (!Array.isArray(value) || !value.every((entry) => isReleasePackage(entry))) {
    throw new TypeError("Release manifest has an invalid shape");
  }
  return value;
};

const runReleaseScript = (...arguments_: readonly string[]): string => {
  return execFileSync(process.execPath, ["scripts/release-packages.ts", ...arguments_], {
    cwd: root,
    encoding: "utf8",
  });
};

const missingPublishedFiles = (packages: readonly ReleasePackage[]): string[] => {
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
};

const publicationOrderViolations = (packages: readonly ReleasePackage[]): string[] => {
  const positions = new Map(packages.map((entry, index) => [entry.name, index]));
  return packages.flatMap((entry, index) =>
    entry.workspaceDependencies
      .filter((dependency) => (positions.get(dependency) ?? Number.POSITIVE_INFINITY) >= index)
      .map((dependency) => `${dependency} must precede ${entry.name}`),
  );
};

const resolvedPackageEntries = (
  packages: readonly ReleasePackage[],
  condition?: string,
): string[] => {
  const names = packages.map((entry) => entry.name);
  const script = `
    const names = ${JSON.stringify(names)};
    await Promise.all(names.map((name) => import(name)));
    process.stdout.write(JSON.stringify(names.map((name) => import.meta.resolve(name))));
  `;
  const nodeArguments = [
    ...(condition === undefined ? [] : [`--conditions=${condition}`]),
    "--input-type=module",
    "--eval",
    script,
  ];
  const value: unknown = JSON.parse(
    execFileSync(process.execPath, nodeArguments, { cwd: root, encoding: "utf8" }),
  );
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError("Resolved package entries must be strings");
  }
  return value;
};

const conditionalExportPaths = (value: unknown): string[] => {
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).flatMap((entry) => recordStringValues(entry));
};

const recordStringValues = (value: unknown): string[] => {
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).filter((entry): entry is string => typeof entry === "string");
};

const isReleasePackage = (value: unknown): value is ReleasePackage => {
  return (
    isRecord(value) &&
    typeof value["directory"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["tarball"] === "string" &&
    typeof value["version"] === "string" &&
    Array.isArray(value["workspaceDependencies"]) &&
    value["workspaceDependencies"].every((entry) => typeof entry === "string")
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

await test("public packages satisfy their distribution contract", () => {
  const packages = releaseManifest();
  const version = packages[0]?.version;
  assert.ok(version !== undefined);
  assert.match(runReleaseScript("validate", `v${version}`), /Validated public packages/u);
  assert.deepEqual(missingPublishedFiles(packages), []);
  assert.deepEqual(publicationOrderViolations(packages), []);
});

await test("public packages support compiled and raw TypeScript imports", () => {
  const packages = releaseManifest();

  assert.equal(
    resolvedPackageEntries(packages).every((url) => url.endsWith("/dist/index.js")),
    true,
  );
  assert.equal(
    resolvedPackageEntries(packages, "source").every((url) => url.endsWith("/src/index.ts")),
    true,
  );
});
