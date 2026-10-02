#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  runScruple,
  type DecisionAnswer,
  type DecisionCache,
  type DecisionRecord,
  type Diagnostic,
  type ScrupleConfig,
  type SourceFile,
} from "@scruple/core";
import { createJiti } from "jiti";
import { glob } from "tinyglobby";

import { createFileDecisionCache } from "#cache";

export { createFileDecisionCache, type FileDecisionCacheOptions } from "#cache";

const defaultPatterns = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];
const maxConcurrentFileReads = 32;
const defaultCacheDirectory = "node_modules/.cache/scruple";
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

export const runCli = async (argv: readonly string[] = process.argv.slice(2)): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      "cache-dir": { type: "string" },
      config: { type: "string", short: "c" },
      explain: { type: "boolean", default: false },
      format: { type: "string", short: "f", default: "stylish" },
      help: { type: "boolean", short: "h", default: false },
      "no-cache": { type: "boolean", default: false },
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
  if (values["no-cache"] && values["cache-dir"] !== undefined) {
    throw new Error("--cache-dir cannot be used with --no-cache");
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
  const files = await readSourceFiles(cwd, filenames);
  let cache: DecisionCache | false;
  if (values["no-cache"]) {
    cache = false;
  } else if (values["cache-dir"] === undefined && config.cache !== undefined) {
    cache = config.cache;
  } else {
    cache = createFileDecisionCache({
      directory: resolve(cwd, values["cache-dir"] ?? defaultCacheDirectory),
      onWarning(message, cause) {
        if (cause instanceof Error) {
          process.stderr.write(`scruple: ${message} ${cause.message}\n`);
        } else {
          process.stderr.write(`scruple: ${message}\n`);
        }
      },
    });
  }
  const cachesToClose = new Set<DecisionCache>();
  if (config.cache !== undefined && config.cache !== false) {
    cachesToClose.add(config.cache);
  }
  if (cache !== false) {
    cachesToClose.add(cache);
  }

  try {
    const result = await runScruple(config, files, undefined, {
      includeDecisions: values.explain,
      cache,
    });
    if (values.format === "json") {
      process.stdout.write(`${JSON.stringify(result, jsonErrorReplacer, 2)}\n`);
    } else {
      printStylish(result.diagnostics);
      if (values.explain) {
        printDecisions(result.decisions ?? []);
      }
      for (const error of result.errors) {
        process.stderr.write(
          `scruple: ${error.filename === undefined ? "" : `${error.filename}: `}${error.message}\n`,
        );
      }
    }

    if (result.errors.length > 0) {
      return 2;
    }
    return result.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? 1 : 0;
  } finally {
    await Promise.all([
      Promise.resolve().then(() => config.provider.close?.()),
      ...[...cachesToClose].map((configuredCache) =>
        Promise.resolve().then(() => configuredCache.close?.()),
      ),
    ]);
  }
};

const readSourceFiles = async (
  cwd: string,
  filenames: readonly string[],
): Promise<SourceFile[]> => {
  const entries = filenames.toSorted().entries();
  const files: SourceFile[] = [];
  const readNext = async (): Promise<void> => {
    const next = entries.next();
    if (next.done === true) {
      return;
    }
    const [index, filename] = next.value;
    files[index] = {
      filename,
      source: await readFile(resolve(cwd, filename), "utf8"),
    };
    await readNext();
  };
  const workers = Array.from({ length: Math.min(maxConcurrentFileReads, filenames.length) }, () =>
    readNext(),
  );
  await Promise.all(workers);
  return files;
};

const printDecisions = (decisions: DecisionRecord[]): void => {
  if (decisions.length === 0) {
    process.stdout.write("\nNo semantic candidates were evaluated.\n");
    return;
  }
  process.stdout.write("\nDecisions\n");
  for (const decision of decisions) {
    const position = `${decision.filename}:${decision.location.start.line}:${decision.location.start.column}`;
    const outcome = decision.diagnostic ? "diagnostic" : "accepted";
    process.stdout.write(
      `  ${position}  ${decision.ruleId}  ${answerSummary(decision.answer)}  ${outcome}  ${decision.model}\n`,
    );
  }
};

const answerSummary = (answer: DecisionAnswer): string => {
  if (answer.type === "choice") {
    return `choice=${answer.choice} confidence=${answer.confidence.toFixed(2)}`;
  }
  if (answer.type === "score") {
    return `score=${answer.score} confidence=${answer.confidence.toFixed(2)}`;
  }
  return `noul=${answer.noul.toFixed(2)}`;
};

const findConfig = (cwd: string, explicit: string | undefined): string => {
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
};

const loadConfig = async (path: string): Promise<ScrupleConfig> => {
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const config: unknown = await jiti.import(path, { default: true });
  if (!isScrupleConfig(config)) {
    throw new Error("Config must define parser, provider, plugins, and rules");
  }
  return config;
};

const isScrupleConfig = (value: unknown): value is ScrupleConfig => {
  if (!isRecord(value)) {
    return false;
  }
  const parser = value["parser"];
  const provider = value["provider"];
  const cache = value["cache"];
  const plugins = value["plugins"];
  return (
    isRecord(parser) &&
    typeof parser["parse"] === "function" &&
    typeof parser["supports"] === "function" &&
    isRecord(provider) &&
    typeof provider["evaluate"] === "function" &&
    (cache === undefined ||
      cache === false ||
      (isRecord(cache) &&
        typeof cache["get"] === "function" &&
        typeof cache["set"] === "function" &&
        (cache["close"] === undefined || typeof cache["close"] === "function"))) &&
    isRecord(plugins) &&
    Object.values(plugins).every((plugin) => isRecord(plugin) && isRecord(plugin["rules"])) &&
    isRecord(value["rules"])
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const printStylish = (diagnostics: Diagnostic[]): void => {
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
      `  ${position} ${severity} ${diagnostic.message}${probability}  ${diagnostic.ruleId}\n`,
    );
  }
};

const jsonErrorReplacer = (key: string, value: unknown): unknown => {
  if (key === "cause" && value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  return value;
};

const usage = (): string => {
  return `Scruple — semantic rules for code

Usage:
  scruple [patterns...] [options]

Options:
      --cache-dir <path> Decision cache directory (default: node_modules/.cache/scruple)
  -c, --config <path>   Config file (default: scruple.config.ts)
      --explain         Include final candidate decisions, not collection classifications
  -f, --format <format> stylish or json (default: stylish)
  -h, --help            Show this help
      --no-cache        Disable the decision cache

Exit codes:
  0  No error-severity findings
  1  At least one error-severity finding
  2  Configuration, parsing, or provider failure
`;
};
