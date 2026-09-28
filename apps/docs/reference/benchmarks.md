# Benchmarks

Scruple's comparison uses ten pinned code examples, one for every built-in plugin. Each tool gets the same ten examples twice, for 20 measured case evaluations. Repeating a case does not make it a new code pattern.

These are small, fixed tests. They do not measure general code quality. A case is **unsupported** when a tool has no rule for that kind of problem. Unsupported cases stay in the scanner input, but they are not counted as misses.

Scruple counts a case as a strict match only when Jev chooses the expected answer and the rule reports, accepts, or declines the case as expected. The direct GPT-4.1 run checks the answer alone because it does not run Scruple's rule thresholds.

## Equal-size comparison

These results were recorded on September 20, 2026. Each completed run used 10 fixtures and 2 repetitions.

| Tool                      | Coverage of the 10 task types                  | Measured result                  | Measured speed                                             |
| ------------------------- | ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| Scruple with Jev 1.13.0   | All 10 evaluated                               | 20/20 strict matches             | 14.14 cases/s at concurrency 2                             |
| Direct GPT-4.1 prompt     | All 10 evaluated                               | 20/20 correct                    | 1.74 cases/s at concurrency 2                              |
| Semgrep Community Edition | 0 native; 5 narrow custom rules; 5 unsupported | Custom rules: 10/10 correct      | 1.629 s per custom scan; 2.842 s per official-default scan |
| CodeQL CLI                | 2 native; 1 narrow custom query; 7 unsupported | Native: 2/4; custom: 2/2 correct | 8.615 s setup; 20.396 s official or 4.566 s custom scan    |
| SonarQube Community Build | 1 native; 9 unsupported                        | Native rule: 0/2 correct         | 19.800 s per end-to-end scan                               |

Jev and GPT-4.1 both answered all 20 cases correctly. Jev also matched Scruple's expected rule behavior and processed the cases about 8 times faster at the same concurrency. Semgrep and CodeQL covered fewer kinds of problem. The extra rules written for this test only look for narrow code shapes. They do not make the same judgments as Scruple.

SonarQube scanned all ten fixtures twice. Its one applicable native rule missed the expected issue in both scans. The scanner completed without errors and reported no issues.

The runs used different machines. Jev and GPT-4.1 ran on the same machine, but the static tools did not. Their times show how long each recorded workflow took, not which tool would be fastest on identical hardware.

## Cost estimates

API and license costs are separate from the computer used to run each tool. Runner prices vary, so this page reports measured time instead of inventing a compute price.

| Tool                      | API or software cost for the measured run                                                                                                            | Other cost                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Scruple with Jev          | Scruple is MIT licensed. Jev cost **$0.000661** for 20 cases, or **$0.0000330 per case**                                                             | A small client runner                              |
| Direct GPT-4.1 prompt     | **$0.032548** for 20 cases, or **$0.00163 per case**                                                                                                 | A small client runner                              |
| Semgrep Community Edition | **$0 software charge**                                                                                                                               | Local compute for about 1.6 to 2.8 seconds per run |
| CodeQL CLI                | **$0 license charge for public repositories**. Private organizational repositories require an eligible GitHub plan and GitHub Code Security license. | Local compute for database creation and analysis   |
| SonarQube Community Build | **$0 software charge**                                                                                                                               | A Docker host; about 19.8 seconds per scan         |

Jev 1.13 costs $0.042 per million input tokens, with output tokens free. The equal-size run used 15,738 input tokens:

15,738 × $0.042 ÷ 1,000,000 = **$0.000660996**

GPT-4.1 costs $2.00 per million input tokens and $8.00 per million output tokens. The run used 10,338 input tokens and 1,484 output tokens:

(10,338 × $2 ÷ 1,000,000) + (1,484 × $8 ÷ 1,000,000) = **$0.032548**

These estimates exclude the unmeasured warmup, taxes, and account discounts. In these runs, Jev cost about 50 times less per case than GPT-4.1. Prices can change. Check the current [Jev pricing](https://docs.typesafe.ai/models), [GPT-4.1 pricing](https://developers.openai.com/api/docs/models/gpt-4.1), [Semgrep Community Edition](https://semgrep.dev/products/community-edition), [CodeQL license terms](https://docs.github.com/en/code-security/codeql-cli/about-the-codeql-cli), and [SonarQube plans](https://www.sonarsource.com/plans-and-pricing/) before comparing costs.

## Jev under sustained load

We ran Jev `1.13.0` with 128 cases per repetition. Concurrency `64` gave the best balance of speed and response time.

After making three rule questions more direct, we repeated the concurrency-64 run on Scruple commit [`2c9a573`](https://github.com/NAlexPear/scruple/commit/2c9a5732bcc715c0f6f52ed3d053660f0506a835). All 2,560 cases matched their expected answers and rule behavior. The run averaged 231.3 cases per second, with mean case time of 173 ms and p95 case time of 281 ms.

::: tip Practical setting
Use Jev's default concurrency of `64` for sustained workloads. Concurrency `128` completed slightly more work per second, but individual cases took much longer and results varied more between runs.
:::

| Concurrency | Cases per second | Mean case time | p95 case time |
| ----------: | ---------------: | -------------: | ------------: |
|          10 |             64.2 |         147 ms |        253 ms |
|          16 |             89.6 |         159 ms |        273 ms |
|          32 |            159.9 |         158 ms |        275 ms |
|      **64** |        **229.5** |     **170 ms** |    **279 ms** |
|         128 |            248.4 |         252 ms |        381 ms |

Moving from concurrency `64` to `128` increased throughput by 8.2%. Mean case time increased by 48.2%, and p95 case time increased by 36.6%.

The table preserves the original concurrency sweep from Scruple commit [`02bd7b7`](https://github.com/NAlexPear/scruple/commit/02bd7b7eb055eb1b059b19961b767f37c767e0af). Every level used two unmeasured warmups and twenty measured repetitions, for 2,560 measured cases on Node.js 26.8.2 and Linux x64. The post-calibration run repeated concurrency 64 with the same workload and run counts on a four-CPU client. Jev performed the model work on its hosted service.

### What changed after the first run

The first run exposed three different problems that one correctness percentage hid:

- The async rule chose the right answer but scored it below the threshold needed to report a finding.
- The database-join rule chose the right answer but sometimes placed its probability near the threshold.
- The redacted-token case often chose the wrong answer, while low confidence still prevented a false warning.

The rules now ask more direct questions about code that can run at the same time, database-only key matching, and values visible in logs. New counterexamples cover missing concurrency guarantees, application-only decryption, mixed redacted and raw secrets, and harmless token-count metrics. Across those three rules, 19 fixtures over five measured repetitions produced 95/95 strict matches, including 10 cases where the rule correctly declined to decide. This is evidence for these fixed examples, not a claim that the rules are perfect on unseen code.

## Decider 4B on Apple MPS

We ran Decider 4B v2.1 locally on an Apple M5 Max using MPS. The run used the same ten pinned fixtures, one unmeasured warmup, and three measured repetitions at each concurrency. That is 10 unique fixtures repeated three times, not 30 independent examples.

| Concurrency | Label agreement | Diagnostic agreement | Strict agreement | Mean case time | Cases per second |
| ----------: | --------------: | -------------------: | ---------------: | -------------: | ---------------: |
|           1 |   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |         168 ms |            5.967 |
|           2 |   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |         348 ms |            5.399 |
|           4 |   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |         680 ms |            5.128 |

Label agreement checks the answer before rule thresholds. Diagnostic agreement checks whether Scruple reported or suppressed a finding as expected. Strict agreement requires the expected label, diagnostic behavior, candidate count, and abstention behavior together. The results were stable across repetitions: 9 of the 10 unique fixtures had the expected label, 6 had the expected diagnostic outcome, and 5 were strict matches.

The probability and confidence thresholds stayed fixed for like-for-like comparison with other models. Four fixtures had the expected label but did not clear the threshold needed to report a finding. One fixture had the wrong label but still produced the expected no-diagnostic outcome because confidence was too low to report it. The MPS path used fp16, while Decider's published calibration reference uses bf16.

Concurrency 1 was fastest for this local workload. Do not compare its throughput directly with hosted Jev throughput. The Decider result used one Apple MPS machine; Jev runs on hosted hardware whose serving configuration is not part of this benchmark.

### Paired MPS and CUDA run

We repeated concurrency 1 on MPS and an NVIDIA A100 with shared-prefix execution disabled and maximum batch 1. Both sides used the same Scruple, Decider, and model revisions; fixtures; prompts; temperatures; thresholds; warmup; and repetitions. MPS used fp16 and eager forwards. CUDA used bf16 and graph replay.

| Device                          | Label agreement | Diagnostic agreement | Strict agreement | Mean case time | p95 case time | Cases per second |
| ------------------------------- | --------------: | -------------------: | ---------------: | -------------: | ------------: | ---------------: |
| Apple M5 Max MPS fp16           |   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |      173.58 ms |     211.78 ms |            5.761 |
| NVIDIA A100-SXM4-80GB CUDA bf16 |   27/30 (90.0%) |        18/30 (60.0%) |    15/30 (50.0%) |       38.93 ms |      44.08 ms |           25.679 |

All 30 selected labels and thresholded outcomes matched between devices. Probability values were not bit-identical: the maximum absolute probability difference was 0.0114 and the maximum confidence difference was 0.0152. None crossed a fixed rule threshold. CUDA delivered 4.458 times the MPS throughput in this run. That result describes these machines and serving paths; it is not a general hardware ranking.

## How the comparisons work

The workload IDs are pinned in [`benchmarks/fixtures.json`](https://github.com/NAlexPear/scruple/blob/main/benchmarks/fixtures.json).

- **Scruple with Jev** parses each example, collects evidence, calls Jev, and applies the rule's threshold.
- **Direct GPT-4.1** receives the same selected evidence and question, but bypasses Scruple's provider and diagnosis code.
- **Semgrep** scans all ten files once per repetition. Its official `p/default` profile and five benchmark-owned rules run separately.
- **CodeQL** builds one database from all ten files. Its official JavaScript suite and one benchmark-owned query run separately.
- **SonarQube** is configured to scan all ten files once per repetition. The scanner includes unsupported files, but only its one applicable rule counts toward accuracy.

The case counts match, but the tools still do different work. Jev and GPT-4.1 receive small, selected inputs. Semgrep and CodeQL parse a set of files. SonarQube runs a client-server workflow. The timings describe those workflows. They do not isolate model compute or prove that one tool can replace another.

## Run the equal-size comparison

Each command below uses one warmup and two measured repetitions. Every completed run therefore handles 20 case evaluations.

```sh
pnpm benchmark \
  --model jev-1.13.0 \
  --warmups 1 \
  --repetitions 2 \
  --concurrency 2 \
  > jev.json

pnpm benchmark-llm \
  --warmups 1 \
  --repetitions 2 \
  --concurrency 2 \
  > gpt.json

pnpm benchmark-semgrep --warmups 1 --repetitions 2 > semgrep.json
pnpm benchmark-codeql --warmups 1 --repetitions 2 > codeql.json
pnpm benchmark-sonarqube --warmups 1 --repetitions 2 > sonarqube.json

# Cache behavior uses a local provider and needs no API key.
pnpm benchmark-cache --warmups 1 --repetitions 2 > cache.json
```

The JSON report includes every measured case, full provider answers, whether each answer and final rule result matched, cases where the rule declined to decide, run times, case latency, throughput, token usage, selected model, and information about the client machine. Warmup work is not included in the totals.

The model-quality benchmarks do not use the decision cache. Every measured case reaches the selected
model, so saved answers cannot make an accuracy or latency result look better.

## Benchmark the decision cache

The cache benchmark uses a local provider with a fixed delay. It needs no API key and does not measure
model quality or internet latency.

```sh
pnpm benchmark-cache > cache.json
```

Each measured cycle runs the same unique requests four ways:

1. **Uncached** provides the baseline.
2. **Cold** writes every response to an empty cache.
3. **Warm** reads every response from that cache without calling the provider.
4. **Incremental** changes one source file and checks that only its request misses.

This is the same `benchmark-cache` command listed with the regular benchmark commands above. The report
includes mean, p50, and p95 time for each scenario, cache hits, provider calls, token counts, cache entry
counts and bytes, warm-run savings, and cold-cache overhead. It also checks that cached and uncached runs
produce the same diagnostics. Change workload size, repetitions, concurrency, or simulated provider delay
with `--workload-size`, `--repetitions`, `--concurrency`, and `--provider-delay-ms`. Use `--warmups` to
change the number of unmeasured cycles.

The hosted runs require API keys. The static tools have their own installation requirements. See each runner's README for setup details:

- [Jev](https://github.com/NAlexPear/scruple/blob/main/benchmarks/README.md)
- [Decider](https://github.com/NAlexPear/scruple/blob/main/apps/docs/providers/decider.md)
- [Direct hosted LLM](https://github.com/NAlexPear/scruple/blob/main/benchmarks/llm-README.md)
- [Semgrep](https://github.com/NAlexPear/scruple/blob/main/benchmarks/semgrep/README.md)
- [CodeQL](https://github.com/NAlexPear/scruple/blob/main/benchmarks/codeql/README.md)
- [SonarQube](https://github.com/NAlexPear/scruple/blob/main/benchmarks/sonarqube/README.md)

## Read the numbers carefully

These results describe specific versions, workloads, dates, and machines. They are not service guarantees. Network conditions, hosted service load, rule updates, and machine size can change the results.

The ten examples are intentionally small. They test the behavior pinned in this repository, not general code quality or broad review skill. Each result set repeats the same examples twice.

The Jev benchmark cannot separate internet travel time from work inside Jev. Scruple's local engine and HTTP client were much faster in local controls, but Jev does not currently expose enough timing detail to divide remote time further.

## Saved data

- [Equal-size comparison](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/comparison/2026-09-20)
- [Decider 4B v2.1 on Apple MPS](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/decider-4b-v2.1/2026-09-26-apple-mps)
- [Decider 4B v2.1 on NVIDIA A100 CUDA](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/decider-4b-v2.1/2026-09-26-nvidia-a100-cuda)
- [Jev 1.13.0](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/jev-1.13.0/2026-09-20)
- [Jev 1.13.0 after rule calibration](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/jev-1.13.0/2026-09-20-post-calibration)

The equal-size directory contains a raw report for every tool in the comparison.
