<p align="center">
  <a href="https://scruple.dev/">
    <img src="apps/docs/public/assets/scruple-mark.svg" width="112" alt="Scruple pen-nib mark">
  </a>
</p>

<h1 align="center">Scruple</h1>

<p align="center"><strong>Make good taste enforceable.</strong></p>

<p align="center">
  <a href="https://github.com/NAlexPear/scruple/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/NAlexPear/scruple/ci.yml?branch=main&event=push&label=main" alt="Main CI status"></a>
  <a href="https://github.com/NAlexPear/scruple/actions/workflows/docs.yml"><img src="https://img.shields.io/github/actions/workflow/status/NAlexPear/scruple/docs.yml?branch=main&event=push&label=docs" alt="Docs CI status"></a>
  <a href="https://github.com/NAlexPear/scruple/actions/workflows/scruple.yml"><img src="https://img.shields.io/github/actions/workflow/status/NAlexPear/scruple/scruple.yml?branch=main&event=push&label=scruple" alt="Scruple status"></a>
  <a href="https://www.npmjs.com/package/@scruple/cli"><img src="https://img.shields.io/npm/v/%40scruple%2Fcli?label=npm" alt="Published npm version"></a>
</p>

<p align="center">
  Scruple catches problems linters miss. Use its built-in rules or write your own to turn your team's engineering judgment into checks that run on every change.
</p>

<p align="center">
  <a href="https://scruple.dev/guide/quickstart">Get started</a> ·
  <a href="https://scruple.dev/">Read the docs</a> ·
  <a href="https://scruple.dev/plugins/">Browse the rules</a>
</p>

## Where Scruple fits

| Check                          | Typical performance             | Scope                                                                                  | Cost                                                     |
| ------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Compiler and linter            | Usually fastest                 | Syntax, types, formatting, and known patterns                                          | Varies by tool and local or CI compute                   |
| Security and codebase analysis | Depends on codebase and caching | Cross-file data flow, dependencies, and codebase-wide patterns                         | Varies by tool and deployment                            |
| Scruple                        | Depends on targets and provider | Named, focused standards that require interpretation                                   | MIT plus hosted model usage or local storage and compute |
| Reviewers                      | Depends on change and reviewer  | Human reviewers and AI review bots can use broader repository and organization context | People time or review-tool fees                          |

## Use Scruple

Scruple requires Node.js 22.18 or newer. This example uses the comments plugin with the Jev provider:

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
pnpm exec scruple "src/**/*.{ts,tsx}"
pnpm exec scruple --format json
```

The Jev provider defaults to the pinned `jev-1.13.0` model rather than the moving `jev-latest`
alias. A run exits 0 when it has no error-severity findings, 1 when it finds at least one error, and
2 when configuration, parsing, or provider operations fail.

Published Scruple packages use compiled JavaScript by default and expose their raw TypeScript through
the opt-in `source` condition. Node.js 22.18 and newer can resolve the same package imports to source:

```sh
node --conditions=source app.ts
```

Use this only when the runtime or bundler supports erasable TypeScript syntax and custom conditions.

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

Scruple also supports `scruple-disable-line` and paired `scruple-disable` and `scruple-enable` region
comments. Suppressed targets are removed before collection classification or final provider evaluation.
See [inline suppressions](https://scruple.dev/guide/configuration#inline-suppressions) for the complete
syntax.

## Plugins and rules

Scruple has no core policy. Plugins provide independently publishable rule packs, and consumers choose which rules to enable. Browse the [plugin and rule registry](https://scruple.dev/plugins/) for every available plugin, rule, option, and default.

### Put your team's taste in the repository

Every team has standards that live in review comments. Scruple turns those repeated comments into named, tested rules with fixed evidence selection and decision thresholds:

- "We preserve the original error here."
- "This test does not prove the behavior."
- "Retries need a deadline."
- "Explain why, not what."

If a review comment starts with "we usually," it may belong in a Scruple rule. [Write your own rule](https://scruple.dev/guide/writing-a-plugin).

A rule starts from bounded targets found by the parser. It can select candidates from syntax alone or
ask the provider a small classification question when names and spelling are ambiguous. Each selected
candidate then receives the rule's fixed decision question. The rule compares that answer with fixed
thresholds and reports its own diagnostic or nothing. Provider answers and which findings appear may
vary. Rules provide fixed diagnostic text and never ask a model to generate messages or fixes.

OXC is the initial parser, but plugins depend on normalized source excerpts, locations, imports,
calls, and facts rather than serialized syntax trees. Both parsers and decision providers are
swappable through the `SourceParser` and `DecisionProvider` interfaces.

```text
source → parser → possible targets → rules → selected candidates → decisions → diagnostics
           OXC                    ↘ provider classification ↗       Jev
```

## License

[MIT](LICENSE)
