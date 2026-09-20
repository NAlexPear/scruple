# How Scruple works

Scruple separates source understanding, policy, and model execution so each can evolve independently.

```text
source files
    ↓
source parser
    ↓
normalized documents and targets
    ↓
enabled plugin rules
    ↓
typed provider decisions
    ↓
stable diagnostics
```

## Parse once

The parser produces normalized documents with source locations, imports, module references, comments, functions, tests, error handlers, and captured calls. Plugins depend on these contracts rather than a parser-specific syntax tree.

The OXC parser supports JavaScript and TypeScript extensions and can recognize custom test callees.

## Collect bounded candidates

A semantic rule's `collect` function examines one parsed document. Each candidate contains a target, JSON state, a typed question, and optional rule-owned data.

A repository rule receives all parsed documents and returns findings directly. It is useful when the answer is deterministic, such as enforcing import layers.

## Batch decisions

Scruple combines independent questions that share the same evidence state into one provider request. Requests run up to the configured concurrency limit.

## Diagnose deterministically

After the provider responds, each semantic rule decides whether the answer satisfies its probability and confidence thresholds. The rule either returns a diagnostic with its fixed message or returns `null`.

Operational failures are reported separately from diagnostics and produce exit code 2.
