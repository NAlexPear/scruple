# Rule design checklist

## Evidence

- Start from parser-provided comments, functions, tests, error handlers, API boundaries, or structured facts.
- Keep each source excerpt bounded. If the parser marks evidence as truncated or ambiguous, carry that fact into the state and permit abstention.
- Put provider-visible JSON in `state`; put local diagnosis metadata in optional `data`.
- Do not serialize syntax trees, whole repositories, or unrelated functions.
- Keep selection deterministic unless semantic classification is truly required.

## Questions

- Use `noul` for a calibrated binary proposition.
- Use `choice` for named semantic categories, including a safe category and usually `insufficient_context`.
- Use `score` only when an ordered scale has meaningful anchored criteria.
- Ask about one decision. Split independent policies into separate rules.
- Criteria define categories; instructions establish scope and edge cases.

## Diagnosis

- Narrow the answer by `answer.type` before reading type-specific fields.
- Report only the intended finding category or range.
- Apply both probability and confidence thresholds when the answer supplies both.
- Treat missing, non-finite, malformed, safe, and insufficient-context answers as no diagnostic.
- Use the candidate target's filename and location.
- Keep the message stable, actionable, and independent of provider prose.

## Asynchronous collection

Use provider-assisted collection only to classify a bounded list of parser targets. Call the restricted
collection provider:

```ts
const response = await context.provider.evaluate(target, request, context.signal);
if (response === null) return [];
```

`null` means the engine suppressed that target. Do not recreate suppression, concurrency, request
counting, or token accounting in the rule.
