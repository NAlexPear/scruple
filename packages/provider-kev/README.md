# @scruple/provider-kev

Self-hosted [Kev](https://github.com/jaredpalmer/kev) decision provider for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/provider-kev
```

```ts
import { kevProvider } from "@scruple/provider-kev";

const provider = kevProvider({
  baseURL: "https://your-kev-endpoint.example",
  apiKey,
  checkpoint: "jaredpalmer/kev-4b@v1.0",
});
```

The provider defaults to the official local server at `http://127.0.0.1:8009` and sends the
`kev-latest` API alias using the same System One wire contract as the official
[TypeSafe SDK](https://github.com/typesafe-ai/typesafe-sdk-js). The checkpoint is selected when the
server starts; use a pinned checkpoint such as `jaredpalmer/kev-4b@v1.0` for a reproducible deployment
and pass the same value as `checkpoint` to keep Scruple's decision cache specific to those weights.
Local servers are open by default. Pass `apiKey` for a server configured with `KEV_API_KEY` or an
authenticating proxy.

Kev is self-hosted and has no documented TypeSafe hosted API price or hosted Kev model identifier.
Review the [deployment guide](https://github.com/jaredpalmer/kev/tree/main/skills/kev-deploy) and your
infrastructure provider's current pricing before sending repository code.

Follow the published [provider documentation](https://scruple.dev/providers/kev), browse the
[rule registry](https://scruple.dev/plugins/), or
[write a custom rule](https://scruple.dev/guide/writing-a-plugin).
