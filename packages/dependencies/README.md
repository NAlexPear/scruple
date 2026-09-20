# @scruple/dependencies

Evidence-backed semantic rules for using installed dependencies and existing project abstractions,
packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/dependencies
```

The initial `no-reimplemented-dependency-feature` rule requires caller-supplied evidence linking one
installed dependency capability to one local function. Each evidence record must contain the
dependency's manifest declaration, a relevant import, a bounded capability excerpt, the exact local
symbol and search query, and a bounded local excerpt. Incomplete or stale evidence is ignored.

Evidence collection intentionally remains outside this package for now. This keeps the rule from
performing an unbounded repository or dependency scan. `prefer-existing-abstraction` is proposed for
a later slice once an equally bounded way to establish local abstraction usage and applicability is
available.
