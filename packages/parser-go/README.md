# @scruple/parser-go

Tree-sitter-backed Go parser adapter for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/parser-go
```

```ts
import { goParser } from "@scruple/parser-go";

const parser = goParser();
```

The parser advertises the `go` language ID and supports `.go` files. Parsing is asynchronous because
its Tree-sitter grammar is loaded as WebAssembly. It normalizes imports, comments, functions,
methods, and calls. Go has no exception handlers, so `errorHandlers` is empty.

The bundled grammar is from
[`tree-sitter-go` 0.25.0](https://github.com/tree-sitter/tree-sitter-go/releases/tag/v0.25.0)
under the MIT License.
