import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  DecisionAnswer,
  DecisionCache,
  DecisionRequest,
  DecisionResponse,
  JsonValue,
} from "@scruple/core";

export interface FileDecisionCacheOptions {
  directory: string;
  onWarning?: (message: string, cause: unknown) => void;
}

const cacheSchemaVersion = 1;

export const createFileDecisionCache = (options: FileDecisionCacheOptions): DecisionCache => {
  const warned = new Set<string>();
  const warnOnce = (message: string, cause: unknown): void => {
    if (!warned.has(message)) {
      warned.add(message);
      options.onWarning?.(message, cause);
    }
  };
  const pathFor = (providerId: string, request: DecisionRequest): string => {
    const key = stableJson({ cacheSchemaVersion, providerId, request });
    const digest = createHash("sha256").update(key).digest("hex");
    return join(options.directory, `${digest}.json`);
  };

  return {
    async get(providerId, request) {
      const path = pathFor(providerId, request);
      let contents: string | undefined;
      try {
        contents = await readFile(path, "utf8");
      } catch (cause) {
        if (!isNodeError(cause) || cause.code !== "ENOENT") {
          warnOnce("Could not read the Scruple decision cache; continuing without it.", cause);
        }
      }

      let response: DecisionResponse | undefined;
      if (contents !== undefined) {
        try {
          response = parseCacheEntry(JSON.parse(contents) as unknown);
          if (response === undefined) {
            throw new TypeError("Cached response is invalid");
          }
        } catch (cause) {
          warnOnce("Ignored an invalid Scruple decision cache entry.", cause);
          await unlink(path).catch(() => null);
        }
      }
      return response;
    },

    async set(providerId, request, response) {
      const path = pathFor(providerId, request);
      const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
      // scruple-disable errors/no-swallowed-errors -- Cache failures are reported as warnings so analysis can continue.
      try {
        await mkdir(options.directory, { recursive: true });
        await writeFile(
          temporaryPath,
          JSON.stringify({ schemaVersion: cacheSchemaVersion, response }),
          "utf8",
        );
        await rename(temporaryPath, path);
      } catch (cause) {
        warnOnce("Could not write the Scruple decision cache; continuing without it.", cause);
      } finally {
        await unlink(temporaryPath).catch(() => null);
      }
      // scruple-enable errors/no-swallowed-errors
    },
  };
};

const parseCacheEntry = (value: unknown): DecisionResponse | undefined => {
  let response: DecisionResponse | undefined;
  if (
    isRecord(value) &&
    value["schemaVersion"] === cacheSchemaVersion &&
    isDecisionResponse(value["response"])
  ) {
    response = value["response"];
  }
  return response;
};

const isDecisionResponse = (value: unknown): value is DecisionResponse => {
  if (
    !isRecord(value) ||
    typeof value["model"] !== "string" ||
    value["model"].length === 0 ||
    !isRecord(value["answers"]) ||
    !Object.values(value["answers"]).every((answer) => isDecisionAnswer(answer))
  ) {
    return false;
  }
  const usage = value["usage"];
  return (
    usage === undefined ||
    (isRecord(usage) && isTokenCount(usage["inputTokens"]) && isTokenCount(usage["outputTokens"]))
  );
};

const isDecisionAnswer = (value: unknown): value is DecisionAnswer => {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return false;
  }
  if (value["type"] === "noul") {
    return isProbability(value["noul"]);
  }
  if (value["type"] === "choice") {
    return (
      typeof value["choice"] === "string" &&
      value["choice"].length > 0 &&
      isProbability(value["confidence"]) &&
      isProbabilityRecord(value["probabilities"])
    );
  }
  return (
    value["type"] === "score" &&
    typeof value["score"] === "number" &&
    Number.isFinite(value["score"]) &&
    isProbability(value["confidence"]) &&
    isProbabilityRecord(value["probabilities"]) &&
    isRecord(value["legend"]) &&
    Object.values(value["legend"]).every((entry) => isJsonValue(entry))
  );
};

const isProbabilityRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every((entry) => isProbability(entry));

const isProbability = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const isTokenCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

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

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .toSorted(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Decision cache keys must contain only JSON values");
  }
  return serialized;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNodeError = (value: unknown): value is NodeJS.ErrnoException => value instanceof Error;
