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
