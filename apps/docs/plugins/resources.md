# Resources

`@scruple/resources` provides provider-backed semantic checks for resource ownership, cleanup, and retries.

```sh
pnpm add -D @scruple/resources
```

```ts
import { defineConfig } from "@scruple/core";
import { resources } from "@scruple/resources";

export default defineConfig({
  parser,
  provider,
  plugins: { resources: resources() },
  rules: { "resources/no-leaked-resources": "warn" },
});
```

| Rule                                                                           | Checks                                |
| ------------------------------------------------------------------------------ | ------------------------------------- |
| [`resources/no-leaked-resources`](#resourcesno-leaked-resources)               | Owned resources left unreleased       |
| [`resources/require-bounded-retries`](#resourcesrequire-bounded-retries)       | Retry behavior without a finite bound |
| [`resources/require-cleanup-on-failure`](#resourcesrequire-cleanup-on-failure) | Cleanup that is not failure-safe      |

## `resources/no-leaked-resources`

Reviews functions containing `using` or recognized lifecycle calls for paths that finish while still owning an acquired file, stream, socket, connection, subscription, watcher, lock, transaction, or handle. Release, scoped management, and visible ownership transfer are accepted. Options: `threshold` defaults to `0.65`; `minConfidence` to `0.5`; `lifecycleCallPatterns` defaults to built-in acquisition and scoped-helper patterns and replaces them when supplied.

## `resources/require-bounded-retries`

Reviews functions with recognized retry calls, or retry language plus failure handling, for retries lacking a finite attempt, elapsed-time, or deadline bound. Cancellation alone is not a guaranteed bound. Options: `threshold` defaults to `0.9`; `minConfidence` to `0.7`; `retryCallPatterns` defaults to built-in retry patterns and replaces them when supplied.

## `resources/require-cleanup-on-failure`

Uses the same lifecycle candidate selection as `no-leaked-resources`, but checks for potentially failing work followed by cleanup only on the success path. `using`, `await using`, `finally`, scoped helpers, and ownership transfer are accepted. Options: `threshold` defaults to `0.9`; `minConfidence` to `0.7`; `lifecycleCallPatterns` behaves as above.

```ts
rules: { "resources/require-bounded-retries": ["warn", { retryCallPatterns: [/^again$/u] }] }
```
