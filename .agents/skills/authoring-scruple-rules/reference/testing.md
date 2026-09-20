# Rule testing and evaluations

## Focused tests

1. **Selection:** include relevant targets, exclude near-miss targets, preserve order, and assert an explicit request-size bound.
2. **Diagnosis:** test a warning, an error, a safe answer, insufficient context, wrong answer type, exact warning and error thresholds, values just below both thresholds, and non-finite values when they can cross a boundary.
3. **Integration:** register the plugin and assert final rule ID, severity, filename, location, message, provider model, and request statistics that matter.
4. **Options:** test defaults, rejection of the old numeric `threshold`, values outside `[0, 1]`, non-finite values, and `warning > error` at factory construction.
5. **Async collection:** test selected and rejected classifications, suppression returning `null`, cancellation propagation, and collection request accounting.

Derive expected values from the written policy and source location, not from implementation helpers.

## Semantic evaluation fixtures

For a built-in repository rule, add fixtures to `tests/eval-fixtures.json`:

- a realistic positive example;
- a close safe example;
- an `insufficient_context` example with `expected_abstention` when appropriate;
- `collection_choices` in provider-request order for asynchronous collectors;
- a rationale and useful tags for every fixture.

Register a new plugin in `packages/eval/src/plugins.ts`. Run `pnpm eval` for deterministic corpus
validation. Live-provider benchmarks are separate, may cost money, and require explicit credentials;
do not run them merely to validate fixture shape.

## Repository checks

Run the focused test first, followed by the checks justified by the change:

```sh
pnpm build
node --test tests/<plugin>.test.ts
pnpm eval
pnpm check
```

Do not claim semantic quality from typechecking alone.
