# Scruple

[![CI](https://github.com/NAlexPear/scruple/actions/workflows/ci.yml/badge.svg)](https://github.com/NAlexPear/scruple/actions/workflows/ci.yml)

Scruple runs semantic rules over focused source-code evidence. A parser finds and localizes
candidates; a decision provider classifies those candidates; deterministic plugins turn
high-probability decisions into stable diagnostics.

The initial frontend uses [OXC](https://oxc.rs/), but the core depends only on the
`SourceParser` interface. The same plugins can run against TypeSafe Jev or the local,
Apache-2.0-licensed [Laya](https://github.com/NandhaKishorM/laya) model.

## Architecture

```text
source → parser → normalized source targets → semantic plugins → decision provider → diagnostics
           OXC                                      Jev or local Laya
```

Syntax trees are an implementation detail of parser adapters. Plugins and providers receive exact
source excerpts, source locations, imports, calls, and lightweight deterministic facts—not a
serialized AST.

## Packages

- `scruple` — CLI and TypeScript config loader
- `@scruple/core` — parser, provider, plugin, and diagnostic contracts; no built-in policy
- `@scruple/parser-oxc` — JavaScript and TypeScript source adapter
- `@scruple/provider-jev` — hosted TypeSafe Jev adapter
- `@scruple/provider-laya` — persistent local Python/Laya adapter
- `@scruple/example-unhelpful-comment` — example comment plugin
- `@scruple/example-vacuous-test` — example test plugin
- `@scruple/example-prefer-database-join` — example function-level database plugin

## Configuration

Create `scruple.config.ts`:

```ts
import { defineConfig } from "@scruple/core";
import { preferDatabaseJoinPlugin } from "@scruple/example-prefer-database-join";
import { unhelpfulCommentPlugin } from "@scruple/example-unhelpful-comment";
import { vacuousTestPlugin } from "@scruple/example-vacuous-test";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ model: "jev-1.13.0" }),
  plugins: [
    unhelpfulCommentPlugin({ severity: "warning", threshold: 0.95 }),
    vacuousTestPlugin({ severity: "error", threshold: 0.85 }),
    preferDatabaseJoinPlugin({ severity: "warning", threshold: 0.8 }),
  ],
});
```

Set `TYPESAFE_API_KEY`, then run:

```sh
scruple check "src/**/*.{ts,tsx}"
scruple check --format json
```

The Jev provider pins `jev-1.13.0` by default rather than using the moving `jev-latest` alias.

### Local Laya

Install Laya in the Python environment used by Scruple:

```sh
pip install laya
```

Then replace the provider:

```ts
import { layaProvider } from "@scruple/provider-laya";

provider: layaProvider({
  model: "typed-decisions",
  python: "python3",
  preload: true,
}),
```

Scruple keeps one Python process and preloaded router alive for the full check instead of loading
model weights for each candidate. `model: "auto"` uses Laya's language router.

Laya currently has a substantially smaller context budget than Jev. Scruple's function-level
evidence is intentionally bounded, but repositories should calibrate each provider and threshold
independently. Do not assume probabilities are interchangeable across model versions or providers.

## Plugin API

Scruple intentionally ships no core policy. A semantic plugin has a stable ID and two operations:
`collect` selects normalized source targets and builds typed decision questions; `diagnose` turns a
provider answer into a deterministic diagnostic or abstains. `definePlugin` preserves the inferred
plugin type while checking this contract.

Each example below is an independent workspace and plugin, not a built-in rule set:

- `unhelpful-comment` evaluates a comment together with its enclosing function or nearby source.
- `vacuous-test` evaluates complete test callbacks and accounts for indirect assertion patterns.
- `prefer-database-join` uses deterministic call-shape prefiltering, then evaluates the complete
  enclosing function and imports. It abstains when database provenance or capabilities are unclear.

Plugins never ask a model to generate diagnostic text or fixes. Provider failures are operational
errors (exit code 2), not clean checks or findings.

Plugin packs require no additional core API: a package can export an array of plugins for callers to
spread into `plugins`. This leaves room for blessed packs in this repository without coupling the
engine to any policy bundle.

## Development

Requires Node.js 20.19 or newer and pnpm.

```sh
pnpm install
pnpm check
```

`pnpm check` verifies Oxfmt formatting, runs Oxlint with type-aware rules and warnings denied,
type-checks every package with the workspace's strict TypeScript configuration, builds all packages,
and runs the test suite. Use `pnpm format` to apply formatting.

## License

[MIT](LICENSE)
