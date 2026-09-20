# Providers

A decision provider evaluates the typed requests produced by semantic rules. Scruple ships a Jev adapter for hosted typed decisions.

Scruple is MIT licensed. Jev model usage is billed separately by its provider.

| Provider        | Best for                                          | Runtime   |
| --------------- | ------------------------------------------------- | --------- |
| [Jev](./jev.md) | Hosted typed decisions with token usage reporting | HTTPS API |

Model choice affects calibration. Use representative fixtures to choose thresholds rather than copying thresholds blindly between models.

Every current Scruple rule uses the configured provider for a bounded semantic decision.
