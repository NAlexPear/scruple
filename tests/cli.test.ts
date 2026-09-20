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
