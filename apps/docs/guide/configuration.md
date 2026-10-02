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

The parser is language-specific; Scruple maintains blessed parser packages such as
`@scruple/parser-oxc` for JavaScript/TypeScript. Supply one parser or a non-empty array. Plugins come
from your own code or downstream authors, not a maintained first-party rule pack. They declare their
language applicability; callers register and enable rules rather than assigning languages to them.

## Rules

A rule accepts `"off"`, `"warn"`, or `"error"`. For the `todoPolicy` plugin from
[Write a plugin](./writing-a-plugin.md), register it and pass options in a tuple:

```ts
plugins: { todos: todoPolicy() },
rules: {
  "todos/require-specific-todo": ["warn", { minConfidence: 0.8 }],
},
```

Import `todoPolicy` from the module or package where you authored it. These are configuration
fragments, not references to a published Scruple rule pack. Warnings are reported but do not produce
exit code 1. Error-severity findings do. Registration alone enables no rules.

## Warning and error thresholds

Decision rules use separate probability thresholds for warnings and errors:

```ts
rules: {
  "todos/require-specific-todo": [
    "error",
    {
      threshold: {
        warning: 0.9,
        error: 0.97,
      },
    },
  ],
},
```

The provider must choose the rule's finding label and meet `minConfidence`. A probability from
`threshold.warning` up to `threshold.error` produces a non-blocking warning. A probability at or
above `threshold.error` produces a blocking error.

The configured rule severity sets the highest result the rule may produce. `"warn"` caps every
finding at warning. `"error"` allows the thresholds to choose warning or error.

## Inline suppressions

Use a `scruple-disable` comment when a rule is generally useful but should skip one target. Put `scruple-disable-next-line` immediately above the reported line, or put `scruple-disable-line` on that line. Include the full `plugin/rule` ID.

```ts
// scruple-disable-next-line todos/require-specific-todo -- Tracked in the project backlog.
// TODO: revisit this.

/* TODO: revisit this. */ // scruple-disable-line todos/require-specific-todo -- Tracked separately.
```

Disable one or more rules for a region with `scruple-disable`, then restore them with `scruple-enable`:

```ts
/* scruple-disable todos/require-specific-todo -- Documentation fixtures. */
// TODO: revisit this.
export const fixture = buildFixture();
/* scruple-enable todos/require-specific-todo */
```

Separate multiple rule IDs with commas. Omit rule IDs to affect every active rule. A rule-specific `scruple-enable` can re-enable that rule inside an all-rule disabled region. Text after `--` is a justification, not part of the rule list.

Scruple checks suppression before collection classification and again before final evaluation. A
suppressed target therefore consumes no provider tokens and produces no `--explain` decision. The
examples above use JavaScript comment syntax. Other languages depend on their parser exposing
comments with accurate locations. A downstream rule can review suppression scope and rationale.

## File selection

By default, the CLI discovers files using the `filePatterns` advertised by every configured parser.
Configure `parser` with an array to analyze multiple languages in one run. This is a conceptual
fragment: `anotherLanguageParser` stands for a parser you supply, not an available package name.

```ts
export default defineConfig({
  parser: [oxcParser(), anotherLanguageParser()],
  // provider, plugins, rules
});
```

Parsers advertise the document language IDs they produce. Plugins declare the languages their rules
support, and a rule can override its plugin's scope. Scruple skips rules for non-matching documents
and reports an enabled rule that matches none of the configured parser languages. Projects do not
repeat language scopes in configuration. OXC advertises the separate IDs `javascript`, `jsx`,
`typescript`, and `tsx`; supporting `typescript` alone does not include `tsx`.

Each parser's `supports(filename)` decides which files it can parse. Parser IDs must be unique, and
overlapping support for a file is an operational error, not a first-parser-wins fallback. Files that
no parser supports are skipped. Language scopes route rules; they do not prove that a rule's
assumptions are correct for a language or framework.

Use `include` to override those parser patterns when the CLI receives no positional patterns. `ignore`
extends Scruple's built-in exclusions for dependencies, build output, coverage, and Git metadata.

```ts
export default defineConfig({
  // parser, provider, plugins, rules
  include: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
  ignore: ["src/generated/**"],
});
```

Positional CLI patterns override both `include` and parser-provided patterns for that run.

See the [Configuration API](../reference/configuration.md) for the complete field reference.
