import type {
  CallCapture,
  ChoiceAnswer,
  CodeTarget,
  DecisionAnswer,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface CacheRuleOptions {
  threshold?: number;
  minConfidence?: number;
  additionalReadPatterns?: RegExp[];
  additionalWritePatterns?: RegExp[];
  additionalInvalidationPatterns?: RegExp[];
  additionalAmbiguousPatterns?: RegExp[];
}

export type CachesPlugin = ScruplePlugin<{
  "no-unsafe-cache-key": RuleFactory<CacheRuleOptions>;
  "require-cache-invalidation": RuleFactory<CacheRuleOptions>;
  "no-sensitive-cache-data": RuleFactory<CacheRuleOptions>;
}>;

type CacheOperationKind = "read" | "write" | "invalidate" | "ambiguous";

interface CacheOperation {
  call: CallCapture;
  kind: CacheOperationKind;
}

interface RuleDefinition {
  description: string;
  finding: string;
  message: string;
  kinds: readonly CacheOperationKind[];
  instructions: string;
  criteria: Record<string, JsonValue>;
  defaultThreshold: number;
  defaultMinConfidence: number;
}

const defaultReadPatterns = [/(?:^|\.)(?:get|mget|hget|hgetall|fetch)$/iu];
const defaultWritePatterns = [/(?:^|\.)(?:set|mset|hset|setex|psetex|put|add|write)$/iu];
const defaultInvalidationPatterns = [
  /(?:^|\.)(?:del|delete|unlink|evict|invalidate|clear|purge)$/iu,
];
const defaultAmbiguousPatterns = [/(?:^|\.)(?:wrap|remember|memoize|getOrSet|getOrCreate)$/iu];
const cacheOwnerPattern = /(?:^|[_-])(?:cache|redis|memcache|keyv|kv)(?:$|[_-])/iu;

export const caches = (): CachesPlugin => {
  return definePlugin({
    rules: {
      "no-unsafe-cache-key": noUnsafeCacheKey,
      "require-cache-invalidation": requireCacheInvalidation,
      "no-sensitive-cache-data": noSensitiveCacheData,
    },
  });
};

const noUnsafeCacheKey = (options: CacheRuleOptions = {}): SemanticRule => {
  return cacheRule(options, {
    description:
      "Cache keys should preserve every visible tenant and principal isolation boundary.",
    finding: "unsafe_cross_scope_key",
    message: "This cache key appears to omit a visible tenant or user isolation boundary.",
    kinds: ["read", "write", "invalidate", "ambiguous"],
    instructions:
      "Does the selected cache operation use a key that can cross a tenant, account, organization, workspace, or user boundary visible in this function? Diagnose only when the function visibly handles scope-specific data and the key visibly omits that required identity. A stable namespace plus the relevant raw or hashed identity is isolated; hashing does not repair an omitted identity. Treat opaque key builders, cache wrappers, globally shared data, and boundaries known only from deployment or other files as insufficient context.",
    criteria: {
      unsafe_cross_scope_key:
        "The selected operation's visible key omits a tenant or principal identity that the function visibly requires, allowing distinct scopes to address the same entry.",
      isolated_key:
        "The visible key includes every relevant scope identity (directly or through a visible hash) and an appropriate namespace, or the data is visibly global rather than scope-specific.",
      insufficient_context:
        "An opaque helper, wrapper, external policy, or missing data contract prevents determining the key or required isolation boundary.",
    },
    defaultThreshold: 0.85,
    defaultMinConfidence: 0.7,
  });
};

const requireCacheInvalidation = (options: CacheRuleOptions = {}): SemanticRule => {
  return cacheRule(options, {
    description: "Mutable cached data should have a visible bounded-freshness strategy.",
    finding: "missing_visible_invalidation",
    message:
      "This non-expiring cache write appears to lack a visible invalidation or versioning strategy.",
    kinds: ["write", "ambiguous"],
    instructions:
      "Does the selected cache write visibly store mutable data without any bounded-freshness strategy? Accept an explicit finite TTL, a versioned key tied to data changes, a visible delete/invalidate operation, or a visible event/external invalidation handoff. Diagnose only a direct write whose arguments visibly have no expiry or use an explicitly non-expiring TTL and whose function shows no other strategy. Do not infer that an opaque wrapper, framework default, helper, or deployment process does or does not invalidate entries; use insufficient context.",
    criteria: {
      missing_visible_invalidation:
        "A direct cache write visibly stores mutable data indefinitely, and no TTL, key version, invalidation call, or external invalidation handoff is visible in the function.",
      bounded_freshness:
        "The function visibly supplies a finite TTL, versioned key, explicit invalidation, or external invalidation handoff, or the value is visibly immutable.",
      insufficient_context:
        "A wrapper, helper, framework default, external policy, or unclear mutability prevents establishing the entry's freshness behavior.",
    },
    defaultThreshold: 0.9,
    defaultMinConfidence: 0.7,
  });
};

const noSensitiveCacheData = (options: CacheRuleOptions = {}): SemanticRule => {
  return cacheRule(options, {
    description: "Sensitive values should not be passed to caches in plaintext.",
    finding: "plaintext_sensitive_data",
    message: "This cache write appears to store sensitive data without visible protection.",
    kinds: ["write", "ambiguous"],
    instructions:
      "Does the selected cache write visibly pass plaintext secrets, credentials, authentication tokens, private keys, financial account data, government identifiers, or similarly sensitive personal data as its value? Visible encryption or irreversible redaction of the value is protected. Hashing or namespacing only the key does not protect the cached value. Diagnose only explicit sensitive fields or values passed to a direct write; do not assume what opaque objects, serializers, wrappers, transport, or deployment encryption contain or provide.",
    criteria: {
      plaintext_sensitive_data:
        "The selected direct write visibly includes sensitive data in its cached value without visible encryption or irreversible redaction.",
      protected_or_nonsensitive:
        "The cached value is visibly encrypted/redacted before the write or is visibly non-sensitive.",
      insufficient_context:
        "An opaque value, serializer, wrapper, or external encryption policy prevents determining whether sensitive plaintext enters the cache.",
    },
    defaultThreshold: 0.95,
    defaultMinConfidence: 0.75,
  });
};

const cacheRule = (options: CacheRuleOptions, definition: RuleDefinition): SemanticRule => {
  const threshold = options.threshold ?? definition.defaultThreshold;
  const minConfidence = options.minConfidence ?? definition.defaultMinConfidence;
  const selectedKinds = new Set(definition.kinds);

  return {
    description: definition.description,
    collect(document) {
      return document.functions.flatMap((fn) => {
        const operations = collectCacheOperations(fn, options);
        return operations
          .filter((operation) => selectedKinds.has(operation.kind))
          .map((operation) => operationCandidate(operation, operations, fn, document, definition));
      });
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, threshold, minConfidence)) {
        return null;
      }
      return {
        message: definition.message,
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability: answer.probabilities[definition.finding] ?? 0,
        confidence: answer.confidence,
      };
    },
  };
};

const collectCacheOperations = (
  fn: FunctionTarget,
  options: CacheRuleOptions,
): CacheOperation[] => {
  const configured = [
    ["read", options.additionalReadPatterns] as const,
    ["write", options.additionalWritePatterns] as const,
    ["invalidate", options.additionalInvalidationPatterns] as const,
    ["ambiguous", options.additionalAmbiguousPatterns] as const,
  ];
  return fn.calls
    .flatMap((call): CacheOperation[] => {
      for (const [kind, patterns] of configured) {
        if (patterns !== undefined && matchesAny(call.callee, patterns)) {
          return [{ call, kind }];
        }
      }
      if (!hasCacheOwner(call.callee)) {
        return [];
      }
      const defaults = [
        ["read", defaultReadPatterns] as const,
        ["write", defaultWritePatterns] as const,
        ["invalidate", defaultInvalidationPatterns] as const,
        ["ambiguous", defaultAmbiguousPatterns] as const,
      ];
      for (const [kind, patterns] of defaults) {
        if (matchesAny(call.callee, patterns)) {
          return [{ call, kind }];
        }
      }
      return [];
    })
    .toSorted(
      (left, right) =>
        left.call.range.start - right.call.range.start ||
        left.call.callee.localeCompare(right.call.callee),
    );
};

const operationCandidate = (
  selected: CacheOperation,
  operations: readonly CacheOperation[],
  fn: FunctionTarget,
  document: ParsedDocument,
  definition: RuleDefinition,
): RuleCandidate => {
  return {
    target: expressionTarget(selected.call, fn, document),
    state: {
      language: document.language,
      imports: document.imports,
      function: fn.source,
      selected_cache_operation: operationState(selected),
      cache_operations: operations.map((operation) => operationState(operation)),
    },
    data: { operationKind: selected.kind, callee: selected.call.callee },
    question: {
      type: "choice",
      instructions: definition.instructions,
      criteria: definition.criteria,
    },
  };
};

const operationState = (operation: CacheOperation): JsonValue => {
  return {
    kind: operation.kind,
    callee: operation.call.callee,
    source: operation.call.source,
  };
};

const expressionTarget = (
  call: CallCapture,
  fn: FunctionTarget,
  document: ParsedDocument,
): CodeTarget => {
  return {
    kind: "expression",
    filename: document.filename,
    language: document.language,
    range: call.range,
    location: locate(document.source, call.range.start, call.range.end),
    source: call.source,
    enclosingSource: fn.source,
  };
};

const locate = (source: string, start: number, end: number) => {
  return { start: positionAt(source, start), end: positionAt(source, end) };
};

const positionAt = (source: string, offset: number): { line: number; column: number } => {
  const before = source.slice(0, offset);
  const lastNewline = before.lastIndexOf("\n");
  return {
    line: before.split("\n").length,
    column: offset - lastNewline,
  };
};

const hasCacheOwner = (callee: string): boolean => {
  const owner = callee.slice(0, Math.max(0, callee.lastIndexOf(".")));
  return owner.split(".").some((segment) => {
    cacheOwnerPattern.lastIndex = 0;
    return cacheOwnerPattern.test(splitCamelCase(segment));
  });
};

const splitCamelCase = (value: string): string => {
  return value.replaceAll(/([a-z0-9])([A-Z])/gu, "$1_$2");
};

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};

const isFinding = (
  answer: DecisionAnswer,
  finding: string,
  threshold: number,
  minConfidence: number,
): answer is ChoiceAnswer => {
  return (
    answer.type === "choice" &&
    answer.choice === finding &&
    (answer.probabilities[finding] ?? 0) >= threshold &&
    answer.confidence >= minConfidence
  );
};
