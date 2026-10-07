# @scruple/provider-openai

OpenAI [Decisions API](https://developers.openai.com/api/docs/guides/decisions) provider for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/provider-openai
```

```ts
import { openaiProvider } from "@scruple/provider-openai";

const provider = openaiProvider({ apiKey });
```

The caller supplies an OpenAI API key and decides how to obtain it. The provider defaults to
`gpt-6-luna`, currently the only model supported by the public-beta Decisions API.

Scruple uses this provider for final rule decisions and for bounded collection classifications when a
rule needs semantic help choosing candidates. Uncached calls of both kinds count toward concurrency
and token usage; the CLI can serve matching responses from its decision cache.

Review [OpenAI pricing](https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability),
rate limits, beta status, and data controls before sending repository code. Follow the published
[provider documentation](https://scruple.dev/providers/openai), browse the
[rule registry](https://scruple.dev/plugins/), or
[write a custom rule](https://scruple.dev/guide/writing-a-plugin).
