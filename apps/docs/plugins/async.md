# Async

`@scruple/async` provides provider-backed semantic checks for asynchronous control flow.

```sh
pnpm add -D @scruple/async
```

```ts
import { defineConfig } from "@scruple/core";
import { asyncRules } from "@scruple/async";

export default defineConfig({
  parser,
  provider,
  plugins: { async: asyncRules() },
  rules: { "async/no-unbounded-concurrency": "warn" },
});
```

| Rule                                                                               | Checks                                |
| ---------------------------------------------------------------------------------- | ------------------------------------- |
| [`async/no-unbounded-concurrency`](#asyncno-unbounded-concurrency)                 | Potentially unbounded promise fan-out |
| [`async/no-serial-independent-work`](#asyncno-serial-independent-work)             | Independent awaits run in series      |
| [`async/require-cancellation-propagation`](#asyncrequire-cancellation-propagation) | Accepted cancellation not forwarded   |

## `async/no-unbounded-concurrency`

Reviews functions calling `Promise.all`, `Promise.allSettled`, or `Promise.any` and flags one-operation-per-item fan-out when the collection has no visible bound. Fixed tuples, visible batching or limits, intentional small races, and already-started promises are accepted. Options: `threshold` `0.9`, `minConfidence` `0.7`.

## `async/no-serial-independent-work`

Reviews async functions with at least two directly awaited calls. It reports only when local evidence shows the operations can start together without changing data, side-effect, error, transaction, lock, rate-limit, or ordering behavior. Options: `threshold` `0.9`, `minConfidence` `0.7`.

## `async/require-cancellation-propagation`

Reviews functions that mention `AbortSignal` and make calls. It checks whether an accepted signal is omitted from a downstream operation whose cancellation API is established by local evidence, imports, or a well-known platform API. Options: `threshold` `0.9`, `minConfidence` `0.7`.

```ts
rules: { "async/require-cancellation-propagation": ["warn", { threshold: 0.95 }] }
```
