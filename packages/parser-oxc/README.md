# @scruple/parser-oxc

OXC parser adapter for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/parser-oxc
```

```ts
import { oxcParser } from "@scruple/parser-oxc";

const parser = oxcParser();
```

The parser advertises the `javascript`, `jsx`, `typescript`, and `tsx` language IDs plus JavaScript
and TypeScript file patterns for automatic CLI discovery. It can be configured alongside other
language parsers by passing an array to the `parser` configuration field.

Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
