# @scruple/resources

Semantic rules for function-local resource lifecycles and retry bounds, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/resources
```

The rules only evaluate functions with explicit lifecycle or retry evidence. They abstain when cleanup ownership, retry policy, or time bounds depend on contracts outside the available function and imports.

- `no-leaked-resources`
- `require-cleanup-on-failure`
- `require-complete-resource-cleanup`
- `require-bounded-retries`
- `require-retry-backoff-with-jitter`
- `require-retry-time-budget`

See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration and the current exported rules.
