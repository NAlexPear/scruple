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
      "value": " Set ready to true",
      "style": "line"
    },
    "context": {
      "enclosing_code": "async function warmCache() {\n  // Set ready to true\n  ready = true;\n}"
    }
  },
  "questions": {
    "comments_no-useless-comments_0": {
      "type": "noul",
      "instructions": "Does `comment` add no maintainability value because it merely restates obvious code, uses generic section-heading prose, narrates a straightforward next step, or contains AI-assistant meta commentary? A misleading claim, disabled code, change-history note, or TODO belongs to a different rule and is not useless for this question.",
      "criteria": {
        "true": "The comment adds no useful rationale, constraint, warning, domain knowledge, or non-obvious explanation.",
        "false": "The comment adds useful current information, or it has a distinct problem owned by another comments rule."
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
      "type": "noul",
      "noul": 0.96
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

if (answer.type !== "noul" || answer.noul < threshold) {
  return null;
}

return {
  message: "This comment appears to add no useful information.",
  probability: answer.noul,
};
```

An answer of `0.96` produces the diagnostic. An answer of `0.72` returns `null`, so Scruple reports nothing for that candidate.

Thresholds are provider and model dependent. Calibrate them against representative positive and negative examples before enabling a rule broadly.

## Stable output

Rules own messages, locations, and severity mapping. Providers cannot generate text that appears as a diagnostic. This keeps CI output stable when provider implementations change.
