# @scruple/tests

Example semantic rules for automated tests, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/tests
```

Rules check meaningful test oracles, specific error assertions, uncontrolled nondeterminism, and
fixed delays used for synchronization. Evidence is deterministically bounded across test callbacks,
imports, calls, and local helper bodies. Nondeterminism and delay rules inspect uniquely resolvable
visible local helpers; same-named declarations from unrelated scopes are excluded, and ambiguous
resolution is omitted rather than guessed. See the
[Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration.
