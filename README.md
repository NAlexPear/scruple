# Scruple

Scruple is a pluggable semantic code checker that turns focused source evidence and Jev or local Laya decisions into deterministic diagnostics.

## Use Scruple

Scruple requires Node.js 22.18 or newer. Install the CLI, core, OXC parser, a provider, and the example
rule packages you want:

```sh
pnpm add --save-dev \
  scruple \
  @scruple/core \
  @scruple/parser-oxc \
  @scruple/provider-jev \
  @scruple/comments \
  @scruple/tests \
  @scruple/relational-databases
```

Create `scruple.config.ts`:

```ts
import { comments } from "@scruple/comments";
import { defineConfig } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { relationalDatabases } from "@scruple/relational-databases";
import { tests } from "@scruple/tests";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required");
}

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  plugins: {
    comments: comments(),
    tests: tests(),
    "relational-databases": relationalDatabases(),
  },
  rules: {
    "comments/no-useless-comments": "warn",
    "comments/no-misleading-comments": "warn",
    "comments/no-commented-out-code": "warn",
    "comments/no-change-history-comments": "warn",
    "comments/prefer-concise-comments": ["warn", { threshold: 0.9 }],
    "comments/require-actionable-todos": "off",
    "tests/no-vacuous-tests": "error",
    "relational-databases/prefer-database-join": "warn",
  },
});
```

The configuration chooses where to obtain the API key; this example reads it from the environment.
Then check source files:

```sh
pnpm exec scruple check "src/**/*.{ts,tsx}"
pnpm exec scruple check --format json
```

The Jev provider defaults to the pinned `jev-1.13.0` model rather than the moving `jev-latest`
alias. A run exits 0 when it has no error-severity findings, 1 when it finds at least one error, and
2 when configuration, parsing, or provider operations fail.

### Configure rules

Plugins register rules without enabling them. Configure each rule separately with `"off"`, `"warn"`,
or `"error"`; use a `[severity, options]` tuple for rule-specific options:

```ts
plugins: {
  comments: comments(),
},
rules: {
  "comments/no-useless-comments": ["warn", { threshold: 0.95 }],
  "comments/no-misleading-comments": "error",
  "comments/prefer-concise-comments": "off",
},
```

The key in `plugins` supplies the namespace used by its rule IDs. Unknown rules and rules whose
plugin is not registered are configuration errors.

### Use local Laya

Install the Laya provider and Laya itself:

```sh
pnpm add --save-dev @scruple/provider-laya
pip install laya
```

Replace the provider in `scruple.config.ts`:

```ts
import { layaProvider } from "@scruple/provider-laya";

provider: layaProvider({
  model: "typed-decisions",
  python: "python3",
  preload: true,
}),
```

Scruple keeps one Python process and preloaded router alive for the run. `model: "auto"` uses Laya's
language router. Laya has a smaller context budget than Jev, so calibrate thresholds separately for
each provider and model.

## Rules and plugins

Scruple has no core policy. The included category packages are examples of independently
publishable rule packs, not rules built into the engine:

- `comments/no-useless-comments` identifies comments that add no useful rationale, constraint, or
  context.
- `comments/no-misleading-comments` identifies comments that contradict the visible code.
- `comments/no-commented-out-code` identifies disabled implementation code preserved in comments.
- `comments/no-change-history-comments` keeps completed change narration in version control.
- `comments/prefer-concise-comments` identifies useful comments padded with unnecessary prose.
- `comments/require-actionable-todos` requires TODO, FIXME, and HACK comments to explain meaningful
  follow-up work.
- `tests/no-vacuous-tests` identifies tests that do not meaningfully verify behavior.
- `relational-databases/prefer-database-join` identifies function-level in-memory joins that can
  reasonably be performed by the available database layer.

A plugin registers named semantic rules. Enabled rules collect normalized source targets and create
typed decision questions, then deterministically turn provider answers into diagnostics or abstain.
Rules provide stable diagnostic text and never ask a model to generate messages or fixes.

OXC is the initial parser, but plugins depend on normalized source excerpts, locations, imports,
calls, and facts rather than serialized syntax trees. Both parsers and decision providers are
swappable through the `SourceParser` and `DecisionProvider` interfaces.

```text
source → parser → normalized targets → enabled plugin rules → decision provider → diagnostics
           OXC                                            Jev or local Laya
```

## Develop Scruple

```sh
pnpm install
pnpm fix
pnpm check
```

`pnpm fix` applies safe Oxlint fixes and Oxfmt formatting. `pnpm check` verifies formatting, linting,
types, builds, and the deterministic Node test suite without modifying source files. Public packages
are emitted as unbundled ESM with declarations, source maps, and TypeScript source. The compiled
`scruple` bin leaves dependencies external so parser, provider, and rule plugins resolve from the
consuming project.

Live model evaluations are separate from deterministic checks:

```sh
# Jev; requires TYPESAFE_API_KEY
pnpm eval

# Local Laya
pnpm eval --provider laya --model typed-decisions

# Compare providers with two runs per pair
pnpm eval --provider jev --provider laya \
  --model jev-1.13.0 --model typed-decisions --repetitions 2
```

The eval runner reports per-case failures, requested and resolved models, token and model-call
counts, repetitions, and p50/p95/total latency as JSON. It exits 1 when decisions miss fixture
expectations and 2 for operational or configuration errors.

### Release

Scruple uses one version for every public package. Prepare and verify a release on `main`:

```sh
pnpm release:version 0.1.0
pnpm check
git add package.json packages/*/package.json
git commit -m "🔖 Release v0.1.0"
git tag -a v0.1.0 -m "🔖 Release v0.1.0"
git push origin main
git push origin v0.1.0
```

The tag workflow checks the fixed version, rebuilds and tests the repository, installs every packed
tarball in a clean npm consumer, then publishes those exact tarballs with provenance and creates a
GitHub release. Rerun it manually with an existing tag after a partial failure; already-published
package versions are skipped.

The `publish` job uses the GitHub `npm` environment and authenticates through short-lived OIDC. Each
package's trusted GitHub publisher points to `NAlexPear/scruple`, `release.yml`, environment `npm`,
with direct publishing enabled.

## License

[MIT](LICENSE)
