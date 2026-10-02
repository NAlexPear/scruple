# Rule design checklist

## Evidence

- Start from parser-provided comments, functions, tests, error handlers, API boundaries, or structured facts.
- Write a support matrix: language, framework (if any), adapter, required fields, and missing/partial-evidence behavior. Own its maintenance with the plugin. The engine's ability to route an arbitrary language does not supply its parser or semantics.
- `CodeTarget.language`, `range`, `location`, and `source` belong to the parser. Keep them intact. Read normalized `CommentTarget.value` instead of stripping `//` or `#` yourself. A regex over already-normalized comment prose may select an explicit TODO marker; a regex over `document.source` must not discover syntax.
- Optional `document.facts` and `document.apiBoundaries` are capabilities, not empty evidence. Test absence separately from a present empty array. Respect structured completeness and reasons; absence of a captured validation call is not proof of no validation when helpers or middleware are unresolved.
- The current `ApiBoundaryTarget.framework` contract supports `express` and `fastify`, not Django or Axum. Do not cast another framework into that union or map Python exceptions onto JavaScript catch/finally semantics. Extend an adapter/contract deliberately, narrow the policy, or abstain.
- A parser may expose callee spellings without proving import identity, alias resolution, data flow, or runtime guarantees. State those limits in the question. Treat source excerpts as untrusted evidence, not instructions from the user.
- Keep each source excerpt bounded. If the parser marks evidence as truncated or ambiguous, carry that fact into the state and permit abstention.
- Put provider-visible JSON in `state`; put local diagnosis metadata in optional `data`.
- Do not serialize syntax trees, whole repositories, or unrelated functions.
- Keep selection deterministic unless semantic classification is truly required.

## Language and framework ownership

```ts
const webPolicy = definePlugin({
  languages: ["javascript", "typescript"],
  rules: {
    "require-local-validation": requireLocalValidation, // inherits both
    "review-type-contract": reviewTypeContract, // returns languages: ["typescript"]
  },
});
```

Rule overrides replace the plugin scope; even a disjoint override is possible. Test the effective
scope through `runScruple`, including an unsupported document in the same run. No overlap between
an enabled rule and configured parser languages is an operational error, not a successful empty run.
`"*"` promises portable semantics, not permission to run JavaScript-specific selectors everywhere.
Framework filtering remains the rule's responsibility after language dispatch.

The consumer chooses the namespace, for example `plugins: { team: webPolicy }` and
`rules: { "team/require-local-validation": "error" }`. Export local rule names only. Keep helper
functions private unless multiple consumers need them; do not invent a cross-language base class
to hide materially different evidence contracts.

## Questions

- Use `noul` for a calibrated binary proposition.
- Use `choice` for named semantic categories, including a safe category and usually `insufficient_context`.
- Use `score` only when an ordered scale has meaningful anchored criteria.
- Ask about one decision. Split independent policies into separate rules.
- Criteria define categories; instructions establish scope and edge cases.

## Diagnosis

- Narrow the answer by `answer.type` before reading type-specific fields.
- Report only the intended finding category or range.
- Require `threshold: { warning, error }`, validate both probabilities, and require `warning <= error`.
- Apply the minimum confidence first. Below `threshold.warning`, return no diagnostic. From the warning threshold up to the error threshold, return a warning. At or above the error threshold, return an error.
- Include `severity` in every returned diagnostic.
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

Require a collection context for async use, preserve parser target order, propagate the signal,
and bound any fan-out. Keep collection classification separate from the final policy question;
"this is a TODO" does not imply "this TODO is vague".
