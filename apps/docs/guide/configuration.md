# Configuration

Scruple loads `scruple.config.ts`, `.mts`, `.js`, or `.mjs` from the current working directory. Pass `--config` to use another path.

## Minimal shape

```ts
import { defineConfig } from "@scruple/core";

export default defineConfig({
  parser,
  provider,
  plugins: {},
  rules: {},
});
```

`defineConfig` preserves plugin-specific rule option types, so an editor can validate namespaced rule IDs and option objects.

## Rules

A rule accepts `"off"`, `"warn"`, or `"error"`. Pass options in a tuple:

```ts
rules: {
  "comments/no-misleading-comments": "error",
  "comments/prefer-concise-comments": ["warn", { minCharacters: 160 }],
  "comments/require-actionable-todos": "off",
},
```

Warnings are reported but do not produce exit code 1. Error-severity findings do.

## File selection

Use `include` when the CLI receives no positional patterns. `ignore` extends Scruple's built-in exclusions for dependencies, build output, coverage, and Git metadata.

```ts
export default defineConfig({
  // parser, provider, plugins, rules
  include: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
  ignore: ["src/generated/**"],
});
```

Positional CLI patterns override `include` for that run.

## Concurrency

`concurrency` limits simultaneous provider requests. It must be a positive integer and defaults to `4`.

```ts
export default defineConfig({
  // parser, provider, plugins, rules
  concurrency: 2,
});
```

See the [Configuration API](../reference/configuration.md) for the complete field reference.
