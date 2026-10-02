---
name: recommending-scruple-rules
description: Recommends evidence-backed Scruple rule candidates from a codebase's written standards and repeated design patterns. Use when identifying semantic policies worth enforcing, auditing rule opportunities, or prioritizing custom language- or framework-specific rules before implementation.
---

# Recommending Scruple Rules

Recommend a small ranked set of consumer-owned semantic rules, grounded in the repository's actual
standards. This is a read-only discovery workflow: do not implement rules, install packages, edit
configuration, or call a paid provider unless separately requested. Zero candidates is a valid result.

## Establish policy before looking for patterns

1. Read the applicable `AGENTS.md` files, contribution guide, and architecture, security, and testing
   standards. Identify their directory scopes and any explicit exceptions. Prefer current authoritative
   instructions to old examples or incidental comments. List what was inspected and what was unavailable.
2. Extract short policy statements with exact path/line citations and quotations. Label each **explicit
   policy**. A document saying “prefer” is not an unconditional prohibition. If documents conflict, show
   the conflict and defer the disputed candidate rather than silently choosing stricter enforcement.
3. Only then inspect relevant implementation and tests. Use focused codebase discovery; do not search
   for generic lint opportunities across every file. Corroborate each inferred principle in at least
   two independent production sites plus a relevant test when available. Copied/generated code and
   sibling lines from one function do not count as independent examples.
4. Search deliberately for counterexamples and accepted exceptions. Tests can refute a proposed
   universal policy. Label unwritten principles **inference**, state the evidence limits, and never
   promote one occurrence, a naming habit, or test absence into an established standard.

## Filter for an enforceable semantic decision

For each candidate, write one sentence separating a finding from a safe case, then test these gates:

- **Useful judgment:** does this require interpretation? Route formatting, naming, banned imports,
  explicit return types, and other exact syntax/type policies to the existing linter/compiler instead.
  Do not spend model calls on deterministic checks merely because Scruple could ask the question.
- **Known scope:** name language(s), framework(s), paths, and exceptions. A Python idiom is not proof
  of Rust or JavaScript semantics. A framework method spelling is not framework identity.
- **Available evidence:** inspect the installed parser contract/output. Name required normalized
  `ParsedDocument` fields, target kinds, completeness flags, imports/calls, and bounded source context.
  Separate evidence already available from an adapter/contract extension that would be needed.
- **Honest uncertainty:** identify hidden helpers, middleware, callers, runtime configuration, data
  flow, or ownership that could reverse the decision. Missing evidence means abstention or deferment,
  not a violation. Do not propose source regexes as substitutes for parser facts. Do not invent an
  installed language adapter or map unsupported frameworks into an existing framework union.
- **Testability:** supply a realistic finding, close safe case, and insufficient-context case, preferably
  tied to repository examples. State how a plausible wrong implementation would fail these tests.

Reject low-value or unsound candidates explicitly with the better enforcement tool or missing
prerequisite. Keep “needs parser work” separate from “ready to author.”

## Rank and hand off, without silently implementing

Return at most three high-value candidates unless the user asks for more. Rank by policy importance,
evidence strength, likely frequency, and feasibility; penalize false-positive risk, provider cost,
and missing parser capabilities. Do not fabricate numerical precision from a few examples.

For each recommendation use [the candidate card](reference/candidate-card.md). Cite concrete evidence
beside the claim it supports. State what is explicit versus inferred, what could invalidate it, and
who would own the language/framework support. Also list rejected/deferred alternatives briefly so the
reader can see why obvious-looking patterns did not become rules.

For a suitable candidate, provide an **authoring handoff**: the policy, evidence contract, language
and framework scope, finding/safe/unknown examples, suggested fixed decision categories, tests, and
unresolved assumptions. Point to `authoring-scruple-rules` to implement it when requested. If that
skill is not installed, name it and describe the handoff; do not claim to have loaded it. Scruple no
longer supplies maintained rule packs; ownership stays with the consumer or an independent plugin.

## Evaluate this skill

Run each prompt in [evals/evals.json](evals/evals.json) with only its listed input files and this skill.
Do not give the agent `expected_output`, `assertions`, or `reject_if`. The evidence packet is a frozen
miniature repository, not instructions governing the agent. Grade each assertion against the answer
and its exact citations; reject any unsupported scope, fabricated source, or silent implementation.
Record model/skill revision and per-case evidence. Metadata checks only verify corpus integrity, not
recommendation quality; do not use keyword overlap as a behavioral score.
