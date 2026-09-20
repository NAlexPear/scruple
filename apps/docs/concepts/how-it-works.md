# How Scruple works

Scruple uses a parser to find relevant code, rules to define questions and reporting thresholds, and a provider to answer those questions.

## One resource bug, end to end

Consider a file handle that closes only when every preceding operation succeeds:

::: code-group

```ts [1. Source]
import { open } from "node:fs/promises";

export async function parseReport() {
  const file = await open("report.txt");
  const report = parse(await file.readFile("utf8"));
  await file.close();
  return report;
}
```

```json [2. Target]
{
  "kind": "function",
  "filename": "src/report.ts",
  "language": "typescript",
  "location": {
    "start": { "line": 3, "column": 8 },
    "end": { "line": 8, "column": 2 }
  },
  "source": "async function parseReport() {\n  const file = await open(\"report.txt\");\n  const report = parse(await file.readFile(\"utf8\"));\n  await file.close();\n  return report;\n}",
  "async": true,
  "calls": [
    { "callee": "open", "source": "open(\"report.txt\")" },
    { "callee": "parse", "source": "parse(await file.readFile(\"utf8\"))" },
    { "callee": "file.readFile", "source": "file.readFile(\"utf8\")" },
    { "callee": "file.close", "source": "file.close()" }
  ]
}
```

```json [3. Answer]
{
  "type": "choice",
  "choice": "cleanup_not_failure_safe",
  "confidence": 0.94,
  "probabilities": {
    "cleanup_not_failure_safe": 0.96,
    "failure_safe": 0.01,
    "ownership_transferred": 0.01,
    "no_vulnerable_work": 0.01,
    "insufficient_context": 0.01
  }
}
```

```text [4. Diagnostic]
src/report.ts
  3:8       warning Ensure this resource is cleaned up when work fails. (96%)  resources/require-cleanup-on-failure
```

:::

The parser identifies the function, imports, and calls. The enabled rule asks whether failure can bypass cleanup, cleanup is guaranteed, ownership moves elsewhere, no vulnerable work exists, or the evidence is insufficient. The provider returns only a named answer and scores. The displayed 96% is the score for `cleanup_not_failure_safe`, not a statement of certainty. Because that score meets the rule's `0.9` threshold and confidence meets the `0.7` minimum, the rule emits its own fixed diagnostic message.

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
