# @scruple/cli

Command-line interface for running Scruple checks over selected source files.

```sh
pnpm add --save-dev @scruple/cli
pnpm exec scruple "src/**/*.{ts,tsx}"
```

Use `--explain` to audit every final candidate decision, including accepted and abstained candidates.
Collection classifications are not included because they only filter possible targets. Combine
`--explain` with `--format json` for structured output.

Install and configure a parser, decision provider, and rule plugins alongside the CLI. Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
