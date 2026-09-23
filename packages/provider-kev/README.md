# @scruple/provider-kev

Local [Kev](https://github.com/jaredpalmer/kev) decision provider for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/provider-kev
```

```ts
import { kevProvider } from "@scruple/provider-kev";

const provider = kevProvider({ baseURL: "http://127.0.0.1:8008" });
```

Kev serves the System One API from open weights. `concurrency` defaults to `1` because the Kev server
runs one forward pass at a time.

Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
