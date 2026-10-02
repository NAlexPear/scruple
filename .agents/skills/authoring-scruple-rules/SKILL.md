---
name: authoring-scruple-rules
description: Designs, implements, tests, and evaluates consumer-owned Scruple rules for specific languages and frameworks. Use when creating or changing a RuleFactory, SemanticRule, definePlugin plugin, normalized evidence selector, provider-assisted collector, diagnostics, or rule evaluation fixtures.
---

# Authoring Scruple Rules and Plugins

Turn one narrow engineering policy into a bounded, typed, calibrated semantic rule owned by the
consumer. Scruple supplies the engine contracts, not maintained rule packs. Keep rules in the user's
repository or an independently maintained plugin package; upstream publication is not a completion
requirement. A plugin groups related factories and declares their default language scope.

## Start from the contract

1. Write one sentence that distinguishes a finding from a safe case.
2. Name the supported languages, frameworks, and evidence required to distinguish a finding, a safe case, and insufficient context. Treat that support matrix as an author-maintained contract, not a marketing claim.
3. Identify the normalized `ParsedDocument` target and facts that establish the decision. Language names come from the configured parser's `languages` and returned `document.language`, not filename guesses.
4. If the parser does not expose necessary evidence, extend the parser or abstain. Never substitute a raw-source search that guesses syntax or semantics. Missing optional `facts` or `apiBoundaries` means unsupported evidence, not proof that validation or cleanup is absent.
5. Use a conventional linter or type checker instead when syntax or types answer the question exactly.

Inspect the installed `@scruple/core` types and the chosen parser's actual output before implementing.
In the Scruple checkout the source of truth is `packages/core/src/index.ts`. Do not assume a Python,
Rust, or framework adapter exists because the engine accepts arbitrary language names. See
[rule design](reference/rule-design.md) for the evidence and ownership checklist.

## Implement the rule

1. Define an options type. Reuse `DecisionRuleOptions` and `resolveDecisionOptions` for probability thresholds when appropriate. `threshold` is always `{ warning: number; error: number }`, with `warning <= error`; never accept the old numeric form.
2. Implement a `RuleFactory<Options>` that validates options when instantiated.
3. In `collect`, select possible targets deterministically, preserve source order, and send only bounded evidence needed by the question.
4. When candidate recognition itself requires judgment, return an asynchronous rule and call `context.provider.evaluate(target, request, context.signal)`. Do not call a provider directly or bypass engine suppression and accounting.
5. Give each candidate exactly one fixed `noul`, `choice`, or `score` question. Use named, mutually distinguishable criteria.
6. Include `insufficient_context` whenever hidden callers, helpers, configuration, middleware, types, or runtime behavior could change the answer.
7. In `diagnose`, reject wrong answer types, safe or abstaining answers, non-finite scores, and values below `threshold.warning`. Every diagnostic must include `severity`: use `"warning"` below `threshold.error` and `"error"` at or above it. Return fixed author-written diagnostic text; never ask the provider to write warnings or fixes.

Read [rule design](reference/rule-design.md) for the implementation checklist.

## Package the plugin

- Group cohesive factories with `definePlugin({ languages: ["typescript", "javascript"], rules: { ... } })`; replace those languages with the ones actually supported and tested. `languages` is required on every plugin.
- An optional `SemanticRule.languages` overrides (replaces, not intersects with) the plugin scope. Use it for a narrower rule or a separately justified portable rule. Omit it to inherit.
- Use `languages: "*"` only when the decision depends on genuinely portable normalized evidence, such as comment prose without code-semantics assumptions. A shared target shape does not make JavaScript promises, Python context managers, and Rust ownership equivalent.
- Language scopes do not select frameworks. Filter normalized framework evidence explicitly inside `collect`; do not treat a method called `get` as proof of Express or a function named `test` as proof of a test runner.
- Use stable kebab-case rule names.
- Preserve each factory's options type so `defineConfig` can infer valid configurations.
- Under the current `ScruplePlugin` contract, the consumer-owned registration key is the namespace. Do not hard-code a namespace in the plugin, add fixed-namespace metadata, or modify core registration to enforce one—even when a package request proposes it. Explain the incompatibility and keep plugin rule keys namespace-free.
- Keep shared helpers inside the package only when multiple rules genuinely use them.

## Test and evaluate

Test selection separately from diagnosis. Use asymmetric and exact-boundary inputs that distinguish a
correct implementation from plausible mistakes. Then test registration through `runScruple`.

Keep focused tests, parser conformance fixtures, and provider eval fixtures with the consumer's
plugin. Do not require changes to Scruple's package registry, documentation catalog, or legacy eval
registry. Cover every claimed language/framework with a real adapter integration; a synthetic
`ParsedDocument` test verifies a collector contract but cannot prove that an adapter extracts it.

Read [testing and evaluations](reference/testing.md) before declaring the rule complete.

## Evaluate this skill

Use [the behavioral tasks](evals/evals.json) as agent prompts in a clean downstream workspace. Give
the agent the task's `files`, not its expected output or the reference implementation. Review its
artifact against every assertion and rejection criterion, then execute its tests. For the
`framework-validation-rule` task, run `scripts/check-rule.ts` against the generated plugin as
described in [testing](reference/testing.md). The bundled reference rule is a worked example, not a
published pack or an answer to inject into an evaluation run. Metadata checks and a passing reference
implementation are not evidence that an agent followed this skill or that a provider is accurate.
