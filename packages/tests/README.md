# @scruple/tests

Checks for automated tests with vacuous oracles, broad error assertions, uncontrolled nondeterminism, or fixed delays used for synchronization.

```sh
pnpm add --save-dev @scruple/tests
```

Rules check meaningful test oracles, specific error assertions, uncontrolled nondeterminism, and
fixed delays used for synchronization. Evidence is deterministically bounded across test callbacks,
imports, calls, and local helper bodies. Nondeterminism and delay rules inspect uniquely resolvable
visible local helpers; same-named declarations from unrelated scopes are excluded, and ambiguous
resolution is omitted rather than guessed.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
