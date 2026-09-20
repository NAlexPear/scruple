# Providers

A decision provider evaluates the typed requests produced by semantic rules. Scruple ships adapters for hosted Jev and local Laya.

Scruple is MIT licensed. With Jev, you pay for hosted model usage. With Laya, decisions run on your own hardware and use your local compute.

| Provider          | Best for                                          | Runtime                   |
| ----------------- | ------------------------------------------------- | ------------------------- |
| [Jev](./jev.md)   | Hosted typed decisions with token usage reporting | HTTPS API                 |
| [Laya](./laya.md) | Local inference and offline workflows             | Persistent Python process |

Provider choice affects calibration. Use representative fixtures to choose thresholds for each provider and model rather than copying thresholds blindly between them.

Every current Scruple rule uses the configured provider for a bounded semantic decision.
