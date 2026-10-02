# Error-handling examples

Unsupported semantic rule examples for error handling.
See the [example boundary](../README.md); these are not published packages.

Repository-only import: `@scruple/example-rules/errors`.

The rules evaluate normalized catch handlers for swallowed failures, lossy replacement errors, and
dispatch based on unstable error messages. They abstain when recovery contracts, custom wrappers, or
classifiers depend on code outside the bounded evidence. Redundant rethrow boundaries are selected
from normalized exits, so comments and formatting do not hide an otherwise direct rethrow.

Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
