# @scruple/compatibility

Deterministic exported-API comparison and compatibility policies for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/compatibility
```

Compatibility requires evidence from two API surfaces; it is never inferred from one current source
file. The minimum stable evidence contract is:

- a complete before snapshot and a complete after snapshot;
- package name and version identity for each snapshot;
- every public export's entry point, exported name, kind, and normalized declaration; and
- for `require-migration-path`, a complete inventory of documented migration paths.

An empty complete snapshot means the package has no exports. Partial or unavailable evidence produces
an explicit `insufficient-context` result. Producers should normalize declarations so semantically
identical signatures compare byte-for-byte; this initial slice conservatively treats any changed
declaration or export kind as breaking.

```ts
import { compatibility } from "@scruple/compatibility";

const result = compatibility().rules["no-breaking-api-changes"](evidence);
```

`no-breaking-api-changes` reports removed or changed exports. `require-migration-path` reports those
breaking changes when the complete migration inventory has no non-empty path for the affected export.
The former accepts only before/after evidence; migration evidence is required only by the latter.
