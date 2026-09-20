import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { runCli } from "@scruple/cli";

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
