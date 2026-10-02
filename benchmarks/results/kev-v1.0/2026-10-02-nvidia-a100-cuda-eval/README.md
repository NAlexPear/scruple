# Kev v1.0 full provider evaluation

This directory preserves one full 187-fixture Scruple evaluation for each released Kev v1.0
checkpoint. All four runs used the same NVIDIA A100-SXM4-80GB pod, one repetition, concurrency 1,
the official `kev.serve` entry point, bf16, the torch backend, and the request alias `kev-latest`.
Checkpoint selection happened only at server startup. No fixture was used for training, calibration,
or tuning.

## Results

| Checkpoint    |            Label |       Diagnostic |           Strict | TP / FP / TN / FN | Precision | Recall |     F1 |
| ------------- | ---------------: | ---------------: | ---------------: | ----------------: | --------: | -----: | -----: |
| Kev 0.8B v1.0 |  76/187 (40.64%) | 106/187 (56.68%) |  42/187 (22.46%) |  0 / 0 / 106 / 81 |       n/a |  0.00% |    n/a |
| Kev 4B v1.0   | 129/187 (68.98%) | 111/187 (59.36%) |  77/187 (41.18%) |  5 / 0 / 106 / 76 |   100.00% |  6.17% | 11.63% |
| Kev 9B v1.0   | 140/187 (74.87%) | 116/187 (62.03%) |  84/187 (44.92%) | 11 / 1 / 105 / 70 |    91.67% | 13.58% | 23.66% |
| Kev 27B v1.0  | 158/187 (84.49%) | 146/187 (78.07%) | 120/187 (64.17%) | 41 / 1 / 105 / 40 |    97.62% | 50.62% | 66.67% |

All 748 fixture executions were valid. Each checkpoint handled 188 model calls because one fixture
produced two candidates. There were zero HTTP/API failures, malformed responses, invalid fixtures,
CUDA graph capture failures, prefix-cache OOM retries, or other operational errors. Exit code 1 for
each evaluation records quality mismatches, not an operational failure.

| Checkpoint    | Abstention expected / actual / correct / unexpected |       Mean / p50 / p95 latency |     Throughput | Input / output tokens |
| ------------- | --------------------------------------------------: | -----------------------------: | -------------: | --------------------: |
| Kev 0.8B v1.0 |                                    15 / 74 / 8 / 66 |   83.190 / 48.579 / 230.053 ms | 11.903 cases/s |       67,208 / 17,031 |
| Kev 4B v1.0   |                                    15 / 30 / 6 / 24 |  125.208 / 88.852 / 306.697 ms |  7.933 cases/s |       67,208 / 17,025 |
| Kev 9B v1.0   |                                    15 / 14 / 3 / 11 | 136.292 / 105.879 / 310.283 ms |  7.293 cases/s |       67,208 / 17,081 |
| Kev 27B v1.0  |                                   15 / 22 / 10 / 12 | 330.227 / 280.290 / 679.031 ms |  3.021 cases/s |       67,208 / 17,059 |

Throughput uses command wall time, including local harness overhead. The provider exposed token usage
for every call. The server reported 5,211 / 16,045 / 23,253 / 66,147 MiB GPU memory after the 0.8B,
4B, 9B, and 27B runs respectively.

## Comparison

Kev 27B ranks below Jev 1.13 on diagnostic agreement, strict agreement, recall, and F1, while its
158 label matches are close to Jev's 160. It exceeds Clef, Decider, and Clef-flash on diagnostic
agreement, strict agreement, precision, recall, and F1; Clef has higher label agreement (165) and
Decider is much faster on its separate A100 run. The smaller Kev checkpoints trail all four verified
baselines on strict agreement and F1. See `comparison.json` for exact baseline rows.

Quality uses the same fixtures and thresholds and is directly comparable. Runtime is not: Kev and
Decider used self-hosted A100s at concurrency 1, while Jev and Clef used hosted hardware at
concurrency 64 and 4. Hosted usage estimates are also a different cost boundary from Runpod rental.

## Reproduction and identity

- Scruple base: `eafda5d90b2af2ba485724248afef766b74b4772`, plus the eval-only patch in
  `provenance/eval-harness.patch` (SHA-256 `981f5d3b...`).
- Kev server: `6b719c3c3f367295f6ef336f4f751cf5ff970abc`.
- Fixture corpus SHA-256: `71e174d510cf3bf4ab92005a1f8ec493bce5697548380126f8331bdec5e3bf24`.
- HF tag revisions: 0.8B `bf75a6a...`, 4B `6cfce5c...`, 9B `db029f0...`, 27B `af0e6d5...`;
  resolved base snapshots are recorded in `summary.json` and `provenance/hf-cache-paths.txt`.
- Runtime: Python 3.12.3, torch 2.8.0+cu128, transformers 5.17.0, CUDA 12.8,
  driver 580.126.16. Full package and LFS identities are under `provenance/`.

The official `serve` extra does not install the optional pinned `flash-linear-attention`; every
server logged that fused kernels were off and used Kev's supported fallback. CUDA graphs remained on.
The pod could not reach GitHub, so immutable Git archives were transferred from the orb; Hugging Face
downloads resolved the requested tags directly.

Each checkpoint directory records the exact two commands, model metadata before and after, HF
revision and file hashes, GPU snapshots, timings, empty eval stderr, and server log. Raw reports are
gzip-compressed under `raw/`. `SHA256SUMS` covers every preserved file.

## Cost and cleanup

The Secure Cloud A100 rate was $1.59/hour. From creation through the latest cleanup verification, the
pod existed for at most 1,111.564 seconds, giving a conservative compute upper bound of **$0.491**.
Finalized billing had not posted. No network volume or other persistent billable resource was created.
Pod `v2o3g926avmxob` and its temporary SSH key were deleted, and account state confirmed the pod was
absent. A different concurrent Kev benchmark pod and its key were preserved.
