# Kev thresholds

Scruple's rule thresholds were calibrated on Jev. Kev usually picks the same winning choice, but with lower probabilities, so the default thresholds drop most real findings. These files replace the thresholds for Kev.

- `split.json` divides the 187 cases in `tests/eval-fixtures.json` into 94 train and 93 held-out cases. Cases are grouped by rule and expected outcome, sorted by id, then alternated with one counter across all groups. The held-out half has 38 cases that should report.
- `kev-4b.rules.json` and `kev-9b.rules.json` set a warning threshold per rule, fit on the train half. The score is the finding's probability when the finding is the winning choice, since that's the only case a rule reports. Each threshold maximizes train F1. A rule with fewer than two train cases on either side uses one cut fit across all train cases. That applies to 45 of the 49 rules, so these files are mostly one global cut.
- `minConfidence` is `0`. Kev reports choice confidence as `(p_max - 1/K)/(1 - 1/K)`, which isn't the statistic the defaults assume. `threshold.error` is `1`, so Kev findings report as warnings.

## Results

Recorded on 2026-09-23 against `kev.serve` on `127.0.0.1` (Apple M2 Max, MLX, bf16), from Scruple commit `de7d9d1` plus this change. Every held-out number comes from `pnpm eval` with the engine applying the thresholds.

| Model  | Thresholds          | Held-out precision | Held-out recall |
| ------ | ------------------- | ------------------ | --------------- |
| Kev-4B | Defaults            | 0.846 (11/13)      | 0.289 (11/38)   |
| Kev-4B | `kev-4b.rules.json` | 0.714 (25/35)      | 0.658 (25/38)   |
| Kev-9B | Defaults            | 0.813 (13/16)      | 0.342 (13/38)   |
| Kev-9B | `kev-9b.rules.json` | 0.730 (27/37)      | 0.711 (27/38)   |

Pinned 10-case benchmark, one warmup and two measured repetitions at concurrency 1:

| Model  | Right choice before thresholds | Strict matches, default thresholds | Case latency p50 / p95 |
| ------ | ------------------------------ | ---------------------------------- | ---------------------- |
| Kev-4B | 18/20                          | 4/20                               | 543 / 675 ms           |
| Kev-9B | 20/20                          | 10/20                              | 943 / 1,179 ms         |

For comparison, Jev 1.13.0 recorded 20/20 strict matches at 132 ms p50 on the same pinned cases (`../results/comparison/2026-09-20`). No full-corpus Jev eval is recorded. The machine was shared with other work during these runs, so latency is an upper bound.

These are small synthetic fixtures. Fit thresholds on your own labeled code before relying on them.
