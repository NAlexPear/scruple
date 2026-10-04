# @scruple/parser-python

Tree-sitter-backed Python parser adapter for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/parser-python
```

```ts
import { pythonParser } from "@scruple/parser-python";

const parser = pythonParser();
```

The parser advertises the `python` language ID and supports `.py` and `.pyi` files. Parsing is
asynchronous because its Tree-sitter grammar is loaded as WebAssembly. It normalizes imports,
comments, functions, calls, and `except` handlers.

The bundled grammar is from
[`tree-sitter-python` 0.25.0](https://github.com/tree-sitter/tree-sitter-python/releases/tag/v0.25.0)
under the MIT License.
