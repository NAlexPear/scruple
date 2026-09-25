# @scruple/provider-decider

Local or self-hosted [Decider](https://github.com/Mapika/decider) decision provider for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/provider-decider
```

Start Decider 4B separately, then configure Scruple:

```ts
import { deciderProvider } from "@scruple/provider-decider";

const provider = deciderProvider();
```

The provider defaults to Decider 4B v2.1 at `http://127.0.0.1:8000`. Decider's server does not
authenticate requests by default. Put authentication and TLS in front of it before exposing it to an
untrusted network; pass that proxy's key with `apiKey` when needed.

Scruple uses this provider for final rule decisions and for bounded collection classifications when a
rule needs semantic help choosing candidates. Uncached calls of both kinds count toward concurrency
and token usage; the CLI can serve matching responses from its decision cache.

Follow the published [provider documentation](https://scruple.dev/providers/decider), browse the
[rule registry](https://scruple.dev/plugins/), or
[write a custom rule](https://scruple.dev/guide/writing-a-plugin).
