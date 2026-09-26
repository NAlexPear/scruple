# Decider 4B v2.1 Apple MPS benchmark from 2026-09-26

This directory preserves a local Decider concurrency sweep over Scruple's pinned benchmark workload.

- Scruple commit: `3c16bb121742f01670f2990626544ff65c76a90f`
- Workload: the ten unique IDs in `benchmarks/fixtures.json`
- Runs: one unmeasured warmup and three measured repetitions at each concurrency, producing 30 measured cases from the same ten fixtures
- Model: `Mapika/decider-4b` at Hub revision `eb5fbdfc9448473ec25e399882912863afbdb70e`, resolved as `decider-4b-v2.1`
- Server: Decider commit `a5120cce45b9ff70964fac54ea6e8c1ac5b08c7f`, package 1.5.0, Python 3.12.14, MPS device, plain layout, shared prefix enabled, maximum batch 32
- Machine: Apple M5 Max MacBook Pro with 18 logical cores and 48 GiB unified memory, running macOS 26.6.2

| Concurrency | Strict agreement | Label agreement | Diagnostic agreement | Mean case latency |       p50 |       p95 |    Throughput |
| ----------: | ---------------: | --------------: | -------------------: | ----------------: | --------: | --------: | ------------: |
|           1 |    15/30 (50.0%) |   27/30 (90.0%) |        18/30 (60.0%) |         167.57 ms | 163.62 ms | 204.64 ms | 5.967 cases/s |
|           2 |    15/30 (50.0%) |   27/30 (90.0%) |        18/30 (60.0%) |         347.70 ms | 366.75 ms | 414.90 ms | 5.399 cases/s |
|           4 |    15/30 (50.0%) |   27/30 (90.0%) |        18/30 (60.0%) |         679.53 ms | 757.32 ms | 820.01 ms | 5.128 cases/s |

All three runs produced the same decisions. Across the ten unique fixtures, Decider matched 9 labels, Scruple matched 6 expected diagnostic outcomes after applying thresholds, and 5 fixtures were strict matches. Four fixtures had the expected label but did not clear the fixed probability threshold needed to report a finding. One fixture had the wrong label but still matched the expected no-diagnostic outcome because confidence was too low to report it. Strict agreement requires the expected label, diagnostic behavior, candidate count, and abstention behavior together.

For the paired CUDA comparison, concurrency 1 was repeated with shared-prefix execution disabled and maximum batch 1. That reproducibility run kept all 30 emitted answer objects exactly equal to the original MPS run at report precision. It measured 173.58 ms mean case latency, 211.78 ms p95, and 5.761 cases per second. Its raw report and server provenance are preserved alongside the original sweep.

The rule thresholds were not tuned for Decider. They remained fixed for like-for-like model comparison: warning probability 0.90, error probability 0.97, and minimum confidence 0.70 except for security's 0.75. The MPS path used fp16, while Decider's published calibration reference uses bf16, so this result should not by itself be used to attribute threshold differences to model weights.

Concurrency 1 was fastest for this small workload. These measurements include Scruple parsing, candidate collection, local HTTP requests, model inference, and diagnosis. Do not compare this Apple MPS throughput directly with hosted Jev throughput: the model hardware and serving environments differ.

`summary.json` contains the rounded values used by the docs. `raw/` contains the complete benchmark reports compressed with deterministic gzip settings. `provenance/` preserves the exact commands, health and stats responses, Python environment, machine, model revision, server configuration, and original-versus-reproducibility comparison. All 121 smoke, warmup, and measured requests observed during the sweep returned HTTP 200; no server, inference, swap, or memory-pressure failure was observed. The additional reproducibility run completed 40 warmup and measured requests without errors.

## Raw report checksums

Compressed files committed here:

```text
6c66e6435c5b6bf84068aa877a3eb9f870f2498299887e32ed2d8afb13216365  concurrency-1.json.gz
080c00387d010079446b3d6d30c5bf11ef627402bdb65106dd2b25f5fd74f4ec  concurrency-1-repro.json.gz
7931f93db8088db3f17c035ac5b226144e28bc8e0daaa7e5bad00fb183635858  concurrency-2.json.gz
4d6dee09b9def26aa53415205de1078253cb5bada12f0458c207f76240c3a91b  concurrency-4.json.gz
```

Decompressed raw JSON:

```text
21eca48a88a9043b8bdd1a6dc7d310ae408fb7113b113c2b44720e3593da3917  concurrency-1.json
a16a3fa6e4096bfa5cd06e2f1b41df9fc709bb55e7bdc2d32a106b3d28c73d0f  concurrency-1-repro.json
7531fc9a1b35c19a4b4088a304af22e3422aa5825eb7ecc410e96504afd3684d  concurrency-2.json
39469548203319f72acd5dfe3b3698340994f8c52ad4be3ec2c5c366665b61fd  concurrency-4.json
```

## Provenance checksums

```text
19e3fffd255ab9cc01bdecb6cd7cb1d7983f0cfad0dfce9227ce141cdcaec90e  commands.txt
970c0c4cabdebfee92573921c8b84a3786267d6fee91d415019a552bf6bf2599  health-response.txt
e8344788a84ab51e8fa7850fc88d59e2faa59b008e3296ac5a1b799696e9a9c8  machine-model-server.json
b69059354f6e94c01a769595ebc783b44d34bf09e21cdc3a9fd5cb86b98d67b2  python-freeze.txt
3a24c4bd208319b6ea616396784b9150daec2547c1364fc9fc2a1bd5a8c43d69  repro-health-response.json
db3e71eacc99cc9d912ba3d7094fcc91e2a1a23d29286eb6ef8f2a7cde8e68d3  repro-metadata.json
78db921ec7817dd634dee590d2fd1b2c03f271b1fedebf102595682dd7c54434  repro-server.log
cf3d157197d26e54cd1299855c3095dafac6b58d154df30c7a03d3dc3a84c794  repro-stats-after.json
043df919062ec896dcc5b44b8df88c7e27a0621607ebfec1142d8e9ba8ad8d4b  repro-stats-before.json
7e023a1a3cb1091721906a354c013b4f4d0e542c7b0c0b50d2fd640c01ada48e  stock-repro-comparison.json
```
