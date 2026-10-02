# Scruple benchmarks

Scruple's own engine has two benchmark commands:

- `pnpm benchmark` measures rule accuracy and speed against Jev, Decider, Kev, or Cloudflare Clef. It
  always calls the model.
- `pnpm benchmark-cache` measures uncached, cold-cache, warm-cache, and one-file-change runs. It uses
  a local fixed-delay provider, so it needs no API key.

## Benchmark Scruple with a decision model

This benchmark runs a versioned semantic-rule workload against Jev, Decider, Kev, or Cloudflare Clef. It measures Scruple end to end, including parsing, candidate collection, provider requests, and diagnosis.

The default workload selects ten cases from `tests/eval-fixtures.json`. Its IDs are pinned in `fixtures.json` so correctness-corpus growth does not silently change benchmark results.

## Run the benchmark

```sh
TYPESAFE_API_KEY=your-key pnpm benchmark > jev-benchmark.json
```

Jev is a hosted service. [Current model pricing](https://docs.typesafe.ai/models) is $0.042 per million input tokens for Jev 1.13, with output tokens free. The report records input and output token counts so costs can be recalculated if pricing changes.

To benchmark a local Decider 4B v2.1 server against the same pinned workload:

```sh
pnpm benchmark --provider decider --base-url http://127.0.0.1:8000 \
  --model decider-4b-v2.1 > decider-benchmark.json
```

Start it with Decider's `scripts/serve.sh Mapika/decider-4b 8000` first. You can alternatively set
`DECIDER_BASE_URL` and, for an authenticating proxy, `DECIDER_API_KEY`.

To benchmark a self-hosted Kev checkpoint, start the server with the pinned checkpoint and pass the
same immutable identity to the benchmark cache namespace:

```sh
uv run --extra serve python -m kev.serve \
  --run jaredpalmer/kev-4b@v1.0 --port 8009

pnpm benchmark --provider kev --base-url http://127.0.0.1:8009 \
  --model jaredpalmer/kev-4b@v1.0 > kev-benchmark.json
```

The server request still uses Kev's `kev-latest` System One alias; `--model` identifies the weights
selected when the server started. Change the startup `--run` and benchmark `--model` together. The
released names are `jaredpalmer/kev-0.8b@v1.0`, `jaredpalmer/kev-4b@v1.0`,
`jaredpalmer/kev-9b@v1.0`, and `jaredpalmer/kev-27b@v1.0`. You can alternatively set `KEV_BASE_URL`
and `KEV_API_KEY`.

To compare model versions from the selected provider on the same workload, repeat `--model`:

```sh
TYPESAFE_API_KEY=your-key pnpm benchmark \
  --model jev-1.13.0 --model jev-latest > jev-models.json
```

Models run one after another. Each model gets one unmeasured warmup and three measured repetitions by default. Cases run one at a time unless `--concurrency` is set.

To compare Cloudflare's two Clef models through the `@scruple/provider-cloudflare` adapter:

```sh
CLOUDFLARE_ACCOUNT_ID=your-account-id \
CLOUDFLARE_API_TOKEN=your-token \
pnpm benchmark --provider cloudflare \
  --model clef --model clef-flash \
  --warmups 1 --repetitions 3 --concurrency 1 \
  > cloudflare-clef.json
```

Create the token from **Workers AI → Use REST API** in the Cloudflare dashboard. A manually created
token needs the account-level `Workers AI - Read` and `Workers AI - Edit` permissions. The account must
have Workers AI access and billing sufficient to invoke both models. Start at concurrency 1 for a fair
latency comparison and to stay well below account rate limits; run a separate, identical concurrency
sweep for throughput.

Cloudflare currently lists Clef at $0.24 per million input tokens and Clef-flash at $0.09 per million
input tokens, with no output-token price listed for either model. Estimate the measured marginal cost
from each run's `summary.usage.inputTokens`:

```text
Clef cost       = inputTokens × $0.24 ÷ 1,000,000
Clef-flash cost = inputTokens × $0.09 ÷ 1,000,000
```

Warmup usage is deliberately excluded from the report, so include one additional workload's token use
when estimating the full command cost. Check the current
[model pages](https://developers.cloudflare.com/workers-ai/models/clef/) and
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) before publishing
an estimate.

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

Published result data:

- [Decider 4B v2.1 on Apple MPS](results/decider-4b-v2.1/2026-09-26-apple-mps/)
- [Decider 4B v2.1 on NVIDIA A100 CUDA](results/decider-4b-v2.1/2026-09-26-nvidia-a100-cuda/)
- [Decider 4B v2.1 full corpus on NVIDIA A100 CUDA](results/decider-4b-v2.1/2026-10-01-nvidia-a100-cuda-eval/)
- [Kev v1.0 checkpoints on NVIDIA A100 CUDA](results/kev-v1.0/2026-10-02-nvidia-a100-cuda/)
- [Kev v1.0 full 187-fixture evaluation](results/kev-v1.0/2026-10-02-nvidia-a100-cuda-eval/)
- [Jev 1.13.0](results/jev-1.13.0/2026-09-20/)
- [Jev 1.13.0 after rule calibration](results/jev-1.13.0/2026-09-20-post-calibration/)

The Kev checkpoint benchmark repeats 10 pinned fixtures to compare concurrency and latency. Its
concurrency-1 results are the fair quality comparison because threshold-adjacent outcomes changed at
some higher concurrency levels. Use the separate 187-fixture evaluation for broader quality evidence.
Kev is self-hosted; its recorded $0.499 Runpod estimate was infrastructure cost, not hosted endpoint
or token pricing.

This model-quality benchmark deliberately bypasses the decision cache so every case reaches the provider.
Use the separate local cache benchmark to compare uncached, cold, warm, and one-file-change runs:

```sh
pnpm benchmark-cache > cache-benchmark.json
```

The cache benchmark uses a deterministic delayed provider and does not require an API key. It reports
mean, p50, and p95 run time; provider calls; cache hits; token savings; cache entries and bytes; and
whether every scenario produced the same diagnostics. Run `pnpm benchmark-cache --help` to see its
workload, warmup, repetition, concurrency, and provider-delay controls.

This measures Scruple's provider-independent decision cache, not a Cloudflare server-side cache. A warm
hit does not call `@scruple/provider-cloudflare`; its avoided calls and tokens can be priced with the
same formulas above. The current harness does not expose or claim a Cloudflare server-side cache metric.
