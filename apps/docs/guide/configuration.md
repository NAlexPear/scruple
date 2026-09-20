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

## Warning and error thresholds

Decision rules use separate probability thresholds for warnings and errors:

```ts
rules: {
  "tests/no-vacuous-tests": [
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
// scruple-disable-next-line resources/require-cleanup-on-failure -- Framework closes it.
export async function loadRecord() {
  const connection = await pool.connect();
  return connection.findFirst();
}

smoke(); // scruple-disable-line tests/no-vacuous-tests -- Intentional.
```

Disable one or more rules for a region with `scruple-disable`, then restore them with `scruple-enable`:

```ts
/* scruple-disable tests/no-vacuous-tests -- Smoke-test fixtures. */
export const fixture = buildFixture();
/* scruple-enable tests/no-vacuous-tests */
```

Separate multiple rule IDs with commas. Omit rule IDs to affect every active rule. A rule-specific `scruple-enable` can re-enable that rule inside an all-rule disabled region. Text after `--` is a justification, not part of the rule list.

Scruple checks suppression before collection classification and again before final evaluation. A
suppressed target therefore consumes no provider tokens and produces no `--explain` decision. The
[`comments/require-justified-suppressions`](../plugins/comments.md#commentsrequire-justified-suppressions)
rule can review suppression scope and rationale.

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

See the [Configuration API](../reference/configuration.md) for the complete field reference.
