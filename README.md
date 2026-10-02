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
  A language-agnostic engine for semantic code checks. Combine language-specific parsers, typed decision providers, and rules your team owns to make engineering judgment testable.
</p>

<p align="center">
  <a href="https://scruple.dev/guide/quickstart">Get started</a> ·
  <a href="https://scruple.dev/">Read the docs</a> ·
  <a href="https://scruple.dev/guide/writing-a-plugin">Write a rule</a> ·
  <a href="https://scruple.dev/guide/agent-skills">Install agent skills</a>
</p>

The documentation is also available as [an LLM index](https://scruple.dev/llms.txt),
[one Markdown bundle](https://scruple.dev/llms-full.txt), and raw Markdown from the **Copy page**
control on every documentation page.

## What Scruple maintains

Scruple maintains the core parser and rule interfaces, the execution engine and CLI, blessed
language-specific parser packages, decision providers, rule-authoring and testing skills, and eval
tooling. `@scruple/parser-oxc` is the blessed parser for JavaScript, JSX, TypeScript, and TSX.

Downstream authors own language- and framework-specific rules: their evidence selection, policy,
diagnostics, tests, and maintenance. Scruple is stopping publication of maintained first-party rule
packs. Existing specialized rules are moving to unsupported examples and test implementations in a
separate branch; they are not a supported rule distribution.

**Language-agnostic orchestration does not make a rule language-independent.** Parsers advertise the
languages and file patterns they support. Plugins and rules declare their language applicability,
which authors must validate with representative tests and evals.

## Where Scruple fits

| Check                          | Typical performance             | Scope                                                                                  | Cost                                                     |
| ------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Compiler and linter            | Usually fastest                 | Syntax, types, formatting, and known patterns                                          | Varies by tool and local or CI compute                   |
| Security and codebase analysis | Depends on codebase and caching | Cross-file data flow, dependencies, and codebase-wide patterns                         | Varies by tool and deployment                            |
| Scruple                        | Depends on targets and provider | Named, focused standards that require interpretation                                   | MIT plus hosted model usage or local storage and compute |
| Reviewers                      | Depends on change and reviewer  | Human reviewers and AI review bots can use broader repository and organization context | People time or review-tool fees                          |

## Use Scruple

Scruple requires Node.js 22.18 or newer. Install the engine, CLI, a parser for your source language,
and a provider. This example uses OXC and Jev:

```sh
pnpm add --save-dev \
  @scruple/cli \
  @scruple/core \
  @scruple/parser-oxc \
  @scruple/provider-jev
```

Create `scruple.config.ts`:

```ts
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
  plugins: {},
  rules: {},
});
```

This validates parsing and configuration but intentionally enables no semantic checks. Add your own
plugin using the [rule-authoring tutorial](https://scruple.dev/guide/writing-a-plugin), or a downstream
plugin you trust, then enable its rules. No rules run merely because a parser or plugin is installed.

The configuration reads the API key from the environment. With no explicit patterns, the CLI uses
the parser's `filePatterns`; positional patterns override that discovery for a run:

```sh
pnpm exec scruple
pnpm exec scruple "src/**/*.{ts,tsx}"
pnpm exec scruple --format json
```

`parser` accepts one `SourceParser` or a non-empty array of parsers. Each parser owns its language IDs,
default file patterns, and `supports(filename)` predicate. Each file must match at most one parser.
The engine runs rules only on documents matching their declared language scope. See
[configuration](https://scruple.dev/guide/configuration#file-selection) for multi-language projects.

The CLI caches successful decisions in `node_modules/.cache/scruple`, including collection
classifications. Repeated checks skip matching provider requests. Configure a `DecisionCache` for
remote or other storage, set `cache: false` to disable the default, or use `--no-cache` and
`--cache-dir <path>` as per-run overrides.

The Jev provider defaults to the pinned `jev-1.13.0` model rather than the moving `jev-latest`
alias. A run exits 0 when it has no error-severity findings, 1 when it finds at least one error, and
2 when configuration, parsing, or provider operations fail.

Published Scruple packages use compiled JavaScript by default and expose their raw TypeScript through
the opt-in `source` condition. Node.js 22.18 and newer can resolve the same package imports to source:

```sh
node --conditions=source app.ts
```

Use this only when the runtime or bundler supports erasable TypeScript syntax and custom conditions.

### Use Scruple with coding agents

This repository includes agent skills for configuring Scruple, authoring rules and plugins, and
building decision-provider adapters. Use the cross-agent installer to choose skills and a supported
coding-agent harness interactively:

```sh
npx skills add NAlexPear/scruple
```

See the [agent skills guide](https://scruple.dev/guide/agent-skills) for non-interactive commands for
Amp, Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, and OpenCode, plus direct access to the
bare skills.

### Configure rules

Plugins register rules without enabling them. Configure each rule separately with `"off"`, `"warn"`,
or `"error"`; use a `[severity, options]` tuple for rule-specific options. For the `todoPolicy` plugin
built in the tutorial (import it from your own package or module):

```ts
plugins: {
  todos: todoPolicy(),
},
rules: {
  "todos/require-specific-todo": [
    "error",
    { threshold: { warning: 0.9, error: 0.97 } },
  ],
},
```

The key in `plugins` supplies the namespace used by its rule IDs. Unknown rules and rules whose
plugin is not registered are configuration errors.

`threshold` always has separate `warning` and `error` probabilities. A number is not accepted, and
`warning` cannot exceed `error`. The provider must choose the
finding label and meet `minConfidence` first. A score at the warning threshold but below the error
threshold produces a non-blocking warning. A score at or above the error threshold produces a
blocking error. A rule configured as `"warn"` caps either result at warning, while `"error"` permits
both tiers.

### Suppress a finding

Use a full rule ID to suppress an exceptional target without disabling the rule for the project:

```ts
// scruple-disable-next-line todos/require-specific-todo -- Tracked in the project backlog.
// TODO: revisit this.
const status = deriveStatus();
```

Scruple also supports `scruple-disable-line` and paired `scruple-disable` and `scruple-enable` region
comments. Suppressed targets are removed before collection classification or final provider evaluation.
See [inline suppressions](https://scruple.dev/guide/configuration#inline-suppressions) for the complete
syntax.

## Plugins and rules

Scruple has no core policy or maintained first-party rule packs. Downstream plugins provide
independently publishable rules, and consumers choose which to trust and enable. A plugin declares
`languages`, and an individual rule may override that scope. Shared source contracts do not establish
correctness across languages or frameworks; the rule author owns that evidence.

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
thresholds and reports its own diagnostic or nothing. Provider answers, severity, and which findings appear may
vary. Rules provide fixed diagnostic text and never ask a model to generate messages or fixes.

Language-specific parsers expose normalized source excerpts, locations, imports, calls, and facts
rather than serialized syntax trees. The `SourceParser`, `SemanticRule`, and `DecisionProvider`
interfaces separate parsing, rule policy, and model decisions. Scruple includes provider adapters for
Cloudflare Clef, local Decider, self-hosted Kev, and Jev. Use the maintained authoring skills and eval
tooling to test your own rules against the languages, frameworks, and providers you support.

```text
source → language-specific parser → applicable rules → decisions → diagnostics
                                         ↘ provider classification ↗
```

## License

[MIT](LICENSE)
