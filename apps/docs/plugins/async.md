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
| [`async/require-race-loser-cleanup`](#asyncrequire-race-loser-cleanup)             | Locally owned race losers abandoned   |
| [`async/require-abort-listener-cleanup`](#asyncrequire-abort-listener-cleanup)     | Abort listeners outlive operations    |

## `async/no-unbounded-concurrency`

Reviews native `Promise.all` and `Promise.allSettled` fan-out with visible operation creation and boundary evidence. Fixed tuples and visible batching or limits are accepted. Options: `threshold` `0.9`, `minConfidence` `0.7`.

## `async/no-serial-independent-work`

Reviews async functions with at least two directly awaited calls. It reports only when local evidence shows the operations can start together without changing data, side-effect, error, transaction, lock, rate-limit, or ordering behavior. Options: `threshold` `0.9`, `minConfidence` `0.7`.

## `async/require-cancellation-propagation`

Reviews explicit `AbortSignal` contracts that call recognized platform `fetch`. It checks whether the caller's signal is forwarded, including when signals are composed. Options: `threshold` `0.9`, `minConfidence` `0.7`.

## `async/require-race-loser-cleanup`

Reviews native `Promise.race` and `Promise.any` calls for locally created work whose losing branches continue without cancellation, settlement observation, or cleanup. Caller-owned and visibly harmless inputs are accepted.

## `async/require-abort-listener-cleanup`

Reviews literal abort listeners on signal-like receivers. One-shot listeners and visible removal or disposal are accepted; unresolved ownership or listener lifetime causes abstention.

```ts
rules: { "async/require-cancellation-propagation": ["warn", { threshold: 0.95 }] }
```
