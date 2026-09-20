# Benchmarks

Scruple's benchmark suite uses ten pinned code examples, one for every built-in plugin. It measures Scruple with Jev, a direct hosted language model, and three static analysis tools. The static tools are included to show differences in scope as well as speed.

These are small comparison runs, not broad accuracy claims. A case is **unsupported** when a tool is not designed to answer that kind of question. Unsupported cases are reported separately and are not counted as misses.

## Results at a glance

All results below were recorded on September 20, 2026.

| Tool                      | Coverage of the 10 task types                  | Result on applicable cases                   | Measured speed                                                            |
| ------------------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| Scruple with Jev 1.13.0   | All 10 evaluated                               | 2,560/2,560 strict matches at concurrency 64 | 231.3 cases/s                                                             |
| Direct GPT-4.1 prompt     | All 10 evaluated                               | 20/20 correct                                | 1.94 cases/s at concurrency 2                                             |
| Semgrep Community Edition | 0 native; 5 narrow custom rules; 5 unsupported | Custom rules: 5/5 correct                    | 1.784 s for all 10 files; default rules: 3.084 s                          |
| CodeQL CLI                | 2 native; 1 narrow custom query; 7 unsupported | Native: 1/2 correct; custom: 1/1 correct     | 8.932 s database setup, then 20.145 s official or 5.372 s custom analysis |
| SonarQube Community Build | 1 native; 9 unsupported                        | Native: 0/1 correct                          | 52.380 s server setup, then 21.197 s for the one applicable file          |

The direct GPT-4.1 run answered every pinned label correctly, but it did not run Scruple's probability, confidence, or diagnostic thresholds. Scruple with Jev matched both labels and user-visible behavior on every measured case and handled about 119 times as many cases per second at concurrency 64. The three static tools had much narrower coverage. Their custom rules match exact code shapes and should not be read as equivalents to Scruple's semantic checks.

## Cost estimates

Costs separate API or license charges from the computer that runs the benchmark. Runner costs depend on where and how long you run each tool, so they are not assigned a made-up dollar value.

| Tool                      | API or software cost for the measured run                                                                                                            | Other cost                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Scruple with Jev          | Scruple is MIT licensed. Jev cost about **$0.0845** for 2,560 measured cases, or **$0.0000330 per case**                                             | A small client runner                                                                             |
| Direct GPT-4.1 prompt     | About **$0.0327** for 20 measured cases, or **$0.00163 per case**                                                                                    | A small client runner                                                                             |
| Semgrep Community Edition | **$0 software charge**                                                                                                                               | Local or CI compute for about 1.8 to 3.1 seconds per measured scan                                |
| CodeQL CLI                | **$0 license charge for public repositories**. Private organizational repositories require an eligible GitHub plan and GitHub Code Security license. | Local or CI compute for database creation and analysis                                            |
| SonarQube Community Build | **$0 software charge**                                                                                                                               | A Docker host for about 52.4 seconds of setup and 21.2 seconds per measured scan in this workflow |

The Jev estimate uses TypeSafe's published price of $0.042 per million input tokens, with output tokens free. The post-calibration concurrency-64 run used 2,012,580 input tokens:

2,012,580 × $0.042 ÷ 1,000,000 = **$0.08452836**

The GPT-4.1 estimate uses OpenAI's published price of $2.00 per million input tokens and $8.00 per million output tokens. The measured calls used 10,362 input and 1,493 output tokens:

(10,362 × $2 ÷ 1,000,000) + (1,493 × $8 ÷ 1,000,000) = **$0.032668**

These estimates exclude the unmeasured warmups, taxes, and any account discounts. At the published rates, the measured Jev API cost per case was about 49 times lower than the direct GPT-4.1 cost per case. Prices can change. Check the current [Jev pricing](https://docs.typesafe.ai/models), [GPT-4.1 pricing](https://developers.openai.com/api/docs/models/gpt-4.1), [Semgrep Community Edition](https://semgrep.dev/products/community-edition), [CodeQL license terms](https://docs.github.com/en/code-security/codeql-cli/about-the-codeql-cli), and [SonarQube plans](https://www.sonarsource.com/plans-and-pricing/) before making a purchasing decision.

## Jev under sustained load

We ran Jev `1.13.0` with 128 cases per repetition. Concurrency `64` gave the best balance of speed and response time.

After making three rule questions more literal, we repeated the concurrency-64 run on Scruple commit [`2c9a573`](https://github.com/NAlexPear/scruple/commit/2c9a5732bcc715c0f6f52ed3d053660f0506a835). All 2,560 cases matched their expected labels, diagnostics, candidate counts, and abstentions. The run averaged 231.3 cases per second, with mean case time of 173 ms and p95 case time of 281 ms.

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

- The async rule chose the right label but scored it below the rule's diagnostic thresholds.
- The database-join rule chose the right label but sometimes placed its probability near the threshold.
- The redacted-token case often chose the wrong label, while low confidence still prevented a false warning.

The rules now ask more direct questions about explicit concurrency evidence, database-only key matching, and visible log values. New counterexamples cover missing concurrency guarantees, application-only decryption, mixed redacted and raw secrets, and harmless token-count metrics. Across those three rules, 19 fixtures over five measured repetitions produced 95/95 strict matches, including 10 expected abstentions. This is evidence for these pinned examples, not a claim that the rules are perfect on unseen code.

## How the comparisons work

The workload IDs are pinned in [`benchmarks/fixtures.json`](https://github.com/NAlexPear/scruple/blob/main/benchmarks/fixtures.json).

- **Scruple with Jev** runs parsing, candidate collection, provider requests, and diagnosis. The sustained run repeats the ten cases to measure parallel throughput.
- **Direct GPT-4.1** receives the same selected evidence and fixed choice questions, but bypasses Scruple's provider and diagnosis engine. Its 20 measured cases are two repetitions of the base workload.
- **Semgrep** scans all ten fixture files. The official `p/default` profile and five benchmark-owned rules are reported separately.
- **CodeQL** builds one database from all ten files. Its official JavaScript security-and-quality suite and one benchmark-owned query are timed and scored separately.
- **SonarQube** scans only its one applicable fixture. Its timing includes scanner and Java startup, analysis, upload, server processing, quality-gate polling, and report retrieval. Server setup is reported separately.

The timings are not interchangeable. Jev and GPT-4.1 receive small, selected inputs. Semgrep and CodeQL parse a set of files. SonarQube runs a client-server workflow against one file. The results answer practical questions about each workflow, but they do not isolate model compute or prove that one tool can replace another.

## Run the Jev benchmark

Export a Jev API key, then choose a concurrency level:

```sh
export TYPESAFE_API_KEY=your-key

pnpm benchmark \
  --model jev-1.13.0 \
  --workload-size 128 \
  --warmups 2 \
  --repetitions 20 \
  --concurrency 64 \
  > benchmark.json
```

The JSON report includes every measured case, full provider answers, separate label and diagnostic agreement, abstentions, strict agreement, run times, case latency, throughput, token usage, selected model, and information about the client machine. Warmup work is not included in the totals.

The other runners and their exact setup steps are documented in the repository:

- [Direct hosted LLM](https://github.com/NAlexPear/scruple/blob/main/benchmarks/llm-README.md)
- [Semgrep](https://github.com/NAlexPear/scruple/blob/main/benchmarks/semgrep/README.md)
- [CodeQL](https://github.com/NAlexPear/scruple/blob/main/benchmarks/codeql/README.md)
- [SonarQube](https://github.com/NAlexPear/scruple/blob/main/benchmarks/sonarqube/README.md)

## Read the numbers carefully

These results describe specific versions, workloads, dates, and machines. They are not service guarantees. Network conditions, hosted service load, rule updates, and machine size can change the results.

The ten examples are intentionally small. They test the behavior pinned in this repository, not general code quality or broad review skill. The Jev run repeats those examples, so its 2,560 results are not 2,560 independent code patterns.

The Jev benchmark cannot separate internet travel time from work inside Jev. Scruple's local engine and HTTP client were much faster in local controls, but Jev does not currently expose enough timing detail to divide remote time further.

## Saved data

- [Jev 1.13.0](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/jev-1.13.0/2026-09-20)
- [Jev 1.13.0 after rule calibration](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/jev-1.13.0/2026-09-20-post-calibration)
- [GPT-4.1](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/openai-gpt-4.1-2025-04-14/2026-09-20)
- [CodeQL 2.27.0](https://github.com/NAlexPear/scruple/blob/main/benchmarks/codeql/results/codeql-2.27.0/2026-09-20.json)

The Semgrep and SonarQube benchmark documentation records the representative results and exact tool versions. Their runners emit complete JSON reports for new runs.
