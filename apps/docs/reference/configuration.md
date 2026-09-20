# Configuration API

`defineConfig` accepts a `ScrupleConfig` and preserves rule types derived from registered plugins.

## Fields

| Field         | Required | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `parser`      | Yes      | `SourceParser` used for every supported file             |
| `provider`    | Yes      | `DecisionProvider` used by semantic rules                |
| `plugins`     | Yes      | Namespace to plugin map                                  |
| `rules`       | Yes      | Namespaced rule configurations                           |
| `concurrency` | No       | Positive provider-request concurrency; defaults to `4`   |
| `include`     | No       | Default CLI globs when no positional patterns are passed |
| `ignore`      | No       | Additional CLI ignore globs                              |

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

A `DecisionProvider` supplies an `id`, `evaluate(request, signal?)`, and an optional `close()`. Requests contain JSON state and named typed questions. Responses return named answers, a resolved model ID, and optional token usage.
