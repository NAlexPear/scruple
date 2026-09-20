import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];
if (version === undefined || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)) {
  throw new Error("Usage: pnpm release:version <semver>");
}

const manifestPaths = ["package.json"];
for (const entry of readdirSync("packages", { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const path = join("packages", entry.name, "package.json");
  if (!existsSync(path)) {
    continue;
  }
  const manifest = readManifest(path);
  if (manifest["private"] !== true) {
    manifestPaths.push(path);
  }
}

for (const path of manifestPaths) {
  const manifest = readManifest(path);
  manifest["version"] = version;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

process.stdout.write(`Set ${manifestPaths.length - 1} public packages to v${version}.\n`);

function readManifest(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(value)) {
    throw new TypeError(`${path} must contain a JSON object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
