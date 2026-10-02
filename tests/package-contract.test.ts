import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  packages: readonly Pick<ReleasePackage, "name">[],
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
  assert.deepEqual(packages.map(({ name }) => name).toSorted(), [
    "@scruple/cli",
    "@scruple/core",
    "@scruple/parser-oxc",
    "@scruple/provider-cloudflare",
    "@scruple/provider-decider",
    "@scruple/provider-jev",
    "@scruple/provider-kev",
  ]);
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

await test("all nine rule domains are private examples with source and compiled imports", () => {
  const domains = [
    "api-contracts",
    "async",
    "comments",
    "errors",
    "observability",
    "relational-databases",
    "resources",
    "security",
    "tests",
  ];
  const manifest: unknown = JSON.parse(
    readFileSync(join(root, "examples/rules/package.json"), "utf8"),
  );
  assert.ok(isRecord(manifest));
  assert.equal(manifest["private"], true);
  assert.equal(manifest["version"], undefined);
  assert.equal(manifest["publishConfig"], undefined);
  for (const domain of domains) {
    assert.equal(existsSync(join(root, "packages", domain, "package.json")), false);
    assert.equal(existsSync(join(root, "examples/rules", domain, "package.json")), false);
  }
  const examples = domains.map((domain) => ({ name: `@scruple/example-rules/${domain}` }));
  assert.deepEqual(
    resolvedPackageEntries(examples),
    domains.map(
      (domain) => new URL(`../examples/rules/dist/${domain}/index.js`, import.meta.url).href,
    ),
  );
  assert.deepEqual(
    resolvedPackageEntries(examples, "source"),
    domains.map((domain) => new URL(`../examples/rules/${domain}/index.ts`, import.meta.url).href),
  );
});

await test("release versioning changes public tooling but leaves private examples and eval untouched", () => {
  const directory = mkdtempSync(join(tmpdir(), "scruple-release-"));
  try {
    const publicPaths = releaseManifest().map((entry) => `${entry.directory}/package.json`);
    const privatePaths = ["examples/rules/package.json", "packages/eval/package.json"];
    const paths = ["package.json", ...publicPaths, ...privatePaths];
    for (const path of paths) {
      const destination = join(directory, path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(root, path), destination);
    }
    const output = execFileSync(
      process.execPath,
      [join(root, "scripts/set-release-version.ts"), "9.8.7"],
      {
        cwd: directory,
        encoding: "utf8",
      },
    );
    assert.equal(output, "Set 7 public packages to v9.8.7.\n");
    for (const path of ["package.json", ...publicPaths]) {
      const manifest: unknown = JSON.parse(readFileSync(join(directory, path), "utf8"));
      assert.ok(isRecord(manifest));
      assert.equal(manifest["version"], "9.8.7", path);
    }
    for (const path of privatePaths) {
      assert.equal(
        readFileSync(join(directory, path), "utf8"),
        readFileSync(join(root, path), "utf8"),
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
