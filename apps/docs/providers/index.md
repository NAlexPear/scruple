# Providers

A decision provider evaluates the typed requests produced by semantic rules. Scruple ships adapters for hosted Jev and local Laya.

| Provider          | Best for                                          | Runtime                   |
| ----------------- | ------------------------------------------------- | ------------------------- |
| [Jev](./jev.md)   | Hosted typed decisions with token usage reporting | HTTPS API                 |
| [Laya](./laya.md) | Local inference and offline workflows             | Persistent Python process |

Provider choice affects calibration. Use representative fixtures to choose thresholds for each provider and model rather than copying thresholds blindly between them.

Deterministic repository rules do not call the configured provider, but a provider is still required by the current configuration contract.
