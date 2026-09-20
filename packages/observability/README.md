# @scruple/observability

Advisory semantic rules for application logging and telemetry, packaged as a plugin for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/observability
```

```ts
import { observability } from "@scruple/observability";

plugins: { observability: observability() },
rules: {
  "observability/no-sensitive-logs": "error",
  "observability/no-unactionable-errors": "warn",
  "observability/require-operation-context": "warn",
},
```

The rules inspect statically recognizable JavaScript and TypeScript logging and telemetry calls
inside function bodies. They use bounded local source evidence and abstain when that evidence cannot
support a decision. Custom wrappers can be selected with `loggingCallPatterns` and
`telemetryCallPatterns` rule options.

These rules are review aids, not a security control or a guarantee that logs are safe. They cannot
prove runtime values, redaction behavior inside helpers, logger configuration, or downstream data
handling. Top-level calls, computed callees, and unconfigured wrapper names are outside the initial
selection boundary. Use runtime redaction, access controls, retention policies, and secret scanning
as appropriate.
