# HTTP Clients

`@scruple/http-clients` provides provider-backed semantic checks for built-in `fetch`, imported `fetch` from `node-fetch` or `undici`, Axios, visible Axios instances, and configured client names.

```sh
pnpm add -D @scruple/http-clients
```

```ts
import { defineConfig } from "@scruple/core";
import { httpClients } from "@scruple/http-clients";

export default defineConfig({
  parser,
  provider,
  plugins: { "http-clients": httpClients() },
  rules: { "http-clients/require-timeout": "warn" },
});
```

| Rule                                                                                   | Checks                                                   |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`http-clients/require-timeout`](#http-clientsrequire-timeout)                         | Requests without a finite deadline                       |
| [`http-clients/require-response-validation`](#http-clientsrequire-response-validation) | Structured response data used without runtime validation |
| [`http-clients/no-unbounded-retries`](#http-clientsno-unbounded-retries)               | Retry behavior without a finite bound                    |

All rules use the same options. `threshold` defaults to `0.85`, `minConfidence` to `0.7`, `recognizedClients` to `[]`, `maxFunctionCharacters` to `12000`, and `maxContextCharacters` to `4000`. Oversized functions are skipped. A recognized client has an exact `name`, `kind` (`"fetch"` or `"axios"`), and optional `guarantees` with `timeout`, `responseValidation`, or a finite non-negative `maxRetries`. Only `true` boolean guarantees and valid retry counts are retained.

```ts
rules: {
  "http-clients/require-timeout": ["warn", {
    recognizedClients: [{ name: "api", kind: "axios", guarantees: { timeout: true } }],
  }],
}
```

## `http-clients/require-timeout`

Accepts visible finite client or request timeouts, `AbortSignal.timeout(...)`, a visibly timeout-bearing composed signal, or a configured guarantee. An arbitrary abort signal is not a deadline.

## `http-clients/require-response-validation`

Checks structured deserialized responses used or returned as application data. Runtime schemas, decoders, assertions, and configured guarantees count; TypeScript casts, annotations, and Axios generics do not. Raw responses and text, binary, or status-only handling are excluded.

## `http-clients/no-unbounded-retries`

Only evaluates functions or visible client context with retry evidence, or clients with a `maxRetries` guarantee. It accepts finite attempts, finite loops, elapsed-time deadlines, bounded library options, and zero retries.
