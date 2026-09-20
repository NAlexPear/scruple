# Configuration

`@scruple/configuration` provides provider-backed semantic checks around environment reads from Node.js, Vite, Deno, and Bun APIs.

```sh
pnpm add -D @scruple/configuration
```

```ts
import { defineConfig } from "@scruple/core";
import { configuration } from "@scruple/configuration";

export default defineConfig({
  parser,
  provider,
  plugins: { configuration: configuration() },
  rules: { "configuration/require-environment-validation": "warn" },
});
```

| Rule                                                                                             | Checks                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| [`configuration/no-insecure-production-defaults`](#configurationno-insecure-production-defaults) | Insecure production-reachable fallbacks    |
| [`configuration/require-environment-validation`](#configurationrequire-environment-validation)   | Environment values used without validation |

Each environment read is evaluated with a bounded same-file excerpt.

## `configuration/no-insecure-production-defaults`

Requires visible evidence both that a fallback has an insecure security effect and that it is reachable in production. Development-only weak defaults are accepted. Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`.

## `configuration/require-environment-validation`

Checks that presence, type, format, range, or allowed values are validated before application use. Type assertions, fallback values, and parsing alone do not count. Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`.

```ts
rules: {
  "configuration/require-environment-validation": ["warn", { minConfidence: 0.8 }],
}
```
