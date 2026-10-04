# @scruple/parser-rust

Tree-sitter-backed Rust parser adapter for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/parser-rust
```

```ts
import { rustParser } from "@scruple/parser-rust";

const parser = rustParser();
```

The parser advertises the `rust` language ID and supports `.rs` files. Parsing is asynchronous
because its Tree-sitter grammar is loaded as WebAssembly. It normalizes `use` declarations,
comments, functions, closures, methods, and calls. Rust has no exception handlers, so
`errorHandlers` is empty.

The bundled grammar is from
[`tree-sitter-rust` 0.24.0](https://github.com/tree-sitter/tree-sitter-rust/releases/tag/v0.24.0)
under the MIT License.
