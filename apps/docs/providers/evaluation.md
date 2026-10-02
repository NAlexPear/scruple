# Provider evaluation

These recorded results use specialized rule fixtures, not a maintained first-party rule distribution.
Scruple maintains eval tooling so downstream authors can measure their own language/framework rules.
The results below do not establish rule or model correctness for other languages; rerun representative
finding, safe, and abstention cases for each language and framework you support.

We evaluated eight provider and model choices against Scruple's full suite of 187 fixtures. **Jev
1.13 is the best default and the strongest overall choice:** it combines the highest strict
agreement, diagnostic agreement, recall, and F1 score with low hosted cost. Kev 27B v1.0 is the
strongest measured self-hosted quality option, while Decider remains the faster private option. The
other models remain useful when deployment location, privacy, speed, or marginal hosted cost matters
more than overall quality.

## Results at a glance

| Provider and model        |                Label |           Diagnostic |               Strict |   Precision |     Recall |         F1 |
| ------------------------- | -------------------: | -------------------: | -------------------: | ----------: | ---------: | ---------: |
| **Jev 1.13**              |     160/187 (85.56%) | **171/187 (91.44%)** | **148/187 (79.14%)** |      95.77% | **83.95%** | **89.47%** |
| **Cloudflare Clef**       | **165/187 (88.24%)** |     138/187 (73.80%) |     119/187 (63.64%) |      97.06% |     40.74% |     57.39% |
| **Kev 27B v1.0**          |     158/187 (84.49%) |     146/187 (78.07%) |     120/187 (64.17%) |      97.62% |     50.62% |     66.67% |
| **Decider 4B v2.1**       |     135/187 (72.19%) |     138/187 (73.80%) |     106/187 (56.68%) |      88.10% |     45.68% |     60.16% |
| **Cloudflare Clef-flash** |     141/187 (75.40%) |     122/187 (65.24%) |      93/187 (49.73%) |      86.36% |     23.46% |     36.89% |
| **Kev 9B v1.0**           |     140/187 (74.87%) |     116/187 (62.03%) |      84/187 (44.92%) |      91.67% |     13.58% |     23.66% |
| **Kev 4B v1.0**           |     129/187 (68.98%) |     111/187 (59.36%) |      77/187 (41.18%) | **100.00%** |      6.17% |     11.63% |
| **Kev 0.8B v1.0**         |      76/187 (40.64%) |     106/187 (56.68%) |      42/187 (22.46%) |         n/a |      0.00% |        n/a |

All eight full evaluations completed with zero provider or operational errors. Bold values mark the
strongest result in each directly comparable column. Kev 4B's perfect precision comes from five true
positives and no false positives; its low recall and F1 show why precision alone is not enough.
Jev has the lowest hosted estimate in this evaluation, while self-hosted infrastructure costs are a
different cost boundary and should not be ranked against hosted usage charges.

### Runtime and cost

| Provider and model        | Deployment / concurrency        |        Latency, mean / p50 / p95 | Observed throughput | Evaluation cost boundary                          |
| ------------------------- | ------------------------------- | -------------------------------: | ------------------: | ------------------------------------------------- |
| **Jev 1.13**              | Hosted API / 64                 |   233.954 / 127.070 / 507.669 ms |      188.89 cases/s | $0.005647236 hosted API estimate                  |
| **Cloudflare Clef**       | Cloudflare hosted API / 4       | 826.403 / 736.185 / 1,463.325 ms |       7.365 cases/s | $0.021449520 hosted model estimate                |
| **Kev 27B v1.0**          | Self-hosted A100 SXM4 80 GB / 1 |   330.227 / 280.290 / 679.031 ms |       3.021 cases/s | Part of ≤$0.491 shared infrastructure upper bound |
| **Decider 4B v2.1**       | Self-hosted A100 SXM4 80 GB / 1 |  **34.886 / 39.719 / 45.177 ms** |      28.665 cases/s | About $0.32 infrastructure run estimate           |
| **Cloudflare Clef-flash** | Cloudflare hosted API / 4       | 633.300 / 640.551 / 1,149.452 ms |      10.269 cases/s | $0.008043570 hosted model estimate                |
| **Kev 9B v1.0**           | Self-hosted A100 SXM4 80 GB / 1 |   136.292 / 105.879 / 310.283 ms |       7.293 cases/s | Part of ≤$0.491 shared infrastructure upper bound |
| **Kev 4B v1.0**           | Self-hosted A100 SXM4 80 GB / 1 |    125.208 / 88.852 / 306.697 ms |       7.933 cases/s | Part of ≤$0.491 shared infrastructure upper bound |
| **Kev 0.8B v1.0**         | Self-hosted A100 SXM4 80 GB / 1 |     83.190 / 48.579 / 230.053 ms |      11.903 cases/s | Part of ≤$0.491 shared infrastructure upper bound |

## How to choose

- **Use Jev 1.13 by default.** It is strongest overall and leads the measures closest to what users
  experience: diagnostic agreement, strict agreement, recall, and F1.
- **Use Kev 27B v1.0 when self-hosted quality is the priority.** It is the strongest measured
  self-hosted quality option. It narrowly exceeds Clef on strict agreement, recall, and F1, while
  Clef retains higher label agreement and managed Cloudflare hosting.
- **Use Cloudflare Clef when you want a Cloudflare-native hosted option.** It has the best raw label
  agreement and near-perfect precision, but its low recall makes it conservative: when it reports a
  finding it is usually right, but it misses many findings the suite expects.
- **Use Decider when you need fast, private, self-hosted decisions.** The A100 run has the lowest case
  latency by a wide margin and keeps evidence on infrastructure you control, though Kev 27B provides
  higher measured self-hosted quality.
- **Use Clef-flash only when lower Cloudflare model cost matters more than quality.** It costs less
  than Clef in this evaluation, but trails both full-size hosted choices on strict agreement, recall,
  and F1.
- **Treat the smaller Kev checkpoints as speed-for-quality tradeoffs, not Kev 27B equivalents.** They
  run faster than Kev 27B on the measured A100, but all three trail every non-Kev baseline on strict
  agreement and F1; Kev 0.8B reported no findings.

These recommendations describe this fixture suite and these model versions. Run representative cases
from your own code before treating the ranking as a guarantee for a different workload.

## Methodology

The suite contains 187 unique fixtures across Scruple's semantic rules. Each fixture includes source
code, the expected model choice, whether Scruple should emit a diagnostic, the expected candidate
count, and any expected abstention. Each provider and model processed the same full suite through
Scruple with the rules and thresholds held fixed. The model-quality runs bypassed the decision cache,
so every case reached the configured model. This is a complete run of Scruple's fixture suite, not a
claim that 187 fixtures represent every real-world codebase or workload.

The evaluation measures the complete Scruple decision path: parse the fixture, collect bounded
evidence, ask any collection and final decision questions, apply the rule's confidence threshold, and
produce or suppress a diagnostic. Results therefore describe each model as configured for Scruple,
not an isolated general-purpose model test.

Decider ran as `decider-4b-v2.1` in bf16 on an NVIDIA A100-SXM4-80GB. All four Kev checkpoints ran in
bf16 through the official `kev.serve` entry point on another NVIDIA A100-SXM4-80GB, using the torch
backend and its supported unfused fallback. Jev and both Clef models ran on their hosted services.
Costs use the measured run's usage or infrastructure time and the applicable price at evaluation
time; prices, account discounts, and infrastructure rates can change.

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
- **Cost** is the estimated spend for the boundary named in the table. Hosted estimates cover one
  pass over all 187 fixtures; infrastructure estimates can include setup and shared runtime.

## Comparability limits

Quality metrics are directly comparable because every model saw the same 187 fixtures under the same
Scruple expectations. Speed and cost need more care.

Throughput is **observed under different deployment and concurrency settings**, not an
equal-concurrency hardware benchmark. Kev and Decider were measured on self-hosted A100 SXM4 80 GB
GPUs at concurrency 1, in separate runs. Jev's hosted result used concurrency 64; the hosted Clef
results used concurrency 4. Hosted server hardware and load are not controlled, and raising
concurrency changes throughput and individual request latency. Use these figures to understand the
recorded deployments, not to infer which model would win on identical hardware.

The cost figures also have different boundaries. Jev, Clef, and Clef-flash are estimated model or API
usage costs for the full evaluation. Decider's approximately $0.32 is the infrastructure run cost for
its self-hosted A100 workload. Kev's $0.491 is a conservative Runpod rental upper bound covering pod
setup, downloads, and all four checkpoint runs, so it cannot be assigned to one Kev checkpoint.
Runpod rental is not API token pricing: utilization, startup, idle time, and cloud provider pricing can
materially change self-hosted cost.

For benchmark commands and smaller controlled comparisons, see [Benchmarks](../reference/benchmarks.md).
