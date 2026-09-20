# Relational Databases

`@scruple/relational-databases` provides a provider-backed semantic check for database work performed in application memory.

```sh
pnpm add -D @scruple/relational-databases
```

```ts
import { defineConfig } from "@scruple/core";
import { relationalDatabases } from "@scruple/relational-databases";

export default defineConfig({
  parser,
  provider,
  plugins: { "relational-databases": relationalDatabases() },
  rules: { "relational-databases/prefer-database-join": "warn" },
});
```

| Rule                                                                                     | Checks                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| [`relational-databases/prefer-database-join`](#relational-databasesprefer-database-join) | Multiple query results combined in memory |

## `relational-databases/prefer-database-join`

Selects implementation functions with at least two recognized database calls and a recognized collection operation, then asks whether a join, relation include, aggregation, subquery, or filtered query could reasonably replace the in-memory combination. Legitimate post-query transformations, separate database systems, application-only semantics, and intentionally bounded data are accepted.

Options: `threshold` defaults to `0.8`; `minConfidence` defaults to `0.5`; `databaseCallPatterns` and `collectionOperationPatterns` each default to the package's built-in patterns. Supplying either pattern array replaces that corresponding default. Built-in import-aware database call recognition is used only when `databaseCallPatterns` is omitted.

```ts
rules: {
  "relational-databases/prefer-database-join": ["warn", {
    databaseCallPatterns: [/^store\.query$/u],
    collectionOperationPatterns: [/\.map$/u],
  }],
}
```
