# Scruple Jev benchmark

This benchmark runs a versioned semantic-rule workload against Jev. It measures Scruple end to end, including parsing, candidate collection, provider requests, and diagnosis.

The default workload selects ten cases from `tests/eval-fixtures.json`. Its IDs are pinned in `fixtures.json` so correctness-corpus growth does not silently change benchmark results.

## Run the benchmark

```sh
TYPESAFE_API_KEY=your-key pnpm benchmark > jev-benchmark.json
```

Jev is a hosted service. The report records input and output token counts but does not estimate a bill because provider pricing can change.

To compare Jev models on the same workload, repeat `--model`:

```sh
TYPESAFE_API_KEY=your-key pnpm benchmark \
  --model jev-1.13.0 --model jev-latest > jev-models.json
```

Models run one after another. Each model gets one unmeasured warmup and three measured repetitions by default. Cases run one at a time unless `--concurrency` is set.

Use `--workload-size` to cycle the selected fixtures into a larger sustained workload:

```sh
TYPESAFE_API_KEY=your-key pnpm benchmark \
  --workload-size 128 --warmups 2 --repetitions 20 --concurrency 64 \
  > jev-sustained.json
```

The JSON report includes:

- Runtime, operating system, CPU, memory, and workload IDs
- Raw per-case results for every measured repetition
- Mean, p50, and p95 wall time and case latency
- End-to-end cases per second
- Model calls and input/output token totals
- Correctness failures and resolved model names

Warmup work is excluded from measured samples and token totals. Keep workload, concurrency, warmups, repetitions, and environment identical when comparing models.
