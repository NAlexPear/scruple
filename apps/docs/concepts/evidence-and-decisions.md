# Evidence and decisions

Scruple does not ask a model to review an entire repository or produce free-form findings. Plugins
choose bounded targets and define the evidence and answer shape before every request is made.

## Collection and decision questions

Most rules use parser facts to choose candidates directly. A rule may instead ask the provider to
classify a bounded possible target when relevance depends on meaning rather than exact syntax. That
collection answer only decides whether the target becomes a candidate. It is not a finding.

Every selected candidate then receives the rule's decision question. Only this final answer can be
turned into a diagnostic. The provider must choose the finding label, while the rule owns the message
and reporting thresholds.

## A complete decision request

For the function in the [end-to-end example](./how-it-works.md#one-resource-bug-end-to-end), `resources/require-cleanup-on-failure` creates this provider request:

```json
{
  "state": {
    "language": "typescript",
    "imports": ["import { open } from \"node:fs/promises\";"],
    "function": "async function parseReport() {\n  const file = await open(\"report.txt\");\n  const report = parse(await file.readFile(\"utf8\"));\n  await file.close();\n  return report;\n}",
    "calls": ["open", "parse", "file.readFile", "file.close"],
    "errorHandlers": []
  },
  "questions": {
    "resources_require-cleanup-on-failure_0": {
      "type": "choice",
      "instructions": "This rule is about a visible cleanup plan that an abrupt path can bypass, rather than the absence of cleanup in general. Can work or a later acquisition fail after this function acquires an owned resource but before its intended cleanup is guaranteed? Also consider whether one cleanup throwing prevents another owned resource from being cleaned up. Accept `using`/`await using`, disposal stacks, correctly nested `finally`, and clearly scoped management helpers. A returned resource is ownership transfer. Abstain when ownership, failure behavior, or a helper contract is opaque.",
      "criteria": {
        "cleanup_not_failure_safe": "The function has intended cleanup, but a visible failure, later acquisition, early exit, or earlier throwing cleanup can bypass it.",
        "failure_safe": "Cleanup is guaranteed on visible failure paths by `using`, a disposal stack, correctly nested `finally`, or a clearly scoped management helper.",
        "ownership_transferred": "The acquired resource is returned or visibly transferred, so this function is not responsible for later cleanup.",
        "no_vulnerable_work": "No potentially failing operation occurs while this function visibly owns the resource before cleanup.",
        "insufficient_context": "The available function and imports do not establish ownership or whether cleanup is failure-safe."
      }
    }
  }
}
```

The provider returns a named answer with no diagnostic prose:

```json
{
  "model": "example-model",
  "answers": {
    "resources_require-cleanup-on-failure_0": {
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
  }
}
```

## Bounded evidence

Collection and candidate state must be JSON. A plugin should include only the excerpts and facts
required to answer each question. This keeps requests inspectable and within provider context limits.

## Question types

The core supports three typed question forms:

- **Noul:** a number from `0` through `1` expressing how strongly the evidence supports a binary proposition.
- **Choice:** one label from explicit criteria, with confidence and per-label probabilities.
- **Score:** an ordered score against a supplied legend.

Plugins choose the form that makes competing interpretations explicit.

## Thresholds and abstention

Provider output alone is not a finding. The provider must choose the rule's finding label and meet
`minConfidence`. The chosen label's probability then determines the tier. At or above `warning` but
below `error` is a non-blocking warning. At or above `error` is a blocking error. A rule configured as
`"warn"` caps output at warning, while `"error"` permits either tier.

For `resources/require-cleanup-on-failure`, the rule-owned decision is equivalent to:

```ts
const threshold = { warning: 0.9, error: 0.97 };
const minConfidence = 0.7;
const probability =
  answer.type === "choice" ? (answer.probabilities.cleanup_not_failure_safe ?? 0) : 0;

if (
  answer.type !== "choice" ||
  answer.choice !== "cleanup_not_failure_safe" ||
  probability < threshold.warning ||
  answer.confidence < minConfidence
) {
  return null;
}

const severity = probability >= threshold.error ? "error" : "warning";
return {
  message: "Ensure this resource is cleaned up when work fails.",
  severity,
  probability,
  confidence: answer.confidence,
};
```

The rule reports a diagnostic because all three checks pass:

- The provider chose `cleanup_not_failure_safe`.
- The probability for `cleanup_not_failure_safe` is `0.96`, above the `0.9` warning threshold and below the `0.97` error threshold.
- Confidence is `0.94`, above the `0.7` minimum.

The result is therefore a warning. The `stylish` formatter displays the 96% label probability. It does not display confidence. This percentage is a provider score, not a claim of certainty. The rule returns `null` if the provider chooses another label, confidence is too low, or probability is below the warning threshold.

Thresholds are provider and model dependent. Calibrate them against representative positive and negative examples before enabling a rule broadly.

## Rule-owned output

Rules own messages, locations, and fixed thresholds. Providers cannot generate text that appears as a diagnostic. The same provider answer therefore produces the same rule output, but provider answers, severity, and the set of findings can vary by model, provider, or run.
