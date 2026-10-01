# Decider 4B v2.1 full-corpus evaluation from 2026-10-01

This directory preserves a run of Scruple's full 187-fixture semantic evaluation corpus against Decider 4B v2.1. The run started from exact `origin/main` commit `f76ac795557e5042afe8e30996e0b83c7691aa0b` and used the closest practical match to the published A100 reproducibility benchmark.

## Configuration

- Model: `Mapika/decider-4b` at Hub revision `eb5fbdfc9448473ec25e399882912863afbdb70e`; weights SHA-256 `ee8ce585b3cedd93206dd149b09b4bdd683174874211f85c77a36090b90c9fdd`
- Server: Decider commit `a5120cce45b9ff70964fac54ea6e8c1ac5b08c7f`, package 1.5.0, Python 3.12.14, Torch 2.14.0+cu130, Transformers 5.17.0
- Serving: CUDA bf16 on `cuda:0`, plain layout, compile off, FP8 off, shared-prefix execution off, maximum batch 1, one batch bucket, 17 CUDA graphs
- Hardware: one NVIDIA A100-SXM4-80GB on Runpod Secure Cloud in `US-MD-1`, driver 580.126.16, CUDA 13.0, compute capability 8.0
- Container: Runpod `runpod-torch-v280` template (`runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`), 30 GB container disk and 50 GB `/workspace` persistent mount
- Evaluation: one repetition, concurrency 1, all 187 fixtures; 188 model calls because one fixture produced two candidates

Exact evaluation command:

```sh
node packages/eval/dist/cli.js \
  --provider decider \
  --base-url http://127.0.0.1:8002 \
  --model decider-4b-v2.1 \
  --repetitions 1 \
  --concurrency 1 \
  --format json
```

## Results

| Metric                                    |                   Result |
| ----------------------------------------- | -----------------------: |
| Strict fixture pass rate                  |         106/187 (56.68%) |
| Label match                               |         135/187 (72.19%) |
| Diagnostic behavior match                 |         138/187 (73.80%) |
| Precision                                 |                   88.10% |
| Recall                                    |                   45.68% |
| F1                                        |                   60.16% |
| True positive / false positive            |                   37 / 5 |
| True negative / false negative            |                 101 / 44 |
| Actual / expected abstentions             |                  17 / 15 |
| Correct expected / unexpected abstentions |                   4 / 13 |
| Case latency mean / p50 / p95             | 34.89 / 39.72 / 45.18 ms |
| Harness measured throughput               |           28.665 cases/s |
| Whole-command wall throughput             |           27.500 cases/s |

All 187 fixtures were valid and completed. Candidate counts matched for every fixture. The server recorded 188 requests, 188 one-row batches, zero shared-prefix requests, zero errors, zero too-large rejections, and zero overload rejections. The evaluation command exited 1 because 81 fixtures did not strictly match; this is the harness's documented evaluation-failure status, not an operational error.

Strict fixture passing requires label, thresholded diagnostic behavior, candidate count, and abstention behavior to agree. Decider matched the expected label in 135 cases. Of those, 29 still differed in thresholded diagnostic behavior. Another 32 cases had a label mismatch but the expected diagnostic outcome, usually because confidence and rule thresholds suppressed a finding. The raw report preserves choices, probabilities, confidence, diagnostics, and latency for every case.

There was no Decider API incompatibility with the 187-fixture harness. The only environment incompatibility was that the Runpod template lacked GNU `/usr/bin/time`: the first measurement wrapper exited 127 before invoking Node or Decider. After installing the `time` package, the unchanged evaluation ran successfully. The failed wrapper's stderr and exit code are preserved under `provenance/`.

## Timing and cost

The measured evaluation ran from `2026-10-01T18:32:27Z` through `18:32:34Z`. The harness reported 6,523.664 ms total; GNU time reported 6.80 seconds wall, 0.67 seconds user CPU, and 0.07 seconds system CPU.

Runpod created pod `guw9c133xv5j2y` at `2026-10-01T18:23:09.024Z` at the catalog rate of $1.59/hour. It was terminated after artifact verification at approximately `18:35Z`, for a duration-rate estimate of about **$0.32**. Runpod's pod billing API returned no posted records both before and immediately after termination, so a finalized invoiced cost was unavailable and is not asserted here. No pods or account SSH keys remained after cleanup.

## Artifacts

- `raw/eval-report.json.gz`: complete machine-readable per-case report
- `summary.json`: compact metrics, environment, timing, and cost record
- `provenance/`: server health and stats, runtime metadata, Python freeze, logs, commands, timing, and the failed first wrapper
- `SHA256SUMS`: checksums over every preserved artifact except the checksum file itself
