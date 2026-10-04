# @scruple/parser-python

Python parser for [Scruple](https://github.com/NAlexPear/scruple), backed by Tree-sitter.

```sh
pnpm add --save-dev @scruple/parser-python
```

```ts
import { pythonParser } from "@scruple/parser-python";

const parser = pythonParser();
```

Parses `.py` and `.pyi` files as `python`. It extracts imports, comments, functions, calls, and
`except` handlers. `parse` returns a promise while the bundled WebAssembly grammar loads.

The bundled grammar is from
[`tree-sitter-python` 0.25.0](https://github.com/tree-sitter/tree-sitter-python/releases/tag/v0.25.0)
under the MIT License.
