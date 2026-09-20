# @scruple/cli

Command-line interface for [Scruple](https://github.com/NAlexPear/scruple), a pluggable semantic code checker.

```sh
pnpm add --save-dev @scruple/cli
pnpm exec scruple check "src/**/*.{ts,tsx}"
```

Use `--explain` to audit every provider decision, including accepted and abstained candidates. Combine it with `--format json` for structured output.

Install and configure a parser, decision provider, and rule plugins alongside the CLI. See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme) for a complete configuration.
