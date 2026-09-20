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

The initial rules are deliberately evidence-bounded:

- `no-misleading-function-names` checks named implementation functions, but abstains when a name is
  domain-specific or the visible body does not establish its meaning.
- `no-ambiguous-failure-contracts` checks only directly exported function declarations and directly
  exported function-valued variables.
- `require-input-validation` uses the same directly exported subset and reports only when the
  visible function establishes an untrusted boundary and lacks visible runtime validation.

Each candidate contains imports, the function body and calls, a bounded surrounding excerpt, and
the exact export evidence when applicable. Re-exports, class visibility, call graphs, middleware,
and validation performed by callers are not inferred from a single file. Large functions over
12,000 characters are skipped. These limits keep selection deterministic and make missing evidence
an explicit `insufficient_context` decision rather than a guessed diagnostic.
