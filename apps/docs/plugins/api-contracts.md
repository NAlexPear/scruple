# API Contracts

`@scruple/api-contracts` provides provider-backed semantic checks for function and API contracts. Analysis is bounded to visible per-file evidence.

```sh
pnpm add -D @scruple/api-contracts
```

```ts
import { defineConfig } from "@scruple/core";
import { apiContracts } from "@scruple/api-contracts";

export default defineConfig({
  parser,
  provider,
  plugins: { "api-contracts": apiContracts() },
  rules: { "api-contracts/require-input-validation": "warn" },
});
```

| Rule                                                                                           | Checks                                 |
| ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`api-contracts/no-misleading-function-names`](#api-contractsno-misleading-function-names)     | Names that contradict visible behavior |
| [`api-contracts/no-ambiguous-failure-contracts`](#api-contractsno-ambiguous-failure-contracts) | Overlapping public failure channels    |
| [`api-contracts/require-input-validation`](#api-contractsrequire-input-validation)             | Unvalidated untrusted boundary input   |

## `api-contracts/no-misleading-function-names`

Checks named implementation functions, up to 12,000 characters, for a concrete promise in the name that visible behavior contradicts. Domain terminology, thin delegation, and hidden behavior cause abstention rather than a finding.

Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`.

## `api-contracts/no-ambiguous-failure-contracts`

Checks directly exported implementation functions for overlapping failure representations, such as nullable or sentinel returns mixed with result values or thrown errors, unless their roles are visibly distinct.

Options: `threshold` defaults to `0.8`; `minConfidence` defaults to `0.7`.

## `api-contracts/require-input-validation`

Checks directly exported functions that visibly form an untrusted boundary and use raw input without runtime validation. Type annotations alone are not validation. The rule abstains when the file does not establish that input is untrusted.

Options: `threshold` defaults to `0.85`; `minConfidence` defaults to `0.7`.

```ts
rules: {
  "api-contracts/require-input-validation": ["warn", { threshold: 0.9, minConfidence: 0.75 }],
}
```
