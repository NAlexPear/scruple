# Equal-size comparison from 2026-09-20

Each completed run used the ten fixtures in `benchmarks/fixtures.json`, one warmup, and two measured repetitions. This produced 20 measured case evaluations per run.

The source was exact commit `a10194e284159c3f79d64744f6a91207c14390b7`. Jev and GPT used concurrency 2.

## Saved reports

- `jev-1.13.0.json`: Scruple with Jev 1.13.0 at concurrency 2
- `openai-gpt-4.1.json`: direct GPT-4.1 at concurrency 2
- `semgrep-1.177.0.json`: official-default and benchmark-owned profiles
- `codeql-2.27.0.json`: official and benchmark-owned query groups
- `sonarqube-26.9.0.json`: SonarQube Community Build with all ten fixtures

Unsupported cases remain in each static scanner's input. They are excluded from accuracy and recall because those tools have no matching rule for the task.
