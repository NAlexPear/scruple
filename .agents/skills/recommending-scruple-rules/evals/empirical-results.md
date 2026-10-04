# Empirical evaluation: 2026-10-03

This evaluation compared the packaged skill with a control that had `.agents/skills` removed before
inspection. Both runs used the same Amp medium agent mode, repository commit `e73ae1a`, frozen
`evidence-packet.md`, and `rank-evidence-backed-candidates` prompt. Neither agent received the
expected output or grading rubric.

## Result

| Arm       | Rubric result | Observed output                                                                                                                                                                                                                             |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Treatment | Pass          | Ranked cause preservation first, preserved the credential-redaction exception, labeled cleanup as inference, deferred tenant authorization pending parser evidence, rejected deterministic lint/type work, and supplied authoring handoffs. |
| Control   | Pass          | Reached the same material conclusions with exact evidence citations, two ranked recommendations, explicit deferral of tenant authorization, and complete authoring handoffs.                                                                |

- Treatment: [thread](https://ampcode.com/threads/T-01a10428-7d36-756c-9297-40f44f8e3f85)
- Control: [thread](https://ampcode.com/threads/T-01a10428-82d1-738e-a637-51e981b0afef)

The skill showed **no measurable incremental benefit in this single paired run**. Both arms satisfied
all four assertions and triggered none of the rejection criteria. The task likely had a ceiling
effect because the prompt and evidence packet made the important distinctions unusually explicit.

This is one run per arm, not a statistical estimate, and grading was not blinded. Before claiming
effectiveness, evaluate additional repositories where standards conflict, examples are noisier, and
counterexamples require discovery rather than being colocated in a frozen packet. Preserve zero-rule
and parser-prerequisite outcomes as valid answers so broader evaluations do not reward recommendation
volume.

## Real-parser capability probe: 2026-10-04

The new `inspect-real-parser-matrix` task runs an executable probe against the installed Python, Go,
Rust, and SQL adapters instead of relying on the frozen packet's parser claims. All four adapters
routed their owned file and emitted one normalized function. Calls were `client.fetch` and
`log.error` for Python, `fetch` for Go, `fetch` and `Ok` for Rust, and `coalesce` for SQL.

Only Python emitted a normalized error handler: binding `error`, call `log.error`, and a `throw` exit.
Go, Rust, and SQL emitted empty `errorHandlers`; all four omitted `facts` and `apiBoundaries`. The
evaluation rubric therefore requires recommendation agents to distinguish unsupported capability
from proof that error handling is absent, reject universal/wildcard error-handler rules, and defer Go,
Rust, and SQL rather than infer semantics from source spellings or shared function targets.

The probe and exact capability assertions passed, but no new skill-versus-no-skill agent pair was run.
Consequently this follow-up validates the evaluation inputs and makes unsupported cross-language
claims executable rejection criteria; it does **not** show that the recommendation skill improves
agent behavior. A future causal comparison should run the same prompt and probe in clean treatment
and control workspaces, then grade the outputs without revealing the rubric.
