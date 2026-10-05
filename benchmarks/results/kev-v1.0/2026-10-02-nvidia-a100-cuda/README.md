# Kev v1.0 NVIDIA A100 benchmark from 2026-10-02

This directory preserves all four released Kev v1.0 checkpoints over Scruple's ten pinned provider-benchmark fixtures. Each checkpoint used one unmeasured warmup and three measured repetitions at concurrency 1, 2, 4, and 8. The server was restarted between immutable checkpoint revisions; the Hugging Face cache and all other runtime settings stayed fixed.

## Fair concurrency-1 quality and latency

| Checkpoint | Label agreement | Diagnostic agreement | Strict agreement | Mean latency |       p50 |        p95 |    Throughput |
| ---------- | --------------: | -------------------: | ---------------: | -----------: | --------: | ---------: | ------------: |
| Kev 0.8B   |     12/30 (40%) |           3/30 (10%) |       3/30 (10%) |    164.88 ms | 116.51 ms |  378.86 ms | 6.064 cases/s |
| Kev 4B     |     24/30 (80%) |           6/30 (20%) |       6/30 (20%) |    222.54 ms | 163.95 ms |  467.95 ms | 4.493 cases/s |
| Kev 9B     |    30/30 (100%) |           6/30 (20%) |       6/30 (20%) |    248.06 ms | 205.93 ms |  469.71 ms | 4.031 cases/s |
| Kev 27B    |    30/30 (100%) |          24/30 (80%) |      24/30 (80%) |    511.90 ms | 398.38 ms | 1018.53 ms | 1.953 cases/s |

Quality failures are not operational errors. In particular, 9B selected every expected label but its probabilities did not clear the existing rule thresholds for most expected diagnostics. The 0.8B model abstained in 18 of 30 measured cases, 4B in 6, and 9B/27B in none. No Kev-specific threshold calibration was applied.

For context, the existing pinned A100 Decider 4B result is 90% label, 60% diagnostic, and 50% strict agreement at 25.679 cases/s. The post-calibration hosted Jev run is 100% on all three dimensions, though its large sustained workload and hosted hardware are not a direct throughput comparison. This checkout contains no committed live Clef result to compare numerically.

## Concurrency sweep

| Checkpoint |    c1 |        c2 |         c4 |        c8 |                                                Clean point |
| ---------- | ----: | --------: | ---------: | --------: | ---------------------------------------------------------: |
| Kev 0.8B   | 6.064 |     9.895 | **13.239** |    11.452 |                                                         c4 |
| Kev 4B     | 4.493 |     7.301 |  **8.711** |     6.972 |                                                         c4 |
| Kev 9B     | 4.031 |     6.428 |      7.226 | **7.517** | c4: 4% less throughput than c8 with 44% lower mean latency |
| Kev 27B    | 1.953 | **3.150** |      3.047 |     3.135 |                                                         c2 |

Values are cases per second. The 0.8B and 4B servers regress at c8. Kev 27B saturates at c2: c4 and c8 do not improve throughput and raise mean latency from 602 ms to 1,172 ms and 2,000 ms. The server batched all concurrent runs and reported zero queued requests, zero OOM retries, and 24–25 retained CUDA graph captures per checkpoint.

Concurrency changed threshold-adjacent outcomes for 4B and 9B even though the checkpoint and inputs were fixed. The concurrency-1 table is therefore the quality comparison; sweep results identify capacity rather than redefine model quality.

## Identity, runtime, and usage

- Scruple base: `eafda5d90b2af2ba485724248afef766b74b4772`, plus the benchmark-harness support in the containing commit.
- Kev source: `84847f0a883d900f7de5b7a57eaa341ca7f9a6b4`.
- Checkpoints: the immutable commits behind `jaredpalmer/kev-{0.8b,4b,9b,27b}@v1.0`, listed in `summary.json` and `provenance/sources.json`.
- Request contract: `POST /v1/systemone` with model alias `kev-latest`. Responses resolve to that alias, so `GET /v1/models` was captured before/after each server and is the authoritative loaded-checkpoint identity.
- Server: Torch backend, bf16, CUDA graphs on, fused kernels auto, four-entry/65,536-token prefix cache, no state truncation, 65,536-token server limit. The official `serve` extra did not install `causal_conv1d` or `flash-linear-attention`, so Transformers logged that both fused operations used their correct but slower reference implementations.
- Runtime: Python 3.13.8, Torch 2.8.0+cu128, Transformers 5.17.0, NVIDIA driver 550.54.15, CUDA 12.4.
- Hardware: one NVIDIA A100 80GB PCIe on Runpod Community Cloud. Resident model-server memory was 5,286 / 16,268 / 23,454 / 66,756 MiB respectively.
- Every concurrency level made 30 measured model calls plus 10 warmup calls. At c1 each checkpoint used 12,723 measured input tokens and 2,706–2,712 output tokens.

All 640 warmup and measured requests returned HTTP 200. There were no benchmark exits, HTTP errors, capacity failures, server OOM retries, or retries that replaced failed runs. The initial unfiltered Kev source clone was killed before installation; `provenance/setup-attempt-1.log` preserves it, and a filtered clone at the same commit succeeded. An initial shell-quoting mistake started an invalid pre-readiness command; it was stopped and corrected before any benchmark request.

## Cost and cleanup

The pod create response reported $1.19/hour. It existed for about 24 minutes 30 seconds, giving a GPU estimate of $0.486. The 30 GB container disk and 200 GB volume disk were both $0.10/GB/month while running, adding about $0.013, for a best-supported wall-clock infrastructure estimate of **$0.499**. The Runpod billing ledger had not posted a record immediately after deletion. Kev is self-hosted, so API-style token cost was **$0**; token counts are usage measurements, not charges.

The pod deletion returned HTTP 204. A follow-up listed zero pods, zero network volumes had been created, the pod-local volume was destroyed with the pod, and the task-scoped SSH key was removed both from Runpod and the benchmark client.

`raw/` contains the unmodified JSON reports compressed with deterministic gzip. `provenance/` contains commands, exact source references, `GET /v1/models` responses, stderr, server logs, package/runtime details, setup failure evidence, and the execution timeline. `SHA256SUMS` covers every preserved file except itself.
