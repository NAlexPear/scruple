# How Scruple works

Scruple's language-agnostic engine uses language-specific parsers to find bounded code targets,
applicable downstream rules to select candidates and define reporting policy, and a provider to answer
narrow questions. A rule may use the provider once to decide whether an ambiguous target is relevant
and again to decide whether a selected candidate violates the rule.

## One resource bug, end to end

This TypeScript example illustrates a specialized rule, not a maintained first-party rule pack. Its
policy depends on JavaScript resource ownership and failure behavior; it is not a universal rule for
other languages.

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

The parser identifies the function, imports, and calls. The enabled rule asks whether failure can bypass cleanup, cleanup is guaranteed, ownership moves elsewhere, no vulnerable work exists, or the evidence is insufficient. The provider returns only a named answer and scores. The displayed 96% is the score for `cleanup_not_failure_safe`, not a statement of certainty. The provider chose that finding label, confidence meets the `0.7` minimum, and 96% is at least the `0.9` warning threshold but below the `0.97` error threshold. The rule therefore emits its own fixed warning.

## Parse once

Configure one `SourceParser` or a non-empty array. Each parser advertises concrete language IDs and
default `filePatterns`; `supports(filename)` routes files to it. Overlapping support is an error, not
a fallback order. The CLI uses parser patterns unless the caller supplies `include` or positional
patterns.

A parser produces normalized documents with source locations and the targets and facts its language
supports. Plugins consume these contracts rather than a serialized parser-specific syntax tree.
Scruple maintains blessed language-specific parsers. OXC supports `javascript`, `jsx`, `typescript`,
and `tsx` and can recognize custom test callees; another language needs its own parser.

## Run only applicable rules

Every plugin declares `languages`. A rule may replace that scope with its own. Scruple filters rules
by the parsed document's language before collection and reports enabled rules that match none of the
configured parser languages. The caller does not maintain an extension-to-rule table.

Language applicability is an author-owned contract, not proof of semantic portability. Even rules
that consume normalized comments need tests for the languages they claim to support. Downstream
authors own their language/framework policy and its maintenance; Scruple maintains the interfaces,
providers, authoring/testing skills, and eval tooling.

## Collect bounded candidates

A semantic rule's `collect` function examines one parsed document. Straightforward rules select
candidates from normalized syntax and facts. When that would require a brittle list of spellings or
names, an asynchronous collector can send each bounded possible target to the configured provider for
classification. For example, the TODO rule can recognize `to-do:` as a maintenance marker without
mistaking “return the to-do list” for one.

The provider does not search the file. The rule chooses every possible target and the exact
classification labels. Each final candidate contains a target, JSON state, a typed decision question,
and optional rule-owned data.

## Batch decisions

Scruple combines independent final questions that share the same evidence state into one provider
request. Collection and final requests share the provider's concurrency limit and token accounting.
Suppressed targets are discarded before either request is sent. The CLI checks its decision cache
before sending any request and records cache hits separately from provider calls.

## Apply rule-owned policy

After the provider responds, each semantic rule checks the chosen label and minimum confidence, then applies fixed warning and error probability thresholds. A score from warning up to error is non-blocking. A score at or above error is blocking. The configured rule level may cap the result at warning. Provider answers can vary, so severity and which findings appear can also vary between runs or providers.

Operational failures are reported separately from diagnostics and produce exit code 2.
