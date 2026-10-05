# Kev provider

`@scruple/provider-kev` sends bounded code evidence and fixed questions to a local or self-hosted
[Kev](https://github.com/jaredpalmer/kev) server. Kev is an open-weight family that implements the
System One `noul`, `choice`, and `score` protocol and is compatible with the official
[TypeSafe SDK](https://github.com/typesafe-ai/typesafe-sdk-js).

## Start Kev

Follow Kev's installation instructions and pin the checkpoint for reproducible decisions:

```sh
uv sync --extra serve
uv run --extra serve python -m kev.serve --run jaredpalmer/kev-4b@v1.0 --port 8009
```

The Kev 1.0 checkpoints are `jaredpalmer/kev-0.8b@v1.0`, `jaredpalmer/kev-4b@v1.0`,
`jaredpalmer/kev-9b@v1.0`, and `jaredpalmer/kev-27b@v1.0`. Checkpoint selection is a server startup
setting. The request model value is the `kev-latest` compatibility alias and does not select a
checkpoint.

Kev also publishes an official [Modal deployment skill](https://github.com/jaredpalmer/kev/tree/main/skills/kev-deploy)
for a scale-to-zero HTTPS endpoint.

## Choose a checkpoint

Start with 9B when label selection matters more than thresholded diagnostics, or 27B when diagnostic
quality is the priority and an A100-class GPU is available. The smaller checkpoints use less memory
but were substantially less accurate on Scruple's pinned workload.

| Checkpoint                  | Label / diagnostic / strict | A100 memory | Practical concurrency |
| --------------------------- | --------------------------- | ----------: | --------------------: |
| `jaredpalmer/kev-0.8b@v1.0` | 40% / 10% / 10%             |   5,286 MiB |   c4 (13.239 cases/s) |
| `jaredpalmer/kev-4b@v1.0`   | 80% / 20% / 20%             |  16,268 MiB |    c4 (8.711 cases/s) |
| `jaredpalmer/kev-9b@v1.0`   | 100% / 20% / 20%            |  23,454 MiB |    c4 (7.226 cases/s) |
| `jaredpalmer/kev-27b@v1.0`  | 100% / 80% / 80%            |  66,756 MiB |    c2 (3.150 cases/s) |

These are resident server-memory measurements on one NVIDIA A100 80GB PCIe. For 9B, c8 reached
7.517 cases/s but raised mean latency by 44% over c4 for only 4% more throughput, so c4 is the better
operating point. The 27B checkpoint saturated at c2. See the
[full latency and methodology results](../reference/benchmarks.md#kev-v10-on-nvidia-a100) before sizing
a deployment.

## Configure Scruple

```sh
pnpm add --save-dev @scruple/provider-kev
```

```ts
import { kevProvider } from "@scruple/provider-kev";

const provider = kevProvider({
  baseURL: process.env["KEV_BASE_URL"],
  apiKey: process.env["KEV_API_KEY"],
  checkpoint: "jaredpalmer/kev-4b@v1.0",
});
```

## Options

| Option        | Default                   | Purpose                                       |
| ------------- | ------------------------- | --------------------------------------------- |
| `baseURL`     | `"http://127.0.0.1:8009"` | Local or hosted Kev API root                  |
| `checkpoint`  | `"kev-latest"`            | Scruple decision-cache identity               |
| `apiKey`      | unset                     | Bearer token for `KEV_API_KEY` authentication |
| `concurrency` | `32`                      | Maximum simultaneous provider requests        |
| `timeoutMs`   | `60000`                   | Request timeout in milliseconds               |
| `fetch`       | Runtime fetch             | Custom fetch implementation                   |

Set `checkpoint` to the exact checkpoint loaded by the server. It changes the provider's cache
namespace but not the request: Kev's API accepts `kev-latest` as its Kev model alias regardless of the
checkpoint loaded at startup.

The provider preserves structured and scalar JSON values, reports Kev's input and output token
counts, and validates every named answer against the request. It follows HTTP redirects, including
the result URL that a cold Modal invocation can return.

Local Kev is open by default. Setting `KEV_API_KEY` on the server requires a matching bearer token;
the provider does not read credentials from ambient environment variables. Use HTTPS outside a
trusted local network. Caller cancellation aborts the HTTP request, but Kev does not guarantee that
already-queued model work stops. The provider does not retry requests for that reason. Increase the
timeout when a deployment's cold start exceeds one minute.

The provider uses runtime `fetch` and owns no persistent client resources, so it does not expose a
cleanup hook.

Kev is self-hosted. TypeSafe does not currently document Kev as a hosted `api.typesafe.ai` model, a
hosted Kev identifier, or hosted Kev pricing. Infrastructure and optional Modal costs belong to the
deployment; consult Kev's current deployment table and your infrastructure provider before use.

Kev-27B is validated to 65,536 state tokens. Kev-0.8B, Kev-4B, and Kev-9B accept that server limit but
are validated to 8,192 state tokens in Kev 1.0. The server rejects longer states with HTTP 422 unless
its explicit truncation option is enabled.
