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
  "observability/require-stable-telemetry-names": "warn",
  "observability/no-duplicate-error-reporting": "warn",
},
```

The rules inspect statically recognizable JavaScript and TypeScript logging and telemetry calls
inside function bodies. They use bounded local source evidence and abstain when that evidence cannot
support a decision. Custom patterns are additive to the built-in sink set.

## Options and rule effects

All rules accept `threshold` and `minConfidence`; these affect only whether that rule emits a
diagnostic after classification. Sink options affect rules as follows:

| Option                                | Semantic kind                                     | Rules affected                                                                                             |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `loggingCallPatterns`                 | generic `log` (or built-in suffix classification) | `no-sensitive-logs`, `require-operation-context` when operational wording is visible                       |
| `errorLoggingCallPatterns`            | `error_log`                                       | `no-sensitive-logs`, `no-unactionable-errors`, `require-operation-context`, `no-duplicate-error-reporting` |
| `telemetryCallPatterns`               | generic `telemetry`                               | `no-sensitive-logs`, `require-operation-context` when operational wording is visible                       |
| `exceptionTelemetryCallPatterns`      | `exception_telemetry`                             | `no-sensitive-logs`, `no-unactionable-errors`, `require-operation-context`, `no-duplicate-error-reporting` |
| `telemetryNameCallPatterns`           | `telemetry_name`                                  | `no-sensitive-logs`, `require-operation-context`, `require-stable-telemetry-names`                         |
| `duplicateErrorReportingCallPatterns` | duplicate-reporting sink only                     | `no-duplicate-error-reporting`                                                                             |

Use the semantic error/exception options for opaque wrappers such as `audit.failed` or
`monitor.notice`; putting those names only in a generic option cannot establish their error
semantics. `no-duplicate-error-reporting` honors both semantic options and its dedicated option. It
still requires two direct references to the catch binding and abstains when aliasing hides exception
identity.

## Evidence budgets

Ordinary call candidates include at most 10 imports of 200 characters each, 2,000 call characters,
and 1,500 surrounding characters. Duplicate-reporting candidates additionally cap try/catch and
enclosing excerpts at 1,500/2,000/2,000 characters, reporting calls at 10 × 1,000 characters, and
exits at 10 × 500 characters. Candidate state records these deterministic budgets, source totals,
and per-section truncation metadata.

These rules are review aids, not a security control or a guarantee that logs are safe. They cannot
prove runtime values, redaction behavior inside helpers, logger configuration, or downstream data
handling. Top-level calls, computed callees, and unconfigured wrapper names are outside the initial
selection boundary. Use runtime redaction, access controls, retention policies, and secret scanning
as appropriate.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
