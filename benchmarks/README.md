# Scruple provider benchmark

This benchmark runs the same versioned semantic-rule workload against Jev, Laya, or both. It measures Scruple end to end, including parsing, candidate collection, provider requests, and diagnosis.

The default workload selects ten cases from `tests/eval-fixtures.json`. Its IDs are pinned in `fixtures.json` so correctness-corpus growth does not silently change benchmark results.

## Run Jev

```sh
TYPESAFE_API_KEY=your-key pnpm benchmark --provider jev > jev-benchmark.json
```

Jev is a hosted service. The report records input and output token counts but does not estimate a bill because provider pricing can change.

## Run Laya

Point `LAYA_PYTHON` at a uv-managed Python environment containing Laya:

```sh
uv init --bare /tmp/scruple-laya
uv add --project /tmp/scruple-laya laya
LAYA_PYTHON=/tmp/scruple-laya/.venv/bin/python \
  pnpm benchmark --provider laya > laya-benchmark.json
```

Set `LAYA_DEVICE` if Laya should use a specific device. Laya results depend on the local model, device, and hardware, all of which should accompany published results.

## Compare providers in one run

```sh
TYPESAFE_API_KEY=your-key \
LAYA_PYTHON=/path/to/laya-project/.venv/bin/python \
pnpm benchmark \
  --provider jev \
  --provider laya \
  --model jev-1.13.0 \
  --model auto \
  > benchmark.json
```

Provider/model pairs run one after another so they do not compete for local resources. Each pair gets one unmeasured warmup and three measured repetitions by default. Cases run one at a time unless `--concurrency` is set.

The JSON report includes:

- Runtime, operating system, CPU, memory, and workload IDs
- Raw per-case results for every measured repetition
- Mean, p50, and p95 wall time and case latency
- End-to-end cases per second
- Model calls and input/output token totals
- Correctness failures and resolved model names

Warmup work is excluded from measured samples and token totals. Keep workload, model, concurrency, warmups, repetitions, and environment identical when comparing results. A local Laya run and hosted Jev run measure different deployment choices, so report them separately rather than presenting one universal winner.
