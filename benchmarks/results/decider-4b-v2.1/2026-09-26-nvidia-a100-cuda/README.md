# Decider 4B v2.1 NVIDIA A100 CUDA benchmark from 2026-09-26

This directory preserves the CUDA bf16 side of a paired Decider device comparison over Scruple's pinned benchmark workload.

- Scruple commit: `3c16bb121742f01670f2990626544ff65c76a90f`
- Workload: the ten unique IDs in `benchmarks/fixtures.json`
- Run: one unmeasured warmup and three measured repetitions at concurrency 1, producing 30 measured cases from the same ten fixtures
- Model: `Mapika/decider-4b` at Hub revision `eb5fbdfc9448473ec25e399882912863afbdb70e`, resolved as `decider-4b-v2.1`
- Server: Decider commit `a5120cce45b9ff70964fac54ea6e8c1ac5b08c7f`, package 1.5.0, Python 3.12.14, CUDA bf16, plain layout, shared prefix disabled, maximum batch 1, and one batch bucket
- Machine: one NVIDIA A100-SXM4-80GB on Runpod Secure Cloud in `US-MD-1`, driver 580.126.16, CUDA 13.0, and compute capability 8.0

| Label agreement | Diagnostic agreement | Strict agreement | Mean case latency |      p50 |      p95 |     Throughput |
| --------------: | -------------------: | ---------------: | ----------------: | -------: | -------: | -------------: |
|   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |          38.93 ms | 40.22 ms | 44.08 ms | 25.679 cases/s |

All 40 warmup and measured requests returned HTTP 200. Server statistics recorded 40 one-row batches, zero shared-prefix calls, and zero errors. The CUDA serving path captured 17 graphs before the benchmark and replayed one graph for each request; the paired MPS path used eager forwards.

## Paired MPS comparison

The paired Apple M5 Max run used the same Scruple, Decider, and model revisions; the same fixtures, prompts, temperatures, thresholds, warmup, repetitions, and concurrency; and `DECIDER_SHARED=0` with `DECIDER_MAX_BATCH=1`. MPS used fp16 while CUDA used bf16.

| Device                          | Label agreement | Diagnostic agreement | Strict agreement | Mean case latency |       p50 |       p95 |     Throughput |
| ------------------------------- | --------------: | -------------------: | ---------------: | ----------------: | --------: | --------: | -------------: |
| Apple M5 Max MPS fp16           |   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |         173.58 ms | 171.20 ms | 211.78 ms |  5.761 cases/s |
| NVIDIA A100-SXM4-80GB CUDA bf16 |   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |          38.93 ms |  40.22 ms |  44.08 ms | 25.679 cases/s |

All 30 selected labels, actual findings, accepted or suppressed outcomes, diagnostic counts, and abstentions matched between devices. The emitted probability values differed: the maximum absolute probability difference was 0.0114 and the maximum confidence difference was 0.0152. None crossed a rule threshold, so the aggregate and per-case outcomes were identical.

CUDA delivered 4.458 times the MPS throughput and a 4.459-times improvement in mean case latency for this fixed run. That is a measurement of these two machines and serving paths, not a general hardware ranking. The rule thresholds remained fixed; no backend-specific calibration was applied.

`summary.json` contains the rounded CUDA result. `mps-comparison.json` records the cross-device decision and numeric comparison. `raw/` contains the unmodified report compressed with deterministic gzip settings. `provenance/` preserves commands, health and stats responses, Python packages, runtime and hardware metadata, benchmark stderr, and the server log.

## Raw report checksums

```text
f072113be0415cc4ea6befd4c3f3af2aa868dbe653c65037e2e4cef9d9b0de33  concurrency-1.json.gz
21a8c9f2e54a4bf770ec799f8bb00bc4d5154b594a05b61c3530d22108492c23  concurrency-1.json (decompressed)
```

## Provenance checksums

```text
d2e1e720a6290a7c599ba8f108e49f7e628daf80ac91787536708458b508847f  benchmark.stderr
0d6a40fc52b5785c266c2352fd5613856ac6dcc44026e617f6e1a0c4995594d7  commands.txt
baebd4ba934fdeca1f4e7da5cd06d2c8ef9c703902c374177d0a0d387517469b  health-response.json
995efecd7e6186cf5b6e46c1a72533c70026c9f2b71d61eba52bce1bb223059e  python-freeze.txt
2db80060fb24377121bfe1ea3a20df011279be03c47fb08d2edbd86bdaa32a86  runtime-metadata.txt
52f7728cfda5bc6717e1103cc75cbaf78c64b3734c0a3ca23fc98f99fa742e54  server.log
aea9006731c4caa34eac431ff6fb4169b712333cdb260250765b6ccda0785521  stats-after.json
cd57d57c7a5848c1a9a5bd4bd1826d64434d1e64a2ffd69d8d5634ab654f836d  stats-before.json
```
