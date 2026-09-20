# @scruple/caches

Semantic rules for application cache safety and correctness, packaged as a plugin for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/caches
```

The initial rules inspect identifiable cache operations within one function. They report unsafe
cross-scope keys, non-expiring writes without a visible freshness strategy, and plaintext sensitive
values. They abstain when wrappers or external cache policy leave the relevant behavior unclear.

Default operation detection recognizes cache-, Redis-, Memcache-, Keyv-, and KV-named clients.
Project-specific APIs can be added with `additionalReadPatterns`, `additionalWritePatterns`,
`additionalInvalidationPatterns`, and `additionalAmbiguousPatterns`. When patterns overlap, the
classification order is read, write, invalidate, then ambiguous; candidates are always emitted in
source order.

See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration.
