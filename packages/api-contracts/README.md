# @scruple/api-contracts

Semantic rules for function and API contracts, packaged as plugins for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/api-contracts
```

```ts
import { apiContracts } from "@scruple/api-contracts";

plugins: { "api-contracts": apiContracts() };
```

The package reviews bounded exported-function contracts and normalized explicit Fastify or Express
routes. Route rules cover runtime input validation, requested side effects in safe HTTP methods, and
explicit statuses that contradict visible outcomes. Dynamic, mounted, or cross-file routing remains
outside the current evidence boundary.

The initial rules are deliberately evidence-bounded:

- `no-misleading-function-names` checks named implementation functions, but abstains when a name is
  domain-specific or the visible body does not establish its meaning.
- `no-ambiguous-failure-contracts` checks only directly exported function declarations and directly
  exported function-valued variables.
- `require-input-validation` prefers normalized route boundaries and retains an exported-function
  fallback for explicit raw, unknown, or webhook inputs.
- `no-side-effects-in-safe-http-methods` distinguishes requested domain changes from incidental
  logging, telemetry, auditing, and cache maintenance.
- `no-misleading-http-status` compares explicit status exits with visible outcomes while allowing
  deliberate protocol and privacy policies.

Each rule examines a limited amount of code from one file. It records when imports, calls, or source
excerpts were cut short. The same limits apply to call-level `no-ignored-significant-results`
checks. By default, Scruple skips functions and route handlers longer than 12,000 characters.

These rules do not infer behavior from re-exports, mounted routers, global middleware, call graphs,
unresolved helpers, or class visibility in other files. When the available code is not enough to
decide, the provider can return `insufficient_context` instead of reporting a finding.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
