# OpenAI GPT-4.1 benchmark from 2026-09-20

This is a representative direct hosted-LLM run over the ten pinned Scruple benchmark tasks.

- Provider: OpenAI
- Model: `gpt-4.1-2025-04-14`
- Prompt: `scruple-direct-choice-v1`
- Temperature: 0
- Concurrency: 2
- Warmups: 1 unmeasured repetition
- Repetitions: 2 measured repetitions
- Measured cases: 20
- Taxonomy: 20 detected/correct, 0 applicable miss, 0 unsupported capability
- Correctness: 20/20 (100%)
- Recall over expected findings: 18/18 (100%)
- Abstentions: 0
- Operational errors: 0
- Latency: 1,001.20 ms mean, 983.01 ms p50, 1,276.16 ms p95
- Throughput: 1.94 cases per second
- Tokens: 10,362 input and 1,493 output

`report.json` contains per-case answers, rationales, timing, usage, task hashes, prompt text and hash, runtime environment, and exact run settings. The small pinned workload does not establish general code-review accuracy.
