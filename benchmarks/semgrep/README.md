# Semgrep comparison benchmark

This benchmark runs Semgrep against the same ten evaluation fixtures pinned in `benchmarks/fixtures.json`. It reports two profiles separately:

- `official-default` runs the official Semgrep Registry `p/default` ruleset. Findings from this profile represent default Registry coverage.
- `benchmark-owned` runs the local rules in `rules.yml`. These rules are narrow comparisons written for this benchmark. Their findings are not evidence of out-of-box Semgrep detection.

`cases.json` maps all ten fixtures. Five have a close enough structural analogue for a benchmark-owned rule. Five are marked `unsupported` because a local pattern would encode the fixture without establishing the semantic property Scruple evaluates. Each mapping includes a fingerprint over the fixture filename, source, Scruple rule ID, and expected result. Tests fail if a pinned fixture changes without review.

No official default rule matched the ten fixtures in the representative Semgrep 1.177.0 run on September 20, 2026. The official Registry ruleset changes over time, so every report records the Semgrep version, profile, process result, findings, and errors. Preserve a report when exact historical default coverage matters. The benchmark-owned rules and fixture mapping are repository-pinned.

## Install and run

Install the pinned CLI in an isolated environment:

```sh
uv tool install semgrep==1.177.0
```

Then run both profiles:

```sh
pnpm benchmark-semgrep > semgrep-benchmark.json
```

Each profile gets one unmeasured warmup and three measured runs by default. Use `--warmups` and `--repetitions` to change those counts. Use `--profile official-default` or `--profile benchmark-owned` to run one profile.

The command follows the official CLI guidance by using `semgrep scan`, `--config`, and `--json`. It disables Semgrep metrics and the version check. A scan finding does not make `semgrep scan` fail without `--error`, so the report records findings separately from process exit codes. See the [Semgrep CLI reference](https://semgrep.dev/docs/cli-reference) and [rule-running documentation](https://semgrep.dev/docs/running-rules).

## Measurement

Fixture loading, fingerprint validation, and temporary file creation happen before timing. Each measured sample is the wall time for a complete Semgrep subprocess, including configuration loading, parsing, analysis, and JSON serialization. The report contains:

- Warmup and measured wall times
- Finding counts and rule IDs by fixture
- Hits, misses, correct rejections, false positives, and unsupported cases
- Accuracy and recall over supported cases only, plus unsupported count, IDs, and reasons
- Process exit codes, signals, launch or JSON parse errors, and Semgrep-reported errors
- Semgrep, Node.js, operating system, architecture, CPU, memory, workload, and run settings

The official profile requires network access to resolve `p/default`. The benchmark-owned profile is fully local after Semgrep is installed.

A case is a `miss` only when an applicable rule is enabled and fails to report an expected issue. A case with no equivalent rule is `unsupported` and excluded from accuracy and recall. The official default and benchmark-owned profiles have independent denominators. This prevents custom rules from being presented as native Semgrep coverage.
