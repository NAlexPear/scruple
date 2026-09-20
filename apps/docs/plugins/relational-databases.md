# Relational Databases

`@scruple/relational-databases` checks relational queries, transactions, joins, and pagination.

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

| Rule                                                                                                                         | Checks                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [`relational-databases/prefer-database-join`](#relational-databasesprefer-database-join)                                     | Multiple query results combined in memory |
| [`relational-databases/no-query-in-loop`](#relational-databasesno-query-in-loop)                                             | Per-item relational queries               |
| [`relational-databases/require-transaction-scoped-client`](#relational-databasesrequire-transaction-scoped-client)           | Global clients used inside transactions   |
| [`relational-databases/require-deterministic-pagination-order`](#relational-databasesrequire-deterministic-pagination-order) | Pagination without visible ordering       |

## `relational-databases/prefer-database-join`

Selects implementation functions with at least two relational database calls and a recognized collection operation, then asks whether a join, relation include, aggregation, subquery, or filtered query could reasonably replace the in-memory combination. Legitimate post-query transformations, separate database systems, and application-only semantics are accepted.

Options: `threshold` defaults to `0.85`; `minConfidence` defaults to `0.7`; `databaseCallPatterns` and `collectionOperationPatterns` each default to the package's built-in patterns. Supplying either pattern array replaces that corresponding default. Built-in import-aware relational recognition excludes document databases such as Mongoose.

## `relational-databases/no-query-in-loop`

Reviews query calls inside loops and collection callbacks for per-item access that should be batched or expressed set-wise. Visible batching, unavoidable sequential semantics, and non-item-dependent queries are accepted.

## `relational-databases/require-transaction-scoped-client`

Reviews callback transactions and manual `BEGIN` flows for work that escapes to a global client or pool instead of the transaction-scoped client.

## `relational-databases/require-deterministic-pagination-order`

Reviews visible LIMIT/OFFSET and skip/take pagination for a deterministic ordering contract. A mere safety cap is not treated as pagination.

```ts
rules: {
  "relational-databases/prefer-database-join": ["warn", {
    databaseCallPatterns: [/^store\.query$/u],
    collectionOperationPatterns: [/\.map$/u],
  }],
}
```
