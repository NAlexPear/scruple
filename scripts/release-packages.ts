import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryUrl = "git+https://github.com/NAlexPear/scruple.git";
const homepage = "https://github.com/NAlexPear/scruple#readme";
const bugsUrl = "https://github.com/NAlexPear/scruple/issues";

export interface PublicPackage {
  directory: string;
  manifest: Readonly<Record<string, unknown>>;
  name: string;
  tarball: string;
  version: string;
  workspaceDependencies: readonly string[];
}

export const loadPublicPackages = (root: string): PublicPackage[] => {
  const packagesDirectory = join(root, "packages");
  return readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name))
    .filter((directory) => existsSync(join(root, directory, "package.json")))
    .flatMap((directory) => {
      const manifest = readJsonObject(join(root, directory, "package.json"));
      if (manifest["private"] === true) {
        return [];
      }
      const name = requireString(manifest, "name", directory);
      const version = requireString(manifest, "version", directory);
      return [
        {
          directory,
          manifest,
          name,
          tarball: `${name.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`,
          version,
          workspaceDependencies: workspaceDependencies(manifest),
        },
      ];
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
};

export const sortForPublication = (packages: readonly PublicPackage[]): PublicPackage[] => {
  const remaining = new Map(packages.map((entry) => [entry.name, entry]));
  const published = new Set<string>();
  const sorted: PublicPackage[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((entry) => entry.workspaceDependencies.every((name) => published.has(name)))
      .toSorted((left, right) => left.name.localeCompare(right.name));
    if (ready.length === 0) {
      throw new Error(`Public package dependency cycle: ${[...remaining.keys()].join(", ")}`);
    }
    for (const entry of ready) {
      remaining.delete(entry.name);
      published.add(entry.name);
      sorted.push(entry);
    }
  }
  return sorted;
};

export const validatePackageContract = (root: string): string[] => {
  const rootManifest = readJsonObject(join(root, "package.json"));
  const rootVersion = requireString(rootManifest, "version", "package.json");
  const packages = loadPublicPackages(root);
  const publicNames = new Set(packages.map((entry) => entry.name));
  return packages.flatMap((entry) => {
    const expectedRepository = {
      type: "git",
      url: repositoryUrl,
      directory: entry.directory,
    };
    const errors: string[] = [];
    check(errors, entry.version === rootVersion, `${entry.name}: version must be ${rootVersion}`);
    check(
      errors,
      typeof entry.manifest["description"] === "string" && entry.manifest["description"].length > 0,
      `${entry.name}: description must not be empty`,
    );
    check(errors, entry.manifest["license"] === "MIT", `${entry.name}: license must be MIT`);
    check(
      errors,
      JSON.stringify(entry.manifest["repository"]) === JSON.stringify(expectedRepository),
      `${entry.name}: repository metadata is incorrect`,
    );
    check(errors, entry.manifest["homepage"] === homepage, `${entry.name}: homepage is incorrect`);
    check(
      errors,
      isRecord(entry.manifest["bugs"]) && entry.manifest["bugs"]["url"] === bugsUrl,
      `${entry.name}: bugs URL is incorrect`,
    );
    check(
      errors,
      Array.isArray(entry.manifest["keywords"]) && entry.manifest["keywords"].length > 0,
      `${entry.name}: keywords must not be empty`,
    );
    check(
      errors,
      JSON.stringify(entry.manifest["files"]) === JSON.stringify(["dist", "src"]),
      `${entry.name}: files must contain dist and src`,
    );
    check(errors, entry.manifest["type"] === "module", `${entry.name}: type must be module`);
    check(
      errors,
      isRecord(entry.manifest["exports"]) && Object.keys(entry.manifest["exports"]).length > 0,
      `${entry.name}: exports must not be empty`,
    );
    check(
      errors,
      isRecord(entry.manifest["publishConfig"]) &&
        entry.manifest["publishConfig"]["access"] === "public",
      `${entry.name}: publishConfig.access must be public`,
    );
    check(
      errors,
      isRecord(entry.manifest["engines"]) && entry.manifest["engines"]["node"] === ">=22.18.0",
      `${entry.name}: Node engine must be >=22.18.0`,
    );
    check(
      errors,
      existsSync(join(root, entry.directory, "README.md")),
      `${entry.name}: README.md is missing`,
    );
    for (const [dependency, range] of dependencyEntries(entry.manifest)) {
      check(
        errors,
        !range.startsWith("workspace:") || publicNames.has(dependency),
        `${entry.name}: workspace dependency ${dependency} is not a public package`,
      );
      check(
        errors,
        !publicNames.has(dependency) || range.startsWith("workspace:"),
        `${entry.name}: internal dependency ${dependency} must use the workspace protocol`,
      );
    }
    return errors;
  });
};

const workspaceDependencies = (manifest: Readonly<Record<string, unknown>>): string[] => {
  return dependencyEntries(manifest)
    .flatMap(([name, range]) => (range.startsWith("workspace:") ? [name] : []))
    .toSorted();
};

const dependencyEntries = (
  manifest: Readonly<Record<string, unknown>>,
): readonly (readonly [string, string])[] => {
  const fields = ["dependencies", "optionalDependencies", "peerDependencies"];
  return fields
    .flatMap((field) => {
      const dependencies = manifest[field];
      if (dependencies === undefined) {
        return [];
      }
      if (!isRecord(dependencies)) {
        throw new TypeError(`${String(manifest["name"])}: ${field} must be an object`);
      }
      return Object.entries(dependencies).map(([name, range]) => {
        if (typeof range !== "string") {
          throw new TypeError(`${String(manifest["name"])}: ${field}.${name} must be a string`);
        }
        return [name, range] as const;
      });
    })
    .toSorted(([left], [right]) => left.localeCompare(right));
};

const readJsonObject = (path: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(value)) {
    throw new TypeError(`${path} must contain a JSON object`);
  }
  return value;
};

const requireString = (
  value: Readonly<Record<string, unknown>>,
  field: string,
  source: string,
): string => {
  const entry = value[field];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`${source}: ${field} must be a nonempty string`);
  }
  return entry;
};

const check = (errors: string[], accepted: boolean, message: string): void => {
  if (!accepted) {
    errors.push(message);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const command = process.argv[2];
if (command === "manifest") {
  const packages = sortForPublication(loadPublicPackages(process.cwd())).map(
    ({ directory, name, tarball, version, workspaceDependencies: dependencies }) => ({
      directory,
      name,
      tarball,
      version,
      workspaceDependencies: dependencies,
    }),
  );
  process.stdout.write(`${JSON.stringify(packages, null, 2)}\n`);
} else if (command === "validate") {
  const errors = validatePackageContract(process.cwd());
  const tag = process.argv[3];
  const version = loadPublicPackages(process.cwd())[0]?.version;
  if (tag === undefined || version === undefined || tag !== `v${version}`) {
    errors.push(`Release tag ${String(tag)} does not match package version ${String(version)}`);
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  process.stdout.write(`Validated public packages at ${version}.\n`);
} else {
  throw new Error("Usage: node scripts/release-packages.ts <manifest|validate> [tag]");
}
