# Providers

Rules send fixed questions and JSON evidence to a decision provider. Scruple includes an adapter for the hosted Jev service.

Scruple is MIT licensed. Jev receives the selected code evidence over HTTPS, and its model usage is billed separately.

| Provider        | Best for                                    | Runtime   |
| --------------- | ------------------------------------------- | --------- |
| [Jev](./jev.md) | Hosted decisions with token usage reporting | HTTPS API |

Model choice affects calibration. Use representative fixtures to choose thresholds rather than copying thresholds blindly between models.

Every current Scruple rule uses the configured provider for a bounded semantic decision.
