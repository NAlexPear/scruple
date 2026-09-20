# @scruple/errors

Semantic rules for error handling, packaged as a plugin for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/errors
```

The rules evaluate normalized catch handlers for swallowed failures, lossy replacement errors, and
dispatch based on unstable error messages. They abstain when recovery contracts, custom wrappers, or
classifiers depend on code outside the bounded evidence. Redundant rethrow boundaries are selected
from normalized exits, so comments and formatting do not hide an otherwise direct rethrow.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
