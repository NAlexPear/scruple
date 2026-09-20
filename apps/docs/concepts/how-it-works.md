# How Scruple works

Scruple separates source understanding, policy, and model execution so each can evolve independently.

## One comment, end to end

Consider a comment that only narrates the assignment below it:

::: code-group

```ts [1. Source]
export async function warmCache() {
  // Set ready to true
  ready = true;
}
```

```json [2. Target]
{
  "kind": "comment",
  "filename": "src/cache.ts",
  "language": "typescript",
  "location": {
    "start": { "line": 2, "column": 3 },
    "end": { "line": 2, "column": 23 }
  },
  "source": "// Set ready to true",
  "style": "line",
  "value": " Set ready to true",
  "enclosingSource": "async function warmCache() {\n  // Set ready to true\n  ready = true;\n}"
}
```

```json [3. Answer]
{
  "type": "noul",
  "noul": 0.96
}
```

```text [4. Diagnostic]
src/cache.ts
  2:3       warning This comment appears to add no useful information. (96%)  comments/no-useless-comments
```

:::

The parser identifies the comment and its surrounding function. The enabled rule selects bounded evidence and asks a typed question. The provider returns only a typed answer. Because `0.96` meets the rule's default `0.9` threshold, the rule emits its own fixed diagnostic message.

## Parse once

The parser produces normalized documents with source locations, imports, comments, functions, tests, error handlers, API boundaries, and captured calls. Plugins depend on these contracts rather than a parser-specific syntax tree.

The OXC parser supports JavaScript and TypeScript extensions and can recognize custom test callees.

## Collect bounded candidates

A semantic rule's `collect` function examines one parsed document. Each candidate contains a target, JSON state, a typed question, and optional rule-owned data.

## Batch decisions

Scruple combines independent questions that share the same evidence state into one provider request. Requests run up to the configured concurrency limit.

## Diagnose deterministically

After the provider responds, each semantic rule decides whether the answer satisfies its probability and confidence thresholds. The rule either returns a diagnostic with its fixed message or returns `null`.

Operational failures are reported separately from diagnostics and produce exit code 2.
