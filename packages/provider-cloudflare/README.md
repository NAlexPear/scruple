# @scruple/provider-cloudflare

Cloudflare-hosted [Clef](https://developers.cloudflare.com/workers-ai/models/clef/) decision provider
for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/provider-cloudflare
```

```ts
import { cloudflareProvider } from "@scruple/provider-cloudflare";

const provider = cloudflareProvider({ accountId, apiToken });
```

The caller supplies a Cloudflare account ID and Workers AI API token and decides how to obtain them.
The provider defaults to `clef`; pass `model: "clef-flash"` for the lower-latency model.

Scruple uses this provider for final rule decisions and for bounded collection classifications when a
rule needs semantic help choosing candidates. Uncached calls of both kinds count toward concurrency
and token usage; the CLI can serve matching responses from its decision cache.

Review [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), rate
limits, and data usage terms before sending repository code. Follow the published
[provider documentation](https://scruple.dev/providers/cloudflare), browse the
[rule registry](https://scruple.dev/plugins/), or
[write a custom rule](https://scruple.dev/guide/writing-a-plugin).
