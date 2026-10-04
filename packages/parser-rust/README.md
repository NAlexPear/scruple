# @scruple/parser-rust

Rust parser for [Scruple](https://github.com/NAlexPear/scruple), backed by Tree-sitter.

```sh
pnpm add --save-dev @scruple/parser-rust
```

```ts
import { rustParser } from "@scruple/parser-rust";

const parser = rustParser();
```

Parses `.rs` files as `rust`. It extracts `use` declarations, comments, functions, closures, methods,
and calls. Rust has no exception handlers, so `errorHandlers` is empty. `parse` returns a promise
while the bundled WebAssembly grammar loads.

The bundled grammar is from
[`tree-sitter-rust` 0.24.0](https://github.com/tree-sitter/tree-sitter-rust/releases/tag/v0.24.0)
under the MIT License.
