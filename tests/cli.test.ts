import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

await test("CLI documents auditable decision output", () => {
  const output = execFileSync(process.execPath, ["packages/cli/dist/bin.js", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(output, /--explain\s+Include every provider decision/u);
  assert.match(output, /--format <format> stylish or json/u);
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
