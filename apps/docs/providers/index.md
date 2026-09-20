# Providers

Rules send fixed questions and JSON evidence to a decision provider. Most requests decide whether a
selected candidate violates a rule. Some rules first send a smaller classification request to decide
whether an ambiguous bounded target should become a candidate. Scruple includes an adapter for the
hosted Jev service.

Scruple is MIT licensed. Jev receives bounded evidence for collection classifications and final
candidate decisions over HTTPS, and its model usage is billed separately.

| Provider        | Best for                                    | Runtime   |
| --------------- | ------------------------------------------- | --------- |
| [Jev](./jev.md) | Hosted decisions with token usage reporting | HTTPS API |

Model choice affects calibration. Use representative fixtures to choose thresholds rather than copying thresholds blindly between models.

Every current Scruple rule uses the configured provider for a bounded semantic decision. Rules that
use semantic collection may make an additional bounded request before that final decision.
