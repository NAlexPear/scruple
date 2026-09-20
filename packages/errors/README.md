# @scruple/errors

Semantic rules for error handling, packaged as a plugin for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/errors
```

The initial `errors/no-swallowed-errors` rule evaluates normalized catch handlers and reports only
high-confidence cases where an unexpected failure is silently suppressed. It abstains when handling
or fallback behavior depends on code outside the bounded evidence.
