# Scruple benchmarks

Scruple's own engine has two benchmark commands:

- `pnpm benchmark` measures rule accuracy and speed against Jev. It requires a Typesafe API key and
  always calls the model.
- `pnpm benchmark-cache` measures uncached, cold-cache, warm-cache, and one-file-change runs. It uses
  a local fixed-delay provider, so it needs no API key.

## Benchmark Scruple with Jev

This benchmark runs a versioned semantic-rule workload against Jev. It measures Scruple end to end, including parsing, candidate collection, provider requests, and diagnosis.

The default workload selects ten cases from `tests/eval-fixtures.json`. Its IDs are pinned in `fixtures.json` so correctness-corpus growth does not silently change benchmark results.

## Run the benchmark

```sh
TYPESAFE_API_KEY=your-key pnpm benchmark > jev-benchmark.json
```

Jev is a hosted service. [Current model pricing](https://docs.typesafe.ai/models) is $0.042 per million input tokens for Jev 1.13, with output tokens free. The report records input and output token counts so costs can be recalculated if pricing changes.

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
- Label agreement before thresholds
- User-visible diagnostic agreement after thresholds
- Expected and actual abstentions
- Strict agreement across labels, diagnostics, candidate selection, and abstentions
- Full provider answers, including probabilities and confidence, for each case
- Strict failures and resolved model names

Warmup work is excluded from measured samples and token totals. Keep workload, concurrency, warmups, repetitions, and environment identical when comparing models.

This model-quality benchmark deliberately bypasses the decision cache so every case reaches Jev.
Use the separate local cache benchmark to compare uncached, cold, warm, and one-file-change runs:

```sh
pnpm benchmark-cache > cache-benchmark.json
```

The cache benchmark uses a deterministic delayed provider and does not require an API key. It reports
mean, p50, and p95 run time; provider calls; cache hits; token savings; cache entries and bytes; and
whether every scenario produced the same diagnostics. Run `pnpm benchmark-cache --help` to see its
workload, warmup, repetition, concurrency, and provider-delay controls.
