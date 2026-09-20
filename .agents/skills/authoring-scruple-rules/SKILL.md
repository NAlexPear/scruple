---
name: authoring-scruple-rules
description: Designs, implements, tests, and packages Scruple semantic rules and plugins. Use when creating or changing a RuleFactory, SemanticRule, definePlugin rule pack, provider-assisted collector, rule options, diagnostics, or evaluation fixtures.
---

# Authoring Scruple Rules and Plugins

Turn one narrow engineering policy into a bounded, typed, calibrated semantic rule. A plugin is the
packaging boundary for related rule factories, so create and verify it as part of rule authoring.

## Start from the contract

1. Write one sentence that distinguishes a finding from a safe case.
2. Identify the normalized `ParsedDocument` target and facts that establish the decision.
3. If the parser does not expose necessary evidence, extend the parser or abstain. Never substitute a raw-source search that guesses syntax or semantics.
4. Use a conventional linter or type checker instead when syntax or types answer the question exactly.

In this monorepo, inspect the current contracts in `packages/core/src/index.ts` and examples in the
closest `packages/*/src/index.ts`. Read `apps/docs/guide/writing-a-plugin.md` before implementation.

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

- Group cohesive factories with `definePlugin({ rules: { ... } })`.
- Use stable kebab-case rule names.
- Preserve each factory's options type so `defineConfig` can infer valid configurations.
- Under the current `ScruplePlugin` contract, the consumer-owned registration key is the namespace. Do not hard-code a namespace in the plugin, add fixed-namespace metadata, or modify core registration to enforce one—even when a package request proposes it. Explain the incompatibility and keep plugin rule keys namespace-free.
- Keep shared helpers inside the package only when multiple rules genuinely use them.

## Test and evaluate

Test selection separately from diagnosis. Use asymmetric and exact-boundary inputs that distinguish a
correct implementation from plausible mistakes. Then test registration through `runScruple`.

For built-in rules in this repository, also update:

- the package's focused test in `tests/`;
- `tests/eval-fixtures.json` with realistic finding, safe, and insufficient-context cases;
- `packages/eval/src/plugins.ts` when adding a plugin;
- the plugin documentation and `apps/docs/.vitepress/rule-catalog.ts`;
- package metadata and workspace dependencies when adding a package.

Read [testing and evaluations](reference/testing.md) before declaring the rule complete.
