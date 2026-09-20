# Jev 1.13.0 post-calibration benchmark from 2026-09-20

This directory preserves the verification run after three rule questions were made more literal.

- Scruple commit: `2c9a5732bcc715c0f6f52ed3d053660f0506a835`
- Jev model: `jev-1.13.0`
- Client: Node.js 26.8.2 on Linux x64 with four logical Intel Xeon CPUs and 8,343,158,784 bytes of memory
- Sustained workload: the ten IDs in `benchmarks/fixtures.json`, cycled in order to 128 cases
- Sustained run: two unmeasured warmups and twenty measured repetitions at concurrency 64
- Focused run: 19 fixtures for the three changed rules, one unmeasured warmup and five measured repetitions at concurrency 8

The sustained run produced 2,560/2,560 strict matches at 231.252 cases per second. Label agreement, diagnostic agreement, and abstention agreement were also 2,560/2,560. It used 2,012,580 measured input tokens, an estimated $0.08452836 at $0.042 per million input tokens.

The focused run produced 95/95 strict matches. Its 10 actual abstentions matched the 10 expected abstentions. It used 75,340 measured input tokens, an estimated $0.00316428.

The complete reports are compressed with deterministic gzip settings in `raw/`. Warmup token usage is excluded from these totals.

## Raw report checksums

```text
bbac3b6daf3e801f9b3a5903d72fb652ffc73d8ca84166cb1b774aa1e166e28d  concurrency-64.json.gz
405d13572fd6da598e946f16ca318a9a8e387070d5ffb6cfd927385ccf157a74  three-rules-19-fixtures.json.gz
```
