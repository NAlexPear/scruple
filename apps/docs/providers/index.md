# Providers

Rules send fixed questions and JSON evidence to a decision provider. Most requests decide whether a
selected candidate violates a rule. Some rules first send a smaller classification request to decide
whether an ambiguous bounded target should become a candidate. Scruple includes adapters for the
self-hosted Decider model and the hosted Cloudflare Clef and Jev services.

Scruple is MIT licensed. Decider runs on your own infrastructure. Cloudflare and Jev receive bounded
evidence for collection classifications and final candidate decisions over HTTPS, and their model
usage is billed separately.

| Provider                      | Best for                                    | Runtime                 |
| ----------------------------- | ------------------------------------------- | ----------------------- |
| [Cloudflare](./cloudflare.md) | Hosted Clef or low-latency Clef-flash       | Workers AI HTTPS API    |
| [Decider](./decider.md)       | Local or self-hosted SystemOne decisions    | Self-hosted HTTP server |
| [Jev](./jev.md)               | Hosted decisions with token usage reporting | HTTPS API               |

See the [full provider evaluation](./evaluation.md) for quality, latency, throughput, and cost results
across all 187 fixtures. Jev 1.13 is the strongest overall default; the other choices trade quality for
Cloudflare-native hosting, private self-hosting, or lower hosted model cost.

Model choice affects calibration. Use representative fixtures to choose thresholds rather than copying thresholds blindly between models.

Every current Scruple rule uses the configured provider for a bounded semantic decision. Rules that
use semantic collection may make an additional bounded request before that final decision.
