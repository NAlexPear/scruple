# Decider provider

`@scruple/provider-decider` sends bounded code evidence and fixed questions to a local or self-hosted
[Decider](https://github.com/Mapika/decider) server. Decider supports the same choice, score, and noul
question shapes as Jev, so Scruple rules do not need model-specific question logic.

## Start Decider

Follow Decider's hardware and installation instructions, then serve the current 4B checkpoint:

```sh
scripts/serve.sh Mapika/decider-4b 8000
```

Wait for `GET /health` to report `ok: true` before running Scruple.

## Configure Scruple

```sh
pnpm add --save-dev @scruple/provider-decider
```

```ts
import { deciderProvider } from "@scruple/provider-decider";

const provider = deciderProvider();
```

## Options

| Option        | Default                   | Purpose                                  |
| ------------- | ------------------------- | ---------------------------------------- |
| `baseURL`     | `"http://127.0.0.1:8000"` | Decider server or authenticating proxy   |
| `model`       | `"decider-4b-v2.1"`       | Provider ID and request model value      |
| `apiKey`      | `"local"`                 | Bearer token for an authenticating proxy |
| `concurrency` | `32`                      | Maximum simultaneous provider requests   |
| `timeoutMs`   | `30000`                   | Request timeout in milliseconds          |
| `maxRetries`  | `0`                       | SDK retry count                          |
| `fetch`       | Runtime fetch             | Custom fetch implementation              |

Decider's standard server ignores the request's model value and reports the checkpoint it actually
loaded. Keep the configured model aligned with that checkpoint because Scruple uses it in the provider's
decision-cache namespace.

Decider does not authenticate its standard HTTP server. Keep it on a trusted network or put an
authenticating TLS proxy in front of it. The provider sends `apiKey` as a bearer token for such a proxy.

The provider disables retries by default because cancelling an HTTP request does not remove work already
queued by Decider's standard server. Retrying a timed-out request could therefore duplicate model work.

See the [benchmark results](../reference/benchmarks.md#decider-4b-on-apple-mps) for the recorded Decider 4B
v2.1 label, diagnostic, strict-agreement, latency, and throughput measurements on Apple MPS.
