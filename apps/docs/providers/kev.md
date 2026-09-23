# Kev provider

`@scruple/provider-kev` sends bounded code evidence and fixed questions to a
[Kev](https://github.com/jaredpalmer/kev) server, which serves the System One API from open weights.
`kev.serve` binds to `127.0.0.1`, so evidence stays on your machine when you point `baseURL` at it.

```sh
uv run --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8008
```

```sh
pnpm add --save-dev @scruple/provider-kev
```

```ts
import { kevProvider } from "@scruple/provider-kev";

const provider = kevProvider({ baseURL: "http://127.0.0.1:8008", model: "kev-4b" });
```

## Options

| Option        | Default       | Purpose                                        |
| ------------- | ------------- | ---------------------------------------------- |
| `baseURL`     | Required      | Root of the Kev server                         |
| `apiKey`      | `"kev-local"` | Needed only when the server sets `KEV_API_KEY` |
| `model`       | Required      | Checkpoint the server loads with `--run`       |
| `concurrency` | `1`           | Maximum simultaneous provider requests         |
| `timeoutMs`   | `60000`       | Request timeout in milliseconds                |
| `maxRetries`  | `0`           | SDK retry count                                |
| `fetch`       | Runtime fetch | Custom fetch implementation                    |

The Kev server answers under whatever `model` it receives, and the provider `id` includes `model`.
Name the checkpoint you pass to `--run`, such as `kev-4b` for `jaredpalmer/kev-4b`, so cached
decisions from one checkpoint are never served for another.

## Results

These results were recorded on September 23, 2026, on an Apple M2 Max, against `kev.serve` with
Scruple's shared rule thresholds. Kev answers in one deterministic forward pass, so one repetition
is enough.

| Workload                                    | Kev 4B                      | Kev 9B                      |
| ------------------------------------------- | --------------------------- | --------------------------- |
| Held-out half of the eval corpus (93 cases) | 0.85 precision, 0.29 recall | 0.81 precision, 0.34 recall |
| Full eval corpus (187 cases)                | 0.91 precision, 0.26 recall | 0.90 precision, 0.33 recall |
| Pinned benchmark, 10 cases x 2, strict      | 4/20                        | 10/20                       |
| Pinned benchmark, p50 case latency          | 543 ms                      | 943 ms                      |

Kev usually picks the right label, 18/20 (4B) and 20/20 (9B) on the pinned benchmark, but with lower
probabilities than the thresholds expect. Most violations therefore go unreported. Latency is serial
at concurrency `1` on a shared machine, so treat it as an upper bound.

Kev's `confidence` for a choice is `(p_max - 1/K) / (1 - 1/K)` over `K` options, so `minConfidence`
removes more answers on questions with many options.

To use Kev for real findings, calibrate each rule's `threshold` against your own labeled examples, as
described in [configuration](../guide/configuration.md#warning-and-error-thresholds).
