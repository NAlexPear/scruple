# Async

`@scruple/async` checks asynchronous control flow, including concurrency, cancellation, cleanup, and unobserved work.

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
| [`async/no-unobserved-async-work`](#asyncno-unobserved-async-work)                 | Started async work is not observed    |
| [`async/no-async-initialization`](#asyncno-async-initialization)                   | Async work hidden in initialization   |

## `async/no-unbounded-concurrency`

Reviews native `Promise.all` and `Promise.allSettled` fan-out with visible operation creation and boundary evidence. Fixed tuples and visible batching or limits are accepted. Options: `threshold` `{ warning: 0.9, error: 0.97 }`, `minConfidence` `0.7`.

## `async/no-serial-independent-work`

Reviews async functions with at least two directly awaited calls. It reports only when local evidence shows the operations can start together without changing data, side-effect, error, transaction, lock, rate-limit, or ordering behavior. Options: `threshold` `{ warning: 0.9, error: 0.97 }`, `minConfidence` `0.7`.

## `async/require-cancellation-propagation`

Reviews explicit `AbortSignal` contracts that call recognized platform `fetch`. It checks whether the caller's signal is forwarded, including when signals are composed. Options: `threshold` `{ warning: 0.9, error: 0.97 }`, `minConfidence` `0.7`.

## `async/require-race-loser-cleanup`

Reviews native `Promise.race` and `Promise.any` calls for locally created work whose losing branches continue without cancellation, settlement observation, or cleanup. Caller-owned and visibly harmless inputs are accepted.

## `async/require-abort-listener-cleanup`

Reviews literal abort listeners on signal-like receivers. One-shot listeners and visible removal or disposal are accepted; unresolved ownership or listener lifetime causes abstention.

## `async/no-unobserved-async-work`

Reviews conservatively selected promise-producing calls whose result is discarded. Awaiting, returning, chaining, aggregating, or deliberately marking fire-and-forget work with `void` counts as observation. Calls with unresolved return contracts, framework-managed lifetimes, or otherwise ambiguous ownership cause abstention.

## `async/no-async-initialization`

Reviews constructors that visibly start asynchronous work before an explicit lifecycle boundary can observe readiness or failure. Explicit startup factories and readiness contracts are accepted. It abstains when framework bootstrapping, generated code, or an opaque helper owns initialization.

```ts
rules: {
  "async/require-cancellation-propagation": [
    "warn",
    { threshold: { warning: 0.95, error: 0.99 } },
  ],
}
```
