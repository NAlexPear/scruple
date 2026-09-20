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
  "type": "choice",
  "choice": "redundant",
  "confidence": 0.94,
  "probabilities": {
    "redundant": 0.96,
    "useful": 0.01,
    "belongs_to_other_rule": 0.01,
    "insufficient_context": 0.02
  }
}
```

```text [4. Diagnostic]
src/cache.ts
  2:3       warning This comment appears to add no useful information. (96%)  comments/no-useless-comments
```

:::

The parser identifies the comment and its surrounding function. The enabled rule selects bounded evidence and asks the provider to choose `redundant`, `useful`, `belongs_to_other_rule`, or `insufficient_context`. The provider returns only a typed answer. The displayed 96% is the provider's score for the `redundant` finding label, not a statement of certainty. The answer also has `0.94` confidence. Because the choice is `redundant`, its probability meets the rule's `0.9` threshold, and confidence meets the `0.7` minimum, the rule emits its own fixed diagnostic message.

## Parse once

The parser produces normalized documents with source locations, imports, comments, functions, tests, error handlers, API boundaries, and captured calls. Plugins depend on these contracts rather than a parser-specific syntax tree.

The OXC parser supports JavaScript and TypeScript extensions and can recognize custom test callees.

## Collect bounded candidates

A semantic rule's `collect` function examines one parsed document. Each candidate contains a target, JSON state, a typed question, and optional rule-owned data.

## Batch decisions

Scruple combines independent questions that share the same evidence state into one provider request. Requests run up to the provider's concurrency limit.

## Apply rule-owned policy

After the provider responds, each semantic rule applies fixed probability and confidence thresholds to that answer. For a given answer, the rule returns its own fixed diagnostic or `null`. Provider answers can vary, so which findings appear can also vary between runs or providers.

Operational failures are reported separately from diagnostics and produce exit code 2.
