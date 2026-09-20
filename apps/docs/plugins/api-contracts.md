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

| Rule                                                                                                       | Checks                                       |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`api-contracts/no-misleading-function-names`](#api-contractsno-misleading-function-names)                 | Names that contradict visible behavior       |
| [`api-contracts/no-ambiguous-failure-contracts`](#api-contractsno-ambiguous-failure-contracts)             | Overlapping public failure channels          |
| [`api-contracts/require-input-validation`](#api-contractsrequire-input-validation)                         | Unvalidated untrusted boundary input         |
| [`api-contracts/no-side-effects-in-safe-http-methods`](#api-contractsno-side-effects-in-safe-http-methods) | Requested mutation through safe HTTP methods |
| [`api-contracts/no-misleading-http-status`](#api-contractsno-misleading-http-status)                       | Statuses that contradict visible outcomes    |
| [`api-contracts/no-ignored-significant-results`](#api-contractsno-ignored-significant-results)             | Meaningful call results discarded            |

## `api-contracts/no-misleading-function-names`

Checks named implementation functions, up to 12,000 characters, for a concrete promise in the name that visible behavior contradicts. Domain terminology, thin delegation, and hidden behavior cause abstention rather than a finding.

Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`.

## `api-contracts/no-ambiguous-failure-contracts`

Checks directly exported implementation functions for overlapping failure representations, such as nullable or sentinel returns mixed with result values or thrown errors, unless their roles are visibly distinct.

Options: `threshold` defaults to `0.8`; `minConfidence` defaults to `0.7`.

## `api-contracts/require-input-validation`

Prefers normalized explicit Fastify and Express routes, with an exported-function fallback for explicit raw, unknown, or webhook inputs. Type annotations alone are not validation. Captured but unresolved schemas and middleware cause abstention rather than assumed coverage.

Options: `threshold` defaults to `0.85`; `minConfidence` defaults to `0.7`.

## `api-contracts/no-side-effects-in-safe-http-methods`

Reviews GET, HEAD, OPTIONS, and TRACE routes with visible mutation-like calls. It distinguishes requested domain changes from incidental logging, metrics, auditing, and cache maintenance. Defaults: `threshold: 0.9`, `minConfidence: 0.75`.

## `api-contracts/no-misleading-http-status`

Reviews explicit status exits against visible route outcomes. Accepted asynchronous work, deliberate privacy-preserving responses, and protocol-specific contracts are allowed. Defaults: `threshold: 0.9`, `minConfidence: 0.75`.

## `api-contracts/no-ignored-significant-results`

Reviews conservatively selected discarded call results when the visible contract makes the value significant, such as a success indicator, validation result, or partial-failure report. Results intentionally used only for side effects are accepted. Unresolved return types, external helper contracts, and APIs whose result is conventionally optional cause abstention.

```ts
rules: {
  "api-contracts/require-input-validation": ["warn", { threshold: 0.9, minConfidence: 0.75 }],
}
```
