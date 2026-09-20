# Scruple

Scruple is a pluggable semantic code checker that turns focused source evidence and Jev or local Laya decisions into deterministic diagnostics.

## Use Scruple

The packages are configured for npm but have not been published yet; the commands below describe
the first release.

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

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider(),
  plugins: [...comments(), ...tests(), ...relationalDatabases()],
});
```

Set `TYPESAFE_API_KEY`, then check source files:

```sh
pnpm exec scruple check "src/**/*.{ts,tsx}"
pnpm exec scruple check --format json
```

The Jev provider defaults to the pinned `jev-1.13.0` model rather than the moving `jev-latest`
alias. A run exits 0 when it has no error-severity findings, 1 when it finds at least one error, and
2 when configuration, parsing, or provider operations fail.

### Configure rules

Category factories enable their rules by default. Pass options to configure a rule or `false` to
disable it:

```ts
plugins: [
  ...comments({
    noUselessComments: { severity: "warning", threshold: 0.95 },
  }),
  ...tests({
    noVacuousTests: false,
  }),
  ...relationalDatabases({
    preferDatabaseJoin: { severity: "warning", threshold: 0.8 },
  }),
],
```

Each package also exports its individual plugin factories for granular composition.

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
- `tests/no-vacuous-tests` identifies tests that do not meaningfully verify behavior.
- `relational-databases/prefer-database-join` identifies function-level in-memory joins that can
  reasonably be performed by the available database layer.

A plugin's `collect` operation selects normalized source targets and creates typed decision
questions. Its `diagnose` operation deterministically turns an answer into a diagnostic or abstains.
Plugins provide their own stable diagnostic text and never ask a model to generate messages or
fixes.

OXC is the initial parser, but plugins depend on normalized source excerpts, locations, imports,
calls, and facts rather than serialized syntax trees. Both parsers and decision providers are
swappable through the `SourceParser` and `DecisionProvider` interfaces.

```text
source → parser → normalized targets → plugins → decision provider → diagnostics
           OXC                               Jev or local Laya
```

## Develop Scruple

```sh
pnpm install
pnpm check
```

`pnpm check` verifies formatting, lints, type-checks, builds, and runs the deterministic Node test
suite. Public packages are emitted as unbundled ESM with declarations, source maps, and TypeScript
source. The compiled `scruple` bin leaves dependencies external so parser, provider, and rule
plugins resolve from the consuming project.

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

## License

[MIT](LICENSE)
