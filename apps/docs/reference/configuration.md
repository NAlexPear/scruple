# Configuration API

`defineConfig` accepts a `ScrupleConfig` and preserves rule types derived from registered plugins.

## Fields

| Field      | Required | Description                                               |
| ---------- | -------- | --------------------------------------------------------- |
| `parser`   | Yes      | `SourceParser` used for every supported file              |
| `provider` | Yes      | `DecisionProvider` used by semantic rules                 |
| `cache`    | No       | A `DecisionCache` strategy, or `false` to disable caching |
| `plugins`  | Yes      | Namespace to plugin map                                   |
| `rules`    | Yes      | Namespaced rule configurations                            |
| `include`  | No       | Default CLI globs when no positional patterns are passed  |
| `ignore`   | No       | Additional CLI ignore globs                               |

## Rule configuration

```ts
type RuleSeverity = "off" | "warn" | "error";
type RuleConfiguration = RuleSeverity | readonly [RuleSeverity, unknown];
```

Plugin namespaces come from the keys in `plugins`. A rule ID must have exactly one slash, reference a registered plugin, and name a rule exported by that plugin.

Unknown plugins, unknown rules, malformed IDs, invalid severities, and invalid rule options are configuration errors.

## Parser contract

A `SourceParser` supplies an `id`, a `supports(filename)` predicate, and `parse(filename, source)`. Parsed documents contain normalized targets and source locations rather than serialized syntax trees.

## Provider contract

A `DecisionProvider` supplies an `id`, `evaluate(request, signal?)`, an optional `close()`, and its
preferred request concurrency. Requests contain JSON state and named typed questions. Responses
return named answers, a resolved model ID, and optional token usage. The provider ID is also its cache
namespace, so custom providers should change it when they change models or behavior.

The engine gives asynchronous rule collectors a restricted, target-aware provider view. A collector
can classify a bounded possible target, but cannot close or reconfigure the provider. Scruple applies
the same cancellation, concurrency, suppression, request counting, and token accounting to collection
and final decision requests.

## Cache contract

Set `cache` to a `DecisionCache` strategy to use local, remote, or multi-tier storage for every
provider request. A cache receives the provider ID and complete request, and may return a previous
successful response:

```ts
import type { DecisionCache } from "@scruple/core";

const cache: DecisionCache = {
  async get(providerId, request) {
    // Read and validate a response from your cache service.
    return undefined;
  },
  async set(providerId, request, response) {
    // Store the successful response without exposing request data in logs or keys.
  },
  async close() {
    // Optionally release client resources when the CLI exits.
  },
};
```

The provider ID is an input to the strategy, so one cache can namespace or route different providers
without putting storage policy in each provider adapter. A strategy can also compose local and remote
caches. Cache implementations must treat unavailable or invalid storage as a miss and failed writes as
non-fatal rather than failing analysis.

When `cache` is omitted, the CLI supplies its filesystem cache. Set `cache: false` to disable that
default. `runScruple` accepts the same values through its run options, which override configuration for
one run.
