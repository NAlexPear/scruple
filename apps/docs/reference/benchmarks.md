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
```

The JSON report includes every measured case, full provider answers, whether each answer and final rule result matched, cases where the rule declined to decide, run times, case latency, throughput, token usage, selected model, and information about the client machine. Warmup work is not included in the totals.

The hosted runs require API keys. The static tools have their own installation requirements. See each runner's README for setup details:

- [Jev](https://github.com/NAlexPear/scruple/blob/main/benchmarks/README.md)
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
- [Jev 1.13.0](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/jev-1.13.0/2026-09-20)
- [Jev 1.13.0 after rule calibration](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/jev-1.13.0/2026-09-20-post-calibration)

The equal-size directory contains a raw report for every tool in the comparison.
