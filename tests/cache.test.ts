import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createFileDecisionCache } from "@scruple/cli";
import type { DecisionCache, DecisionRequest, DecisionResponse, JsonValue } from "@scruple/core";
import * as fc from "fast-check";

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
const defaultCriteria = { finding: "Finding.", safe: "Safe." };

const request = (
  state: JsonValue,
  instructions: JsonValue = "Classify this evidence.",
  criteria: Record<string, JsonValue> = defaultCriteria,
): DecisionRequest => ({
  state,
  questions: {
    result: {
      type: "choice",
      instructions,
      criteria,
    },
  },
});

const reverseObjectKeys = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((entry) => reverseObjectKeys(entry));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toReversed()
        .map(([key, entry]) => [key, reverseObjectKeys(entry)]),
    );
  }
  return value;
};

const assertMalformedResponses = async (
  cache: DecisionCache,
  directory: string,
  cacheRequest: DecisionRequest,
  invalidResponses: readonly unknown[],
  index = 0,
): Promise<void> => {
  const invalidResponse = invalidResponses[index];
  if (invalidResponse === undefined) {
    return;
  }
  await cache.set("fixture", cacheRequest, response);
  const [filename = assert.fail("Expected a cache entry")] = await readdir(directory);
  await writeFile(
    join(directory, filename),
    JSON.stringify({ schemaVersion: 1, response: invalidResponse }),
    "utf8",
  );
  assert.equal(await cache.get("fixture", cacheRequest), undefined);
  await assertMalformedResponses(cache, directory, cacheRequest, invalidResponses, index + 1);
};

const withSchemaVersion = (contents: string, schemaVersion: number): string => {
  const entry: unknown = JSON.parse(contents);
  if (!isRecord(entry)) {
    throw new TypeError("Expected a cache entry object");
  }
  entry["schemaVersion"] = schemaVersion;
  return JSON.stringify(entry);
};

const parseJsonValue = (contents: string): JsonValue => {
  const value: unknown = JSON.parse(contents);
  if (!isJsonValue(value)) {
    throw new TypeError("Expected a JSON value");
  }
  return value;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }
  return isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    assert.equal(
      await cache.get("fixture", request({ alpha: "one", beta: "two" }, "Changed question.")),
      undefined,
    );
    assert.equal(
      await cache.get(
        "fixture",
        request({ alpha: "one", beta: "two" }, "Classify this evidence.", {
          finding: "Changed finding.",
          safe: "Safe.",
        }),
      ),
      undefined,
    );
    assert.equal(await cache.get("fixture", request(["one", "two"])), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("file decision cache canonicalizes nested JSON object keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scruple-cache-"));
  try {
    const cache = createFileDecisionCache({ directory });
    await fc.assert(
      fc.asyncProperty(fc.json(), async (serializedState) => {
        const state = parseJsonValue(serializedState);
        const cacheRequest = request(state);
        await cache.set("fixture", cacheRequest, response);
        assert.deepEqual(await cache.get("fixture", request(reverseObjectKeys(state))), response);
      }),
      { numRuns: 40 },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("file decision cache keeps array order significant and source out of stored files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scruple-cache-"));
  try {
    const cache = createFileDecisionCache({ directory });
    const evidence = "private source evidence";
    await cache.set("fixture", request([evidence, "second"]), response);
    const [filename = assert.fail("Expected a cache entry")] = await readdir(directory);
    const contents = await readFile(join(directory, filename), "utf8");

    assert.equal(await cache.get("fixture", request(["second", evidence])), undefined);
    assert.doesNotMatch(filename, /private|source|evidence/u);
    assert.doesNotMatch(contents, /private source evidence/u);
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

    await cache.set("fixture", cacheRequest, response);
    const [versionedFilename = assert.fail("Expected a cache entry")] = await readdir(directory);
    const versionedPath = join(directory, versionedFilename);
    const versionedEntry = withSchemaVersion(await readFile(versionedPath, "utf8"), 999);
    await writeFile(versionedPath, versionedEntry, "utf8");

    assert.equal(await cache.get("fixture", cacheRequest), undefined);
    assert.deepEqual(await readdir(directory), []);
    assert.deepEqual(warnings, ["Ignored an invalid Scruple decision cache entry."]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("file decision cache rejects malformed response fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scruple-cache-"));
  try {
    const cache = createFileDecisionCache({ directory });
    const cacheRequest = request({ source: "const value = load();" });
    const invalidResponses: unknown[] = [
      { ...response, model: 7 },
      { ...response, usage: { inputTokens: -1, outputTokens: 3 } },
      {
        ...response,
        answers: {
          result: {
            type: "choice",
            choice: "safe",
            confidence: 1.5,
            probabilities: { safe: 0.9, finding: 0.1 },
          },
        },
      },
    ];

    await assertMalformedResponses(cache, directory, cacheRequest, invalidResponses);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("concurrent cache writes leave one complete response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scruple-cache-"));
  try {
    const cache = createFileDecisionCache({ directory });
    const cacheRequest = request({ source: "const value = load();" });
    const responses = Array.from({ length: 20 }, (_, index): DecisionResponse => ({
      ...response,
      model: `fixture-model-${index + 1}`,
    }));

    await Promise.all(responses.map((entry) => cache.set("fixture", cacheRequest, entry)));

    const files = await readdir(directory);
    assert.equal(files.length, 1);
    const stored = await cache.get("fixture", cacheRequest);
    assert.ok(stored);
    assert.equal(
      responses.some((entry) => entry.model === stored.model),
      true,
    );
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
