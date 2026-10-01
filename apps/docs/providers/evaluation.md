# Provider evaluation

We evaluated all four supported provider and model choices against Scruple's full suite of 187
fixtures. **Jev 1.13 is the best default and the strongest overall choice:** it combines the highest
strict agreement, diagnostic agreement, recall, and F1 score with low hosted cost. The other models
remain useful when deployment location, privacy, or marginal hosted cost matters more than overall
quality.

## Results at a glance

| Provider and model        |                Label |           Diagnostic |               Strict |  Precision |     Recall |         F1 |
| ------------------------- | -------------------: | -------------------: | -------------------: | ---------: | ---------: | ---------: |
| **Jev 1.13**              |     160/187 (85.56%) | **171/187 (91.44%)** | **148/187 (79.14%)** |     95.77% | **83.95%** | **89.47%** |
| **Cloudflare Clef**       | **165/187 (88.24%)** |     138/187 (73.80%) |     119/187 (63.64%) | **97.06%** |     40.74% |     57.39% |
| **Decider 4B v2.1**       |     135/187 (72.19%) |     138/187 (73.80%) |     106/187 (56.68%) |     88.10% |     45.68% |     60.16% |
| **Cloudflare Clef-flash** |     141/187 (75.40%) |     122/187 (65.24%) |      93/187 (49.73%) |     86.36% |     23.46% |     36.89% |

All four full evaluations completed with zero provider errors. Bold values mark the strongest result in
each directly comparable column. Clef-flash has the lowest **hosted** usage estimate, while Decider's
number is a different kind of cost and should not be ranked against hosted usage charges.

### Runtime and cost

| Provider and model        |        Latency, mean / p50 / p95 |             Observed throughput |                         Evaluation cost |
| ------------------------- | -------------------------------: | ------------------------------: | --------------------------------------: |
| **Jev 1.13**              |   233.954 / 127.070 / 507.669 ms | 188.89 cases/s (concurrency 64) |        $0.005647236 hosted API estimate |
| **Cloudflare Clef**       | 826.403 / 736.185 / 1,463.325 ms |   7.365 cases/s (concurrency 4) |      $0.021449520 hosted model estimate |
| **Decider 4B v2.1**       |  **34.890 / 39.720 / 45.180 ms** |  28.665 cases/s (concurrency 1) | About $0.32 infrastructure run estimate |
| **Cloudflare Clef-flash** | 633.300 / 640.551 / 1,149.452 ms |  10.269 cases/s (concurrency 4) |  **$0.008043570 hosted model estimate** |

## How to choose

- **Use Jev 1.13 by default.** It is strongest overall and leads the measures closest to what users
  experience: diagnostic agreement, strict agreement, recall, and F1.
- **Use Cloudflare Clef when you want a Cloudflare-native hosted option.** It has the best raw label
  agreement and precision, but its low recall makes it conservative: when it reports a finding it is
  usually right, but it misses many findings the suite expects.
- **Use Decider when you need fast, private, self-hosted decisions.** The A100 run has the lowest case
  latency, keeps evidence on infrastructure you control, and scores above Clef-flash on diagnostic
  agreement, strict agreement, recall, and F1.
- **Use Clef-flash only when low hosted model cost matters more than quality.** It costs less than the
  other hosted choices in this evaluation, but has the lowest strict agreement, recall, and F1.

These recommendations describe this fixture suite and these model versions. Run representative cases
from your own code before treating the ranking as a guarantee for a different workload.

## Methodology

The suite contains 187 unique fixtures across Scruple's semantic rules. Each fixture includes source
code, the expected model choice, whether Scruple should emit a diagnostic, the expected candidate
count, and any expected abstention. Each provider processed the same full suite through Scruple with
the rules and thresholds held fixed. The model-quality runs bypassed the decision cache, so every case
reached the configured model.

The evaluation measures the complete Scruple decision path: parse the fixture, collect bounded
evidence, ask any collection and final decision questions, apply the rule's confidence threshold, and
produce or suppress a diagnostic. Results therefore describe each model as configured for Scruple,
not an isolated general-purpose model test.

Decider ran as `decider-4b-v2.1` in bf16 on an NVIDIA A100-SXM4-80GB. Jev and both Clef models ran on
their hosted services. Costs use the measured run's usage or infrastructure time and the applicable
price at evaluation time; prices, account discounts, and infrastructure rates can change.

## What the metrics mean

- **Label agreement** is how often the model chose the fixture's expected answer, before Scruple
  applies confidence thresholds.
- **Diagnostic agreement** is how often the user-visible result was right: Scruple reported a finding
  when expected or stayed quiet when no finding was expected.
- **Strict agreement** requires the whole case to match: label, diagnostic behavior, candidate count,
  and abstention behavior.
- **Precision** asks, “Of the findings Scruple reported, how many were expected?” High precision means
  fewer false alarms.
- **Recall** asks, “Of the findings the suite expected, how many did Scruple report?” High recall means
  fewer missed findings.
- **F1** balances precision and recall in one score. It is high only when both are high.
- **Latency** is the end-to-end time for one case. Mean is the average; p50 is the middle case; p95 is
  the time that 95% of cases completed within.
- **Throughput** is the number of cases completed per second in the recorded run.
- **Cost** is the estimated spend for one pass over all 187 fixtures.

## Comparability limits

Quality metrics are directly comparable because every model saw the same 187 fixtures under the same
Scruple expectations. Speed and cost need more care.

Throughput is **observed under different deployment and concurrency settings**, not an equal-concurrency
hardware benchmark. Jev's 188.89 cases/s was observed at concurrency 64. The Clef values are each the
best clean sustained benchmark result at concurrency 4. Decider's 28.665 cases/s was observed at
concurrency 1 on one A100. Hosted server hardware and load are not controlled, and raising concurrency
changes throughput and individual request latency. Use these figures to understand the recorded
deployments, not to infer which model would win on identical hardware.

The cost figures also have different boundaries. Jev, Clef, and Clef-flash are estimated model or API
usage costs for the full evaluation. Decider's approximately $0.32 is the infrastructure run cost for
the self-hosted A100 workload. It is not a model usage fee, and utilization, startup, idle time, and
cloud provider pricing can materially change it.

For benchmark commands and smaller controlled comparisons, see [Benchmarks](../reference/benchmarks.md).
