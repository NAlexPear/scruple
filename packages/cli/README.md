# @scruple/cli

Command-line interface for running Scruple checks over selected source files.

```sh
pnpm add --save-dev @scruple/cli
pnpm exec scruple "src/**/*.{ts,tsx}"
```

Use `--explain` to audit every provider decision, including accepted and abstained candidates. Combine it with `--format json` for structured output.

Install and configure a parser, decision provider, and rule plugins alongside the CLI. Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
