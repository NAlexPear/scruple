# @scruple/relational-databases

Example semantic rules for relational-database access, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/relational-databases
```

Rules review in-memory joins, per-item queries, transaction-scoped clients, and deterministic
pagination order for recognizable relational database APIs. Pagination selection uses structured option
keys and static SQL query text rather than arbitrary source substrings. Transaction checks follow direct
local receiver aliases but leave opaque helper provenance unresolved. See the
[Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration.
