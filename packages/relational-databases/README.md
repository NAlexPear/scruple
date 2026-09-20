# @scruple/relational-databases

Checks for relational database work that joins query results in memory, queries once per item, escapes a transaction-scoped client, or paginates without visible ordering.

```sh
pnpm add --save-dev @scruple/relational-databases
```

Rules review in-memory joins, per-item queries, transaction-scoped clients, and deterministic
pagination order for recognizable relational database APIs. Pagination selection uses structured option
keys and static SQL query text rather than arbitrary source substrings. Transaction checks follow direct
local receiver aliases but leave opaque helper provenance unresolved.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
