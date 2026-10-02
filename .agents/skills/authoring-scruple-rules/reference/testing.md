# Rule testing and evaluations

## Focused tests

1. **Selection:** include relevant targets, exclude near-miss targets, preserve order, and assert an explicit request-size bound. Include syntax-looking strings/comments, unsupported frameworks, absent optional fields, and partial evidence. Vary irrelevant `document.source` while keeping normalized targets fixed to catch source-scanning shortcuts.
2. **Diagnosis:** test a warning, an error, a safe answer, insufficient context, wrong answer type, exact warning and error thresholds, values just below both thresholds, and non-finite values when they can cross a boundary.
3. **Integration:** register the plugin with a consumer-chosen namespace through `defineConfig` and `runScruple`. Assert final rule ID, severity, filename, location, message, provider model, operational errors, and request statistics. Exercise plugin language inheritance, a rule-level override, unsupported-language exclusion, suppression before provider work, and no-overlap failure. Use real adapters for every advertised production language; label synthetic adapters as contract fixtures only.
4. **Options:** test defaults, rejection of the old numeric `threshold`, values outside `[0, 1]`, non-finite values, and `warning > error` at factory construction.
5. **Async collection:** test selected and rejected classifications, suppression returning `null`, cancellation propagation, and collection request accounting.

Derive expected values from the written policy and source location, not from implementation helpers.

## Semantic evaluation fixtures

Keep fixtures beside the downstream rule, independently labeled from the implementation. Include:

- a realistic positive example;
- a close safe example;
- an `insufficient_context` example with `expected_abstention` when appropriate;
- `collection_choices` in provider-request order for asynchronous collectors;
- a rationale and useful tags for every fixture.

Include the language/framework, source, expected candidate count, expected choice per candidate,
expected diagnostic count, and expected abstention. Avoid unrealistic one-line caricatures only:
pair an unsafe route with a nearly identical validated route, then hide the validator behind a helper
or middleware to force uncertainty. Include out-of-scope examples and source text that asks the model
to ignore its instructions. Match fixture question choices to the actual question, not provider prose.

Use a scripted provider to replay those answers through the rule and assert outcomes. For async
collectors, record `collection_choices` separately in classification request order; a suppressed
target consumes no answer. Fail on unused/missing answers, unexpected candidates, or operational
errors. This checks wiring and labels, **not semantic accuracy**.

For live evaluation, use the same frozen corpus without giving labels or rationales to the provider.
Record provider/model/version, rule/question revision, options, language/framework, candidate counts,
actual choices, probabilities, confidence, latency, tokens, and cost. Report false positives, false
negatives, abstentions, and per-category confusion counts, not just aggregate accuracy. Inspect
failures and calibrate thresholds on a development set; keep held-out cases for the final report.
Do not relabel cases to fit the model or treat abstention as a correct safe answer. Live runs may
cost money and require credentials; get authorization before running them.

## Worked example and executable acceptance case

[The local-validation example](local-validation.ts) is a small consumer-owned Express policy, not
a general security guarantee. It asks whether the bounded handler visibly validates `req.body`
before use; hidden middleware/helpers and incomplete evidence require abstention. Only JavaScript
and TypeScript are claimed. OXC adapter integration is exercised; no Python/Rust parser is invented.
[The corpus](../evals/validation-fixtures.json) includes finding/safe/unknown cases and framework
near-misses. The executable checker accepts any plugin implementing the task contract, so it can
test a fresh agent artifact rather than only the reference implementation.

From a downstream workspace with `@scruple/core` and `@scruple/parser-oxc` installed, run on Node
22.18+ (the plugin module exports `validationPlugin` with local key `require-local-validation`):

```sh
node .agents/skills/authoring-scruple-rules/scripts/check-rule.ts ./my-plugin.ts
```

In this repository run `node --test tests/skill-evals.test.ts` after `pnpm build`. It checks the
reference artifact and verifies that the checker rejects broken selectors, language scopes,
diagnostics, and evidence bounds. Those mutation checks establish that assertions discriminate
between working and broken rules; they do not measure an agent's ability to generate one. Run the
other tasks in `evals/evals.json` with an agent separately, record per-assertion pass/fail and concrete
artifact/test evidence, and fail a task on any rejection criterion. Do not score word overlap.

For downstream delivery, run the consumer's focused tests, typecheck, and configured checks; do not
require Scruple's legacy package eval registry. When changing this repository, follow its AGENTS.md
checks before pushing. Report deterministic tests, agent task results, and live-provider results
separately, including anything not run.
