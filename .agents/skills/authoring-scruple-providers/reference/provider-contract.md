# Provider contract checklist

## Request mapping

- Preserve `request.state` as JSON data.
- Preserve question names because Scruple correlates answers by those names.
- Map `noul.instructions` and optional true/false criteria.
- Map `choice.instructions` and every named criterion.
- Map `score.instructions` and the ordered criterion tuple without reordering it.
- Do not combine, split, or rewrite questions in ways that change their semantics.

## Response mapping

- Return `answers` under the same names as the request.
- Preserve answer discriminants and type-specific fields.
- Return the actual resolved model, not merely the requested alias, when the service supplies it.
- Normalize token fields to `{ inputTokens, outputTokens }`.
- Omit `usage` only when the service genuinely does not supply it.

The engine reports an operational error when an expected named answer is absent. The adapter should
still reject malformed service payloads at its boundary when its SDK does not already do so.

## Lifecycle and failures

- Propagate the caller's `AbortSignal`.
- Keep timeout and retry ownership in one layer to avoid multiplied retries.
- Do not retry validation, authentication, or deterministic protocol errors.
- Avoid module-level mutable clients unless the package contract deliberately shares them.
- `close` releases only resources owned by this provider instance.

## Contract-test oracle

A useful fake transport captures the complete outbound body and returns a response containing:

- a resolved model different from the configured alias;
- one answer of each supported type;
- asymmetric token counts;
- enough distinctive criteria and state values to catch dropped or reordered fields.

Assert values, not merely that the request completed.
