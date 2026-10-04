# Empirical evaluation: 2026-10-03

This evaluation compared the packaged skill with a control that had `.agents/skills` removed before
inspection. All runs used the same Amp medium agent mode and repository commit `e73ae1a`. Treatment
runs read this skill; controls could inspect the public Scruple source and documentation. Each pair
received the same task and input fixture. Agents did not receive `expected_output`, `assertions`, or
`reject_if`.

This is a small paired evaluation, not a statistical estimate. There was one run per arm and task.
Arm identities were visible during grading. No live decision-provider accuracy evaluation was run.

## Results

| Task                               | Treatment | Control | Discriminating evidence                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `framework-validation-rule`        | Pass      | Fail    | The treatment artifact passed `scripts/check-rule.ts`. The control's own 11 tests and typecheck passed, but the common checker first rejected its factory-shaped `validationPlugin` export. Calling that factory before checking exposed a second failure: partial evidence was discarded rather than retained for an `insufficient_context` decision. |
| `reject-cross-language-cleanup`    | Pass      | Pass    | Both arms rejected wildcard portability, identified missing ownership/lifetime/cancellation facts, and proposed explicit parser evidence plus per-language tests.                                                                                                                                                                                      |
| `scope-overrides-and-capabilities` | Pass      | Pass    | Both arms correctly explained replacement scope semantics and rejected `apiBoundaries ?? []` as proof of missing Django authorization.                                                                                                                                                                                                                 |

Task-level result: treatment **3/3**, control **2/3**. The skill demonstrated incremental value on
the executable implementation task, especially the packaged contract checker and partial-evidence
abstention behavior. It did not demonstrate incremental value on the two architecture-judgment tasks;
the unassisted agent already satisfied those rubrics.

## Multi-language expansion

A later paired run exercised `bounded-choice-rule` over normalized TypeScript and Python comments.
Both artifacts passed their four self-authored tests, used the real OXC adapter for TypeScript,
clearly labeled Python as a synthetic parser contract fixture, preserved language/location metadata,
tested source-string near misses, and covered diagnosis boundaries and safe/unknown answers.

The treatment nevertheless **failed** the bounded-evidence requirement: a 100,000-character
normalized comment produced a 100,873-character serialized state/question request. The control
bounded comment and enclosing context and produced a 2,653-character request for the same target.
Task-level result for this pair: treatment **0/1**, control **1/1**. Passing self-authored tests did
not detect the defect. The skill and task rubric were strengthened to state explicitly that
normalized facts can still be unbounded and to require an oversized-comment request-size test.

- Multi-language treatment: [thread](https://ampcode.com/threads/T-01a10438-53db-728e-8089-90faaea0d256)
- Multi-language control: [thread](https://ampcode.com/threads/T-01a10438-5a32-74be-a36d-a49a3cc2ee08)

## Run records

- Implementation treatment: [thread](https://ampcode.com/threads/T-01a10422-ec9e-710e-9298-9ff1f968da1d)
- Implementation control: [thread](https://ampcode.com/threads/T-01a10422-f2e8-76b0-ab8f-57b19d29c3e1)
- Cleanup treatment: [thread](https://ampcode.com/threads/T-01a10422-f9c9-721d-8857-b7c74b44e766)
- Cleanup control: [thread](https://ampcode.com/threads/T-01a10423-02b3-772f-bb3b-73e1ed06854a)
- Capability treatment: [thread](https://ampcode.com/threads/T-01a10423-089e-75f2-8406-039bfd79ffc0)
- Capability control: [thread](https://ampcode.com/threads/T-01a10423-0eb8-775d-ad86-5e1ba0d943d5)

The acceptance checker was rerun locally against both downloaded artifacts. The treatment passed.
The control failed for the two reasons above; no agent self-report was used as acceptance evidence.

## Interpretation and next evaluation

Keep the Express implementation workflow and checker, but do not claim that these runs prove broad
agent-quality improvement. Across four authoring tasks, treatment passed 3/4 and control passed 3/4;
the arms failed different implementation tasks. Add an executable checker for the portable-comment
task before relying on it, repeat both implementation tasks across additional models or seeds, and
add a harder judgment task whose correct answer is not already strongly cued by the user request.
Report scripted artifact acceptance separately from live provider accuracy.
