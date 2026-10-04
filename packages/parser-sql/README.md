# @scruple/parser-sql

Tree-sitter-backed SQL parser adapter for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/parser-sql
```

```ts
import { sqlParser } from "@scruple/parser-sql";

const parser = sqlParser();
```

The parser advertises the `sql` language ID and supports `.sql` files. Parsing is asynchronous
because its Tree-sitter grammar is loaded as WebAssembly. It normalizes comments, `CREATE FUNCTION`
declarations, and calls within those functions. SQL dialect extensions outside the bundled generic
grammar are reported as parse issues rather than silently treated as normalized evidence.

The bundled grammar is from
[`@l1xnan/tree-sitter-sql` 0.4.7](https://github.com/l1xnan/tree-sitter-sql/releases/tag/v0.4.7),
a maintained fork of Derek Stride's grammar, under the MIT License.
