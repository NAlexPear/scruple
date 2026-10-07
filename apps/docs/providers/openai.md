# OpenAI

`@scruple/provider-openai` sends bounded code evidence and fixed questions to OpenAI's
[Decisions API](https://developers.openai.com/api/docs/guides/decisions). This includes final
candidate decisions and any collection classifications a rule performs before choosing candidates.

The Decisions API is currently in public beta. It supports `gpt-6-luna`; OpenAI does not currently
publish a pinned snapshot. Review beta changes and clear or disable Scruple's decision cache when a
moving model alias changes behavior.

## Install

```sh
pnpm add --save-dev @scruple/provider-openai
```

## Configure

```ts
import { openaiProvider } from "@scruple/provider-openai";

const provider = openaiProvider({
  apiKey: process.env.OPENAI_API_KEY!,
});
```

The provider defaults to model `gpt-6-luna`, concurrency `16`, a 30-second overall timeout, and two
retries for transient HTTP 429 and 503 responses. Pass `organization` or `project` when the API key
can access more than one OpenAI organization or project. Credentials are explicit constructor inputs;
the package does not read environment variables itself.

Scruple's JSON evidence and non-string instructions are serialized deterministically. `noul`
questions map to predicates, including explicit true and false criteria. Choice and score questions
preserve their complete probability distributions and confidence values. If OpenAI refuses a question
or returns an incomplete response, the provider reports an operational error rather than inventing an
answer.

## Data, cost, and limits

OpenAI receives bounded source evidence over HTTPS. Review OpenAI's
[data controls](https://developers.openai.com/api/docs/guides/your-data) before sending repository
code. Eligible customers can use Zero Data Retention, HIPAA controls, and US or European data
residency.

Decisions requests using `gpt-6-luna` are currently billed at $0.10 per million input tokens with no
cache-read, cache-write, or output-token charges. Long-context and regional-processing premiums can
apply. Limits vary by account tier; inspect the OpenAI dashboard and response headers before raising
concurrency. See the [Decisions pricing and availability](https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability)
and [rate-limit guide](https://developers.openai.com/api/docs/guides/rate-limits) for current terms.
