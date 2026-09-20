# Tests

`@scruple/tests` provides a provider-backed semantic check for automated tests that cannot verify the claimed behavior.

```sh
pnpm add -D @scruple/tests
```

```ts
import { defineConfig } from "@scruple/core";
import { tests } from "@scruple/tests";

export default defineConfig({
  parser,
  provider,
  plugins: { tests: tests() },
  rules: { "tests/no-vacuous-tests": "warn" },
});
```

| Rule                                               | Checks                                        |
| -------------------------------------------------- | --------------------------------------------- |
| [`tests/no-vacuous-tests`](#testsno-vacuous-tests) | Tests with no effective behavior verification |

## `tests/no-vacuous-tests`

Reviews parsed test functions and reachable named same-file helper bodies. Effective checks include framework assertions, assertion helpers, properly observed expected throws or rejections, snapshots, and mock interaction verification when causally connected to the behavior under test. Merely executing code, setting up mocks, unobserved async expectations, tautologies, and unrelated assertions do not count. Unknown helper semantics cause abstention.

Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`.

```ts
rules: { "tests/no-vacuous-tests": ["warn", { threshold: 0.95, minConfidence: 0.8 }] }
```
