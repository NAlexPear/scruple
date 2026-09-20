# Comments

`@scruple/comments` provides provider-backed semantic checks for source comments.

```sh
pnpm add -D @scruple/comments
```

```ts
import { defineConfig } from "@scruple/core";
import { comments } from "@scruple/comments";

export default defineConfig({
  parser,
  provider,
  plugins: { comments: comments() },
  rules: { "comments/no-misleading-comments": "warn" },
});
```

| Rule                                                                                   | Checks                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| [`comments/no-useless-comments`](#commentsno-useless-comments)                         | Comments that add no maintenance value  |
| [`comments/no-misleading-comments`](#commentsno-misleading-comments)                   | Claims contradicted by visible code     |
| [`comments/no-commented-out-code`](#commentsno-commented-out-code)                     | Disabled executable implementation      |
| [`comments/no-change-history-comments`](#commentsno-change-history-comments)           | Obsolete change narration               |
| [`comments/prefer-concise-comments`](#commentsprefer-concise-comments)                 | Useful but unnecessarily verbose prose  |
| [`comments/require-actionable-todos`](#commentsrequire-actionable-todos)               | Vague TODO, FIXME, or HACK markers      |
| [`comments/require-justified-suppressions`](#commentsrequire-justified-suppressions)   | Unexplained tool suppressions           |
| [`comments/require-actionable-deprecations`](#commentsrequire-actionable-deprecations) | Deprecations without migration guidance |

Tool directives, generated-code notices, licenses, preservation comments, and similar recognized metadata are ignored.

## `comments/no-useless-comments`

Checks ordinary non-TODO comments of at least eight trimmed characters for restatement, generic headings, straightforward narration, or assistant meta commentary. Defaults: `threshold: 0.9`, `minConfidence: 0.7`.

## `comments/no-misleading-comments`

Checks whether a concrete comment claim materially contradicts visible current code. Defaults: `threshold: 0.85`, `minConfidence: 0.7`.

## `comments/no-commented-out-code`

Distinguishes disabled executable implementation from examples, pseudocode, patterns, and data. Defaults: `threshold: 0.95`, `minConfidence: 0.7`.

## `comments/no-change-history-comments`

Checks history-like candidates for completed-change narration that no longer explains a current constraint or active compatibility behavior. Defaults: `threshold: 0.95`, `minConfidence: 0.7`.

## `comments/prefer-concise-comments`

Checks ordinary comments whose trimmed value is at least `minCharacters` for substantially reducible prose. Defaults: `threshold: 0.9`, `minConfidence: 0.65`, `minCharacters: 100`. `minCharacters` must be a non-negative safe integer.

```ts
rules: { "comments/prefer-concise-comments": ["warn", { minCharacters: 160 }] }
```

## `comments/require-actionable-todos`

Checks TODO, FIXME, and HACK comments for enough context to identify work, rationale, a removal condition, or a relevant issue. It does not require an owner, date, or ticket. Defaults: `threshold: 0.8`, `minConfidence: 0.7`.

## `comments/require-justified-suppressions`

Reviews explicit Scruple, lint, TypeScript, coverage, formatter, and Semgrep suppression directives. Generated code and deliberate negative fixtures are accepted. Defaults: `threshold: 0.85`, `minConfidence: 0.7`.

## `comments/require-actionable-deprecations`

Reviews `@deprecated` comments for a named replacement, concrete migration steps, or a useful explanation that no replacement exists. Defaults: `threshold: 0.85`, `minConfidence: 0.7`.

Probability options in this package must be finite values from `0` through `1`.
