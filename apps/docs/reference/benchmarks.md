# Benchmarks

Scruple includes a repeatable benchmark for measuring provider speed with real rules and source evidence. This page reports the latest saved Jev result.

## Current result

We ran Jev `1.13.0` on September 20, 2026. Concurrency `64` gave the best balance of speed and response time.

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

## What we measured

The base workload contains ten fixtures drawn from Scruple's evaluation corpus, with one fixture for every built-in plugin. The fixture IDs are pinned in [`benchmarks/fixtures.json`](https://github.com/NAlexPear/scruple/blob/main/benchmarks/fixtures.json).

For the sustained test, the benchmark cycled those ten fixtures in order until each repetition contained 128 cases. Every concurrency level used:

- Two unmeasured warmups
- Twenty measured repetitions
- 2,560 measured cases
- Jev `1.13.0`
- Scruple commit [`02bd7b7`](https://github.com/NAlexPear/scruple/commit/02bd7b7eb055eb1b059b19961b767f37c767e0af)
- Node.js 26.8.2 on Linux x64
- A client with two logical Intel Xeon CPUs and about 4 GB of memory

Jev performed the model work on its hosted service. The client hardware above ran Scruple and made the HTTPS requests.

## Run it yourself

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

The JSON report includes every measured case, run times, case latency, throughput, token usage, selected model, and information about the client machine. Warmup work is not included in the totals.

## Read the numbers carefully

These results describe one model, workload, date, and client location. They are not a service guarantee. Network conditions and hosted service load can change the result.

The repeated 128-case workload measures speed under load. It does not measure how many different code patterns Scruple understands. The reports record whether each fixture produced its expected result, but this small and uneven workload is not an accuracy score.

The benchmark also cannot separate internet travel time from work inside Jev. Scruple's local engine and HTTP client were much faster in local controls, but Jev does not currently expose enough timing detail to divide remote time further.

## Data

The [saved result](https://github.com/NAlexPear/scruple/tree/main/benchmarks/results/jev-1.13.0/2026-09-20) includes a compact summary and compressed raw reports for every concurrency level.
