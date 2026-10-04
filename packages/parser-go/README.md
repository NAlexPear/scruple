# @scruple/parser-go

Go parser for [Scruple](https://github.com/NAlexPear/scruple), backed by Tree-sitter.

```sh
pnpm add --save-dev @scruple/parser-go
```

```ts
import { goParser } from "@scruple/parser-go";

const parser = goParser();
```

Parses `.go` files as `go`. It extracts imports, comments, functions, methods, and calls. Go has no
exception handlers, so `errorHandlers` is empty. `parse` returns a promise while the bundled
WebAssembly grammar loads.

The bundled grammar is from
[`tree-sitter-go` 0.25.0](https://github.com/tree-sitter/tree-sitter-go/releases/tag/v0.25.0)
under the MIT License.
