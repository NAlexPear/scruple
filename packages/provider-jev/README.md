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

`kevProvider` targets a local [Kev](https://github.com/jaredpalmer/kev) server, which serves the same
API from open weights. It refuses a non-loopback `baseURL` unless `allowRemote` is `true`:

```ts
import { kevProvider } from "@scruple/provider-jev";

const provider = kevProvider({ baseURL: "http://127.0.0.1:8008" });
```

Scruple uses this provider for final rule decisions and for bounded collection classifications when a
rule needs semantic help choosing candidates. Uncached calls of both kinds count toward concurrency
and token usage; the CLI can serve matching responses from its decision cache.

Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
