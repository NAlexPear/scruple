# Caches

`@scruple/caches` provides provider-backed semantic checks for application cache safety and correctness.

```sh
pnpm add -D @scruple/caches
```

```ts
import { defineConfig } from "@scruple/core";
import { caches } from "@scruple/caches";

export default defineConfig({
  parser,
  provider,
  plugins: { caches: caches() },
  rules: { "caches/no-unsafe-cache-key": "warn" },
});
```

| Rule                                                                     | Checks                                    |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| [`caches/no-unsafe-cache-key`](#cachesno-unsafe-cache-key)               | Keys missing a visible isolation identity |
| [`caches/require-cache-invalidation`](#cachesrequire-cache-invalidation) | Mutable entries without bounded freshness |
| [`caches/no-sensitive-cache-data`](#cachesno-sensitive-cache-data)       | Sensitive plaintext cache values          |

All rules accept `threshold`, `minConfidence`, and arrays `additionalReadPatterns`, `additionalWritePatterns`, `additionalInvalidationPatterns`, and `additionalAmbiguousPatterns`. Additional patterns are checked before built-in cache-owner detection; each defaults to absent.

## `caches/no-unsafe-cache-key`

Reviews detected reads, writes, invalidations, and wrapper operations. It reports when a function visibly handles tenant- or principal-scoped data but its key omits that identity. Defaults: `threshold: 0.85`, `minConfidence: 0.7`.

## `caches/require-cache-invalidation`

Reviews writes and ambiguous wrappers for mutable values stored indefinitely without a visible finite TTL, versioned key, invalidation operation, or invalidation handoff. Opaque defaults and wrappers cause abstention. Defaults: `threshold: 0.9`, `minConfidence: 0.7`.

## `caches/no-sensitive-cache-data`

Reviews writes and ambiguous wrappers for visibly sensitive plaintext values. Visible encryption or irreversible redaction is accepted; key hashing does not protect a value. Defaults: `threshold: 0.95`, `minConfidence: 0.75`.

```ts
rules: {
  "caches/no-unsafe-cache-key": ["warn", { additionalReadPatterns: [/^store\.load$/u] }],
}
```
