#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { runScruple, type Diagnostic, type ScrupleConfig } from "@scruple/core";
import { createJiti } from "jiti";
import { glob } from "tinyglobby";

const defaultPatterns = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];
const defaultIgnore = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.git/**",
];
const configNames = [
  "scruple.config.ts",
  "scruple.config.mts",
  "scruple.config.js",
  "scruple.config.mjs",
];

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c" },
      format: { type: "string", short: "f", default: "stylish" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(usage());
    return 0;
  }

  const command = positionals[0] === "check" ? positionals.shift() : "check";
  if (command !== "check") {
    throw new Error(`Unknown command: ${command}`);
  }
  if (values.format !== "stylish" && values.format !== "json") {
    throw new Error(`Unknown output format: ${values.format}`);
  }

  const cwd = process.cwd();
  const configPath = findConfig(cwd, values.config);
  const config = await loadConfig(configPath);
  const patterns = positionals.length > 0 ? positionals : (config.include ?? defaultPatterns);
  const filenames = await glob(patterns, {
    cwd,
    ignore: [...defaultIgnore, ...(config.ignore ?? [])],
    onlyFiles: true,
  });
  const files = await Promise.all(
    filenames.toSorted().map(async (filename) => ({
      filename,
      source: await readFile(resolve(cwd, filename), "utf8"),
    })),
  );

  try {
    const result = await runScruple(config, files);
    if (values.format === "json") {
      process.stdout.write(`${JSON.stringify(result, jsonErrorReplacer, 2)}\n`);
    } else {
      printStylish(result.diagnostics);
      for (const error of result.errors) {
        process.stderr.write(
          `scruple: ${error.filename === undefined ? "" : `${error.filename}: `}${error.message}\n`,
        );
      }
      process.stdout.write(
        `\n${result.diagnostics.length} finding(s), ${result.errors.length} operational error(s), ` +
          `${result.stats.candidates} candidate(s), ${result.stats.requests} decision request(s)\n`,
      );
    }

    if (result.errors.length > 0) {
      return 2;
    }
    return result.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? 1 : 0;
  } finally {
    await config.provider.close?.();
  }
}

function findConfig(cwd: string, explicit: string | undefined): string {
  if (explicit !== undefined) {
    const path = resolve(cwd, explicit);
    if (!existsSync(path)) {
      throw new Error(`Config file not found: ${explicit}`);
    }
    return path;
  }

  for (const name of configNames) {
    const path = resolve(cwd, name);
    if (existsSync(path)) {
      return path;
    }
  }
  throw new Error(`No Scruple config found. Expected one of: ${configNames.join(", ")}`);
}

async function loadConfig(path: string): Promise<ScrupleConfig> {
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const config: unknown = await jiti.import(path, { default: true });
  if (!isScrupleConfig(config)) {
    throw new Error("Config must define parser, provider, and plugins");
  }
  return config;
}

function isScrupleConfig(value: unknown): value is ScrupleConfig {
  if (!isRecord(value)) {
    return false;
  }
  const parser = value["parser"];
  const provider = value["provider"];
  return (
    isRecord(parser) &&
    typeof parser["parse"] === "function" &&
    typeof parser["supports"] === "function" &&
    isRecord(provider) &&
    typeof provider["evaluate"] === "function" &&
    Array.isArray(value["plugins"])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function printStylish(diagnostics: Diagnostic[]): void {
  let currentFile = "";
  for (const diagnostic of diagnostics) {
    if (diagnostic.filename !== currentFile) {
      currentFile = diagnostic.filename;
      process.stdout.write(`\n${currentFile}\n`);
    }
    const position = `${diagnostic.location.start.line}:${diagnostic.location.start.column}`.padEnd(
      9,
    );
    const severity = diagnostic.severity.padEnd(7);
    const probability =
      diagnostic.probability === undefined ? "" : ` (${Math.round(diagnostic.probability * 100)}%)`;
    process.stdout.write(
      `  ${position} ${severity} ${diagnostic.message}${probability}  ${diagnostic.pluginId}\n`,
    );
  }
}

function jsonErrorReplacer(key: string, value: unknown): unknown {
  if (key === "cause" && value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  return value;
}

function usage(): string {
  return `Scruple — semantic rules for code

Usage:
  scruple check [patterns...] [options]

Options:
  -c, --config <path>   Config file (default: scruple.config.ts)
  -f, --format <format> stylish or json (default: stylish)
  -h, --help            Show this help

Exit codes:
  0  No error-severity findings
  1  At least one error-severity finding
  2  Configuration, parsing, or provider failure
`;
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    process.stderr.write(`scruple: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
