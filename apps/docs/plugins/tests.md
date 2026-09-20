# Tests

`@scruple/tests` checks that tests verify behavior, expect specific failures, and control inputs and timing.

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

| Rule                                                                                 | Checks                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------- |
| [`tests/no-vacuous-tests`](#testsno-vacuous-tests)                                   | Tests with no effective behavior verification |
| [`tests/require-specific-error-assertions`](#testsrequire-specific-error-assertions) | Failure assertions that accept any error      |
| [`tests/no-fixed-delay-synchronization`](#testsno-fixed-delay-synchronization)       | Sleeps used to synchronize tests              |
| [`tests/no-nondeterministic-tests`](#testsno-nondeterministic-tests)                 | Uncontrolled inputs make tests flaky          |

## `tests/no-vacuous-tests`

Reviews parsed test functions and reachable named same-file helper bodies. Effective checks include framework assertions, assertion helpers, properly observed expected throws or rejections, snapshots, and mock interaction verification when causally connected to the behavior under test. Clearly named completion or no-crash smoke contracts can also be intentional. Merely executing code, setting up mocks, unobserved async expectations, tautologies, and unrelated assertions do not count. Unknown helper semantics cause abstention.

Options: `threshold` defaults to `{ warning: 0.9, error: 0.97 }`; `minConfidence` defaults to `0.7`.

## `tests/require-specific-error-assertions`

Reviews recognized Node, Jest, Vitest, and Chai throw or rejection assertions. It requires a stable error class, code, message contract, or equivalent discriminator unless the test is visibly intended to accept any failure.

## `tests/no-fixed-delay-synchronization`

Reviews sleeps, pauses, `waitForTimeout`, and direct timers used to wait for readiness. Condition waits, fake clocks, and intentional real-time timing tests are accepted.

## `tests/no-nondeterministic-tests`

Reviews test bodies with direct calls to common randomness and wall-clock sources. Seeded randomness, fake clocks, and tests explicitly asserting nondeterministic properties are accepted. Candidate selection is conservative, and opaque helpers or externally controlled inputs cause abstention.

```ts
rules: {
  "tests/no-vacuous-tests": [
    "warn",
    { threshold: { warning: 0.95, error: 0.99 }, minConfidence: 0.8 },
  ],
}
```
