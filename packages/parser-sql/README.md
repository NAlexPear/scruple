# @scruple/parser-sql

SQL parser for [Scruple](https://github.com/NAlexPear/scruple), backed by Tree-sitter.

```sh
pnpm add --save-dev @scruple/parser-sql
```

```ts
import { sqlParser } from "@scruple/parser-sql";

const parser = sqlParser();
```

Parses `.sql` files as `sql` with a generic SQL grammar. It extracts comments, `CREATE FUNCTION`
declarations, and calls inside those functions. Unsupported dialect syntax appears in `issues`.
`parse` returns a promise while the bundled WebAssembly grammar loads.

The bundled grammar is from
[`@l1xnan/tree-sitter-sql` 0.4.7](https://github.com/l1xnan/tree-sitter-sql/releases/tag/v0.4.7),
a maintained fork of Derek Stride's grammar, under the MIT License.
