# @scruple/provider-jev

TypeSafe Jev decision provider for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/provider-jev
```

```ts
import { jevProvider } from "@scruple/provider-jev";

const provider = jevProvider({ apiKey });
```

The caller supplies the API key and decides how to obtain it.
