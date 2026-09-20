# Jev provider

`@scruple/provider-jev` sends typed decision requests to Jev through `@typesafe-ai/sdk`. Each request contains the selected bounded code evidence and rule-defined questions. It travels to the hosted service over HTTPS. Hosted use may cost money according to the Jev service terms.

```sh
pnpm add --save-dev @scruple/provider-jev
```

```ts
import { jevProvider } from "@scruple/provider-jev";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) throw new Error("TYPESAFE_API_KEY is required");

const provider = jevProvider({ apiKey });
```

## Options

| Option        | Default        | Purpose                                |
| ------------- | -------------- | -------------------------------------- |
| `apiKey`      | Required       | Non-empty Jev API key                  |
| `model`       | `"jev-1.13.0"` | Model sent with each request           |
| `baseURL`     | SDK default    | Alternate API endpoint                 |
| `concurrency` | `64`           | Maximum simultaneous provider requests |
| `timeoutMs`   | `10000`        | Request timeout in milliseconds        |
| `maxRetries`  | `2`            | SDK retry count                        |
| `fetch`       | Runtime fetch  | Custom fetch implementation            |

The provider reports input and output token usage in Scruple's run statistics.

Review the Jev service's current data handling and billing terms before sending repository code. Scruple does not make claims here about service retention or model training.

## Performance

See the [benchmark results](../reference/benchmarks.md) for measured latency and throughput across concurrency levels. The current results support the default concurrency of `64` for sustained workloads.
