# @scruple/core

Provider-neutral engine, configuration helpers, and parser, provider, and rule-plugin contracts for [Scruple](https://github.com/NAlexPear/scruple). Rules can collect candidates synchronously from parser facts or asynchronously classify bounded possible targets through an engine-managed provider context.

```sh
pnpm add --save-dev @scruple/core
```

`runScruple` accepts an optional provider-neutral `DecisionCache`. Cache hits apply to both collection
and final decisions while provider request and token statistics continue to describe uncached work.

Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
