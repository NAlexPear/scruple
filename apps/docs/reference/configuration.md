# Configuration API

`defineConfig` accepts a `ScrupleConfig` and preserves rule types derived from registered plugins.

## Fields

| Field      | Required | Description                                               |
| ---------- | -------- | --------------------------------------------------------- |
| `parser`   | Yes      | One `SourceParser`, or an array of parsers                |
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

Unknown plugins, unknown rules, malformed IDs, invalid severities, invalid rule options, and enabled
rules that support none of the configured parser languages are configuration errors.

Every plugin declares a required `languages` scope: an array of exact language IDs, or the `"*"`
wildcard that opts into every document language. The wildcard is routing metadata, not a guarantee
that a rule works across languages. Prefer explicit, tested scopes. An instantiated rule may declare
its own `languages` scope to replace the plugin scope. Scruple runs each rule only on matching parsed
documents. This metadata belongs to parser and plugin authors; callers do not repeat it in config.

For example, `["javascript", "typescript"]` does not include OXC's separate `jsx` and `tsx` IDs.
Downstream authors own applicability, evidence selection, diagnostics, and tests for their rules.
Scruple maintains these interfaces, not first-party language or framework rule packs.

## Parser contract

A `SourceParser` supplies an `id`, the concrete `languages` it may return, default `filePatterns`, a
`supports(filename)` predicate, and `parse(filename, source)`. Parsing may return a document directly
or a promise, allowing parsers to initialize runtimes such as WebAssembly. Parsed documents contain
normalized targets and source locations rather than serialized syntax trees. A parsed document's
`language` must be one advertised by its parser. Configure an array of parsers to analyze multiple
languages. Each file must match at most one parser; overlapping parser support is reported as an
operational error. Parser IDs must be unique, and the array must not be empty. Files with no
supporting parser are skipped.

When neither positional patterns nor `include` are supplied, the CLI combines and deduplicates the
configured parsers' `filePatterns`. Positional patterns override `include`. Discovery patterns do not
change parser support: `supports` remains authoritative for all files passed to the engine.

Scruple maintains blessed language-specific parsers. `@scruple/parser-oxc` supports JavaScript, JSX,
TypeScript, and TSX. Tree-sitter-backed `@scruple/parser-python`, `@scruple/parser-go`,
`@scruple/parser-rust`, and `@scruple/parser-sql` support their named languages. Additional languages
need their own parser implementations of this contract, not project-owned copies of extension lists
or rule applicability tables.

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
