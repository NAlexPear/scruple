# Evidence and decisions

Scruple does not ask a model to review an entire repository or produce free-form findings. Plugins define the evidence and answer shape before a request is made.

## A complete decision request

For the comment in the [end-to-end example](./how-it-works.md#one-comment-end-to-end), `comments/no-useless-comments` creates this provider request:

```json
{
  "state": {
    "language": "typescript",
    "comment": {
      "source": "// Set ready to true",
      "source_truncated": false,
      "value": " Set ready to true",
      "value_truncated": false,
      "style": "line"
    },
    "context": {
      "enclosing_code": "async function warmCache() {\n  // Set ready to true\n  ready = true;\n}",
      "enclosing_code_truncated": false
    }
  },
  "questions": {
    "comments_no-useless-comments_0": {
      "type": "choice",
      "instructions": "Does `comment` add no maintainability value because it merely restates obvious code, uses generic section-heading prose, narrates a straightforward next step, or contains AI-assistant meta commentary? Distinguish genuinely useful rationale from comments owned by another rule. Choose insufficient_context when the bounded evidence does not establish whether the comment adds information.",
      "criteria": {
        "redundant": "The comment adds no useful rationale, constraint, warning, domain knowledge, or non-obvious explanation.",
        "useful": "The comment adds current rationale, a constraint, a warning, domain knowledge, or another non-obvious explanation.",
        "belongs_to_other_rule": "The comment's primary issue is that it is misleading, disabled code, change history, a deprecation, or another concern owned by a more specific rule.",
        "insufficient_context": "The bounded evidence does not establish whether the comment adds information beyond the code."
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
    "comments_no-useless-comments_0": {
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
  }
}
```

## Bounded evidence

Candidate state must be JSON. A plugin should include only the excerpts and facts required to answer its question. This keeps requests inspectable, repeatable, and within provider context limits.

## Question types

The core supports three typed question forms:

- **Noul:** a number from `0` through `1` expressing how strongly the evidence supports a binary proposition.
- **Choice:** one label from explicit criteria, with confidence and per-label probabilities.
- **Score:** an ordered score against a supplied legend.

Plugins choose the form that makes competing interpretations explicit.

## Thresholds and abstention

Provider output alone is not a finding. Rules validate answer shape, compare probabilities and confidence with configured thresholds, and may abstain when evidence is incomplete or ambiguous.

For `comments/no-useless-comments`, the rule-owned decision is equivalent to:

```ts
const threshold = 0.9;
const minConfidence = 0.7;
const probability = answer.type === "choice" ? (answer.probabilities.redundant ?? 0) : 0;

if (
  answer.type !== "choice" ||
  answer.choice !== "redundant" ||
  probability < threshold ||
  answer.confidence < minConfidence
) {
  return null;
}

return {
  message: "This comment appears to add no useful information.",
  probability,
  confidence: answer.confidence,
};
```

The example produces a diagnostic because the provider chose `redundant`, assigned that label a probability of `0.96`, and returned `0.94` confidence. The CLI displays 96% because that is the provider score for the finding label, not certainty. Confidence is a separate provider score. The rule checks it against the `0.7` minimum, but the stylish CLI diagnostic does not display it. A safe choice, a `redundant` probability below `0.9`, or confidence below `0.7` returns `null`, so Scruple reports nothing for that candidate.

Thresholds are provider and model dependent. Calibrate them against representative positive and negative examples before enabling a rule broadly.

## Rule-owned output

Rules own messages, locations, severity mapping, and fixed thresholds. Providers cannot generate text that appears as a diagnostic. The same provider answer therefore produces the same rule output, but provider answers and the set of findings can vary by model, provider, or run.
