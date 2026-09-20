# Observability

`@scruple/observability` checks logging and telemetry calls.

```sh
pnpm add -D @scruple/observability
```

```ts
import { defineConfig } from "@scruple/core";
import { observability } from "@scruple/observability";

export default defineConfig({
  parser,
  provider,
  plugins: { observability: observability() },
  rules: { "observability/no-sensitive-logs": "warn" },
});
```

| Rule                                                                                           | Checks                                             |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [`observability/no-sensitive-logs`](#observabilityno-sensitive-logs)                           | Sensitive values emitted without redaction         |
| [`observability/no-unactionable-errors`](#observabilityno-unactionable-errors)                 | Error events missing operation or failure evidence |
| [`observability/require-operation-context`](#observabilityrequire-operation-context)           | Events without a stable operation identity         |
| [`observability/require-stable-telemetry-names`](#observabilityrequire-stable-telemetry-names) | Dynamic event, span, or metric names               |
| [`observability/no-duplicate-error-reporting`](#observabilityno-duplicate-error-reporting)     | The same caught failure reported twice             |

All rules accept `threshold`, `minConfidence`, and custom call-pattern options. Custom patterns extend the built-in patterns. `minConfidence` defaults to `0.7`.

## `observability/no-sensitive-logs`

Reviews detected log and telemetry calls for visibly sensitive emitted values without effective masking, allowlisting, hashing for disclosure control, or redaction. `threshold` defaults to `0.9`.

## `observability/no-unactionable-errors`

Reviews only error/fatal logs and exception telemetry. An actionable event identifies the failed operation and preserves useful failure evidence. `threshold` defaults to `0.85`.

## `observability/require-operation-context`

Checks log and telemetry events other than `setAttribute` and `setAttributes` for a specific message or structured field naming the operation. IDs and status alone do not identify it. `threshold` defaults to `0.8`.

## `observability/require-stable-telemetry-names`

Reviews recognized event, span, and metric-name arguments for dynamic or unbounded values. Stable literals and visibly bounded route templates are accepted; unresolved constants and helpers cause abstention.

## `observability/no-duplicate-error-reporting`

Reviews catch handlers with at least two recognized reports that directly reference the same catch binding. Distinct errors and visible intentional dual-emission policy are accepted or abstained on.

```ts
rules: {
  "observability/no-sensitive-logs": ["warn", { loggingCallPatterns: [/^audit\.write$/u] }],
}
```
