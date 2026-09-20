import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "@scruple/cli";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const runCacheFixture = (
  directory: string,
  callsPath: string,
  options: readonly string[] = [],
): { requests: number; cacheHits: number } => {
  const output = execFileSync(
    process.execPath,
    [join(process.cwd(), "packages/cli/dist/bin.js"), "source.ts", "--format", "json", ...options],
    {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, SCRUPLE_TEST_CALLS: callsPath },
    },
  );
  const result: unknown = JSON.parse(output);
  if (!isRecord(result) || !isRecord(result["stats"])) {
    throw new TypeError("CLI fixture returned invalid statistics");
  }
  const requests = result["stats"]["requests"];
  const cacheHits = result["stats"]["cacheHits"];
  if (typeof requests !== "number" || typeof cacheHits !== "number") {
    throw new TypeError("CLI fixture statistics must contain request and cache hit counts");
  }
  return { requests, cacheHits };
};

await test("CLI documents auditable decision output", () => {
  const output = execFileSync(process.execPath, ["packages/cli/dist/bin.js", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(
    output,
    /--explain\s+Include final candidate decisions, not collection classifications/u,
  );
  assert.match(output, /--format <format> stylish or json/u);
  assert.match(output, /--cache-dir <path> Decision cache directory/u);
  assert.match(output, /--no-cache\s+Disable the decision cache/u);
});

await test("CLI rejects conflicting cache options", async () => {
  await assert.rejects(
    runCli(["--no-cache", "--cache-dir", ".scruple-cache"]),
    /--cache-dir cannot be used with --no-cache/u,
  );
});

await test("CLI persists its default cache across processes and honors cache switches", async () => {
  const directory = await mkdtemp(join(process.cwd(), "node_modules/.cache/scruple-cli-test-"));
  const callsPath = join(directory, "provider-calls.txt");
  const customCache = join(directory, "custom-cache");
  try {
    await writeFile(
      join(directory, "scruple.config.mjs"),
      `import { appendFile } from "node:fs/promises";
import { oxcParser } from "@scruple/parser-oxc";

const callsPath = process.env["SCRUPLE_TEST_CALLS"];
if (callsPath === undefined) throw new Error("SCRUPLE_TEST_CALLS is required");

const provider = {
  id: "cli-cache-fixture",
  async evaluate(request) {
    await appendFile(callsPath, "provider call\\n", "utf8");
    return {
      model: "cli-cache-model",
      answers: Object.fromEntries(
        Object.keys(request.questions).map((id) => [id, { type: "noul", noul: 0.1 }]),
      ),
      usage: { inputTokens: 5, outputTokens: 1 },
    };
  },
};

const plugin = {
  rules: {
    check: () => ({
      description: "Exercise the CLI cache.",
      collect(document) {
        const target = document.functions[0];
        return target === undefined
          ? []
          : [{
              target,
              state: { source: target.source },
              question: { type: "noul", instructions: "Is this fixture unsafe?" },
            }];
      },
      diagnose: () => null,
    }),
  },
};

export default {
  parser: oxcParser(),
  provider,
  plugins: { fixture: plugin },
  rules: { "fixture/check": "warn" },
};
`,
      "utf8",
    );
    await writeFile(join(directory, "source.ts"), "function fixture() { return true; }\n", "utf8");

    const first = runCacheFixture(directory, callsPath);
    const second = runCacheFixture(directory, callsPath);
    const uncached = runCacheFixture(directory, callsPath, ["--no-cache"]);
    const customFirst = runCacheFixture(directory, callsPath, ["--cache-dir", customCache]);
    const customSecond = runCacheFixture(directory, callsPath, ["--cache-dir", customCache]);

    assert.deepEqual(first, { requests: 1, cacheHits: 0 });
    assert.deepEqual(second, { requests: 0, cacheHits: 1 });
    assert.deepEqual(uncached, { requests: 1, cacheHits: 0 });
    assert.deepEqual(customFirst, { requests: 1, cacheHits: 0 });
    assert.deepEqual(customSecond, { requests: 0, cacheHits: 1 });
    assert.equal((await readFile(callsPath, "utf8")).trim().split("\n").length, 3);
    assert.equal((await readdir(join(directory, "node_modules/.cache/scruple"))).length, 1);
    assert.equal((await readdir(customCache)).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("CodeQL benchmark help does not require the CodeQL executable", () => {
  const output = execFileSync(
    process.execPath,
    [
      "packages/eval/dist/codeql-benchmark-cli.js",
      "--codeql",
      "definitely-not-installed",
      "--help",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.match(output, /Benchmark CodeQL against Scruple's pinned workload/u);
  assert.match(output, /--codeql <path>\s+CodeQL executable/u);
});
