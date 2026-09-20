<p align="center">
  <a href="https://scruple.alexpear.workers.dev/">
    <img src="apps/docs/public/assets/scruple-mark.svg" width="112" alt="Scruple pen-nib mark">
  </a>
</p>

<h1 align="center">Scruple</h1>

<p align="center"><strong>Make good taste enforceable.</strong></p>

<p align="center">
  <a href="https://github.com/NAlexPear/scruple/actions/workflows/ci.yml"><img src="https://github.com/NAlexPear/scruple/actions/workflows/ci.yml/badge.svg?branch=main" alt="Main CI status"></a>
  <a href="https://github.com/NAlexPear/scruple/actions/workflows/docs.yml"><img src="https://github.com/NAlexPear/scruple/actions/workflows/docs.yml/badge.svg?branch=main" alt="Docs CI status"></a>
</p>

<p align="center">
  Scruple catches problems linters miss. Use its built-in rules or write your own to turn your team's engineering judgment into checks that run on every change.
</p>

<p align="center">
  <a href="https://scruple.alexpear.workers.dev/guide/quickstart">Get started</a> ·
  <a href="https://scruple.alexpear.workers.dev/">Read the docs</a> ·
  <a href="https://scruple.alexpear.workers.dev/plugins/">Browse the rules</a>
</p>

## Where Scruple fits

Static tools check facts. Scruple checks judgment.

Keep fast checks close to your editor. Run Scruple after them in CI, before review, for questions that need more context than a syntax pattern can provide.

| Stage       | Product             | Best for                                                                |
| ----------- | ------------------- | ----------------------------------------------------------------------- |
| 01 / Editor | Compiler and linter | Types, syntax, formatting, and known code patterns.                     |
| 02 / CI     | Scruple             | Tests, errors, retries, contracts, comments, and your own standards.    |
| 03 / Review | People              | Architecture, product intent, and standards that still need discussion. |

Scruple is MIT licensed. Use hosted Jev and pay for model usage, or run Laya on your own hardware. It complements linters and security scanners rather than replacing them.

## Use Scruple

Scruple requires Node.js 22.18 or newer. This example uses the comments plugin with the hosted Jev provider:

```sh
pnpm add --save-dev \
  @scruple/cli \
  @scruple/comments \
  @scruple/core \
  @scruple/parser-oxc \
  @scruple/provider-jev
```

Create `scruple.config.ts`:

```ts
import { comments } from "@scruple/comments";
import { defineConfig } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required");
}

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  plugins: { comments: comments() },
  rules: {
    "comments/no-misleading-comments": "warn",
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
  "comments/no-misleading-comments": ["error", { threshold: 0.9 }],
},
```

The key in `plugins` supplies the namespace used by its rule IDs. Unknown rules and rules whose
plugin is not registered are configuration errors.

### Suppress a finding

Use a full rule ID to suppress an exceptional target without disabling the rule for the project:

```ts
// scruple-disable-next-line comments/no-misleading-comments -- Domain convention.
const status = deriveStatus();
```

Scruple also supports `scruple-disable-line` and paired `scruple-disable` and `scruple-enable` region comments. Suppressed candidates are removed before provider evaluation. See [inline suppressions](https://scruple.alexpear.workers.dev/guide/configuration#inline-suppressions) for the complete syntax.

### Use local Laya

Install the Laya provider and Laya itself:

```sh
pnpm add --save-dev @scruple/provider-laya
uv init --bare # Skip this if your project already has pyproject.toml
uv add laya
```

uv records Laya in `pyproject.toml` and creates or updates the project environment in `.venv`.

Replace the provider in `scruple.config.ts`:

```ts
import { layaProvider } from "@scruple/provider-laya";

provider: layaProvider({
  model: "typed-decisions",
  python: ".venv/bin/python",
  preload: true,
}),
```

On Windows, use `python: ".venv\\Scripts\\python.exe"`.

Scruple keeps one Python process and preloaded router alive for the run. `model: "auto"` uses Laya's
language router. Laya has a smaller context budget than Jev, so calibrate thresholds separately for
each provider and model.

## Plugins and rules

Scruple has no core policy. Plugins provide independently publishable rule packs, and consumers choose which rules to enable. Browse the [plugin and rule registry](https://scruple.alexpear.workers.dev/plugins/) for every available plugin, rule, option, and default.

### Put your team's taste in the repository

Every team has standards that live in review comments. Scruple turns those repeated comments into named, tested rules that run the same way on every change:

- "We preserve the original error here."
- "This test does not prove the behavior."
- "Retries need a deadline."
- "Explain why, not what."

If a review comment starts with "we usually," it may belong in a Scruple rule. [Write your own rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).

A plugin registers named rules. Semantic rules collect normalized source targets and create typed
decision questions, then deterministically turn provider answers into diagnostics or abstain. Rules
provide stable diagnostic text and never ask a model to generate messages or fixes.

OXC is the initial parser, but plugins depend on normalized source excerpts, locations, imports,
calls, and facts rather than serialized syntax trees. Both parsers and decision providers are
swappable through the `SourceParser` and `DecisionProvider` interfaces.

```text
source → parser → normalized targets → enabled plugin rules → decision provider → diagnostics
           OXC                                            Jev or local Laya
```

## License

[MIT](LICENSE)
