# @scruple/errors

Semantic rules for error handling, packaged as a plugin for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/errors
```

The rules evaluate normalized catch handlers for swallowed failures, lossy replacement errors, and
dispatch based on unstable error messages. They abstain when recovery contracts, custom wrappers, or
classifiers depend on code outside the bounded evidence.
