# Cloudflare Clef provider

`@scruple/provider-cloudflare` sends bounded code evidence and fixed questions to
[Clef](https://developers.cloudflare.com/workers-ai/models/clef/) through the Workers AI REST API.
Clef implements the same choice, score, and noul decision contract as Jev and returns a probability
for every allowed option. `clef-flash` provides a smaller, lower-latency alternative.

## Create Workers AI credentials

In the Cloudflare dashboard, open **Workers AI**, select **Use REST API**, and create a Workers AI API
token. Copy the account ID shown on the same page. Give the token only the Workers AI permissions the
application needs.

## Configure Scruple

```sh
pnpm add --save-dev @scruple/provider-cloudflare
```

```ts
import { cloudflareProvider } from "@scruple/provider-cloudflare";

const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
if (accountId === undefined || apiToken === undefined) {
  throw new Error("Cloudflare Workers AI credentials are required");
}

const provider = cloudflareProvider({ accountId, apiToken });
```

## Options

| Option        | Default                                  | Purpose                                  |
| ------------- | ---------------------------------------- | ---------------------------------------- |
| `accountId`   | Required                                 | Cloudflare account containing Workers AI |
| `apiToken`    | Required                                 | Workers AI API bearer token              |
| `model`       | `"clef"`                                 | `"clef"` or `"clef-flash"`               |
| `baseURL`     | `"https://api.cloudflare.com/client/v4"` | Alternate Cloudflare API endpoint        |
| `concurrency` | `4`                                      | Maximum simultaneous provider requests   |
| `timeoutMs`   | `30000`                                  | Request timeout in milliseconds          |
| `fetch`       | Runtime fetch                            | Custom fetch implementation              |

The provider does not retry requests. This avoids duplicate billed inference when a request times out
after Cloudflare has accepted it. Cloudflare can return `429` when the account reaches a rate limit or
the model has no available capacity; Scruple reports that as a provider error.

The provider reports the resolved model and input/output token usage in Scruple's run statistics.
Uncached request and token totals include collection classifications as well as final candidate
decisions. The CLI reports cached responses separately as `cacheHits`.

Cloudflare currently lists Clef at $0.24 per million input tokens and Clef-flash at $0.09 per million
input tokens. Review current [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
and [limits](https://developers.cloudflare.com/workers-ai/platform/limits/) before relying on those
figures. Cloudflare's data-usage documentation says Workers AI customer content is not used to train
models or improve services without explicit consent and is stored only when the customer combines
Workers AI with a storage service. Review the current terms before sending repository code.
