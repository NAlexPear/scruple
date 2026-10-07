# OpenAI GPT-6 Luna benchmark from 2026-10-07

This directory preserves a reproducible OpenAI Decisions run and practical concurrency sweep over Scruple's ten pinned provider-benchmark fixtures. Every concurrency used one unmeasured warmup and three measured repetitions, producing 30 measured cases.

## Concurrency-1 quality and latency

| Label agreement | Diagnostic agreement | Strict agreement | Mean latency |       p50 |       p95 |    Throughput |
| --------------: | -------------------: | ---------------: | -----------: | --------: | --------: | ------------: |
|     24/30 (80%) |          21/30 (70%) |      18/30 (60%) |    193.26 ms | 160.80 ms | 345.04 ms | 5.174 cases/s |

There were no expected or actual abstentions. Quality was exactly equal at c1, c2, c4, and c8. The 12 strict failures per concurrency are benchmark quality disagreements, not operational failures.

## Practical concurrency sweep

| Concurrency | Mean latency |       p50 |       p95 |         Throughput | Relative to c1 |
| ----------: | -----------: | --------: | --------: | -----------------: | -------------: |
|           1 |    193.26 ms | 160.80 ms | 345.04 ms |      5.174 cases/s |          1.00× |
|           2 |    149.76 ms | 140.68 ms | 252.24 ms |     12.760 cases/s |          2.47× |
|           4 |    191.18 ms | 167.98 ms | 384.28 ms |     16.444 cases/s |          3.18× |
|           8 |    190.87 ms | 166.20 ms | 330.86 ms | **25.015 cases/s** |      **4.83×** |

Concurrency 8 is the best observed point in this bounded sweep. Throughput was still increasing, so these runs do not establish the service's saturation point or a universal production limit. Hosted-service conditions were uncontrolled and the workload is intentionally small.

## Methodology, usage, and cost

- Scruple base: `2fc48be1f99fb17680cf0bd87f643d83539b50db`, plus the benchmark-only OpenAI wiring in the containing commit.
- Provider: the `@scruple/provider-openai` implementation already on that base commit, calling `POST /v1/decisions`.
- Requested and resolved model: `gpt-6-luna`.
- Workload: the ten IDs in `benchmarks/fixtures.json`, resolved against `tests/eval-fixtures.json`; one warmup and three measured repetitions at each concurrency.
- Execution: concurrency levels ran sequentially in the same Amp orb. Each level made 10 warmup and 30 measured logical model calls.
- Usage: every measured level reported 14,916 input tokens and 0 output tokens. Across the sweep, measured usage was 59,664 input tokens; warmups added 19,888, for 79,552 total input tokens.
- Pricing retrieved on 2026-10-07 from OpenAI's Decisions guide: `$0.10 / 1M` input tokens, with no output-token charge. Measured cost was `$0.0059664`; including warmups, estimated total cost was **`$0.0079552`**. Regional premiums were not independently observable and are excluded.

All four benchmark commands exited 0. No HTTP, refusal, timeout, rate-limit, or other provider error surfaced in the reports or stderr. The provider does not expose retry telemetry, so the evidence cannot distinguish a first-attempt success from a successful internal retry.

`raw/` contains the unmodified JSON reports compressed with deterministic gzip. They retain environment details, exact run settings, per-case answers and failures, resolved model, latency, throughput, and usage. `provenance/` contains exact commands, execution timestamps, stderr, source hashes, the pricing statement used for the estimate, and the base commit. `SHA256SUMS` covers every preserved file except itself.
