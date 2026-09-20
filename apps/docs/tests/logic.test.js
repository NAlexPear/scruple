import assert from "node:assert/strict";
import test from "node:test";

import { filterRules, setupContent } from "../logic.js";

test("rule filtering combines category and case-insensitive text search", () => {
  assert.deepEqual(
    filterRules("VACUOUS", "tests").map((rule) => rule.id),
    ["tests/no-vacuous-tests"],
  );
  assert.equal(filterRules("comment", "database").length, 0);
});

test("Jev setup requires an explicitly supplied API key", () => {
  const config = setupContent("configure", "jev").code;
  assert.match(config, /const apiKey = process\.env\["TYPESAFE_API_KEY"\]/u);
  assert.match(config, /jevProvider\(\{ apiKey \}\)/u);
  assert.match(config, /plugins: \{ comments: comments\(\) \}/u);
  assert.match(config, /rules: \{/u);
});

test("Laya setup uses the local provider package and omits the hosted key", () => {
  const install = setupContent("install", "laya").code;
  const config = setupContent("configure", "laya").code;
  assert.match(install, /@scruple\/provider-laya/u);
  assert.match(config, /layaProvider/u);
  assert.doesNotMatch(config, /TYPESAFE_API_KEY/u);
});

test("install setup uses the scoped CLI package while preserving the scruple command", () => {
  const install = setupContent("install", "jev").code;
  const run = setupContent("run", "jev").code;
  assert.match(install, /@scruple\/cli/u);
  assert.doesNotMatch(install, /(?:^|\s)scruple(?:\s|$)/u);
  assert.match(run, /pnpm exec scruple check/u);
});
