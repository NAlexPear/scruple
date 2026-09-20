import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createFileDecisionCache } from "@scruple/cli";
import type { DecisionRequest, DecisionResponse } from "@scruple/core";

const response: DecisionResponse = {
  model: "fixture-model",
  answers: {
    result: {
      type: "choice",
      choice: "safe",
      confidence: 0.9,
      probabilities: { safe: 0.9, finding: 0.1 },
    },
  },
  usage: { inputTokens: 12, outputTokens: 3 },
};

const request = (state: Record<string, string>): DecisionRequest => ({
  state,
  questions: {
    result: {
      type: "choice",
      instructions: "Classify this evidence.",
      criteria: { finding: "Finding.", safe: "Safe." },
    },
  },
});

await test("file decision cache uses canonical provider requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scruple-cache-"));
  try {
    const cache = createFileDecisionCache({ directory });
    const ordered = request({ alpha: "one", beta: "two" });
    const reordered = request({ beta: "two", alpha: "one" });

    await cache.set("fixture", ordered, response);

    assert.deepEqual(await cache.get("fixture", reordered), response);
    assert.equal(await cache.get("other-provider", reordered), undefined);
    assert.equal(await cache.get("fixture", request({ alpha: "changed" })), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("file decision cache removes invalid entries and reports one warning", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scruple-cache-"));
  const warnings: string[] = [];
  try {
    const cache = createFileDecisionCache({
      directory,
      onWarning(message) {
        warnings.push(message);
      },
    });
    const cacheRequest = request({ source: "const value = load();" });
    await cache.set("fixture", cacheRequest, response);
    const [filename = assert.fail("Expected a cache entry")] = await readdir(directory);
    await writeFile(join(directory, filename), "not valid json", "utf8");

    assert.equal(await cache.get("fixture", cacheRequest), undefined);
    assert.deepEqual(await readdir(directory), []);
    assert.deepEqual(warnings, ["Ignored an invalid Scruple decision cache entry."]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("file decision cache failures do not block provider work", async () => {
  const parent = await mkdtemp(join(tmpdir(), "scruple-cache-"));
  const directory = join(parent, "not-a-directory");
  const warnings: string[] = [];
  try {
    await writeFile(directory, "occupied", "utf8");
    const cache = createFileDecisionCache({
      directory,
      onWarning(message) {
        warnings.push(message);
      },
    });
    const cacheRequest = request({ source: "const value = load();" });

    assert.equal(await cache.get("fixture", cacheRequest), undefined);
    await cache.set("fixture", cacheRequest, response);

    assert.deepEqual(warnings, [
      "Could not read the Scruple decision cache; continuing without it.",
      "Could not write the Scruple decision cache; continuing without it.",
    ]);
    assert.equal(await readFile(directory, "utf8"), "occupied");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
