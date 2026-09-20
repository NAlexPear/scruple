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

Candidates contain bounded local evidence with explicit completeness metadata. Imports and calls
are capped deterministically, and oversized functions or route handlers are skipped; the same
limits apply to call-level `no-ignored-significant-results` candidates. Re-exports, mounted
routers, class visibility, call graphs, global middleware, and behavior in unresolved helpers are
not inferred from a single file. By default, functions and handlers over 12,000 characters are
skipped. These limits keep selection deterministic and make missing evidence an explicit
`insufficient_context` decision rather than a guessed diagnostic.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
