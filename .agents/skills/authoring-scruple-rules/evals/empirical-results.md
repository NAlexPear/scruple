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

Keep the implementation workflow and checker. Do not claim that this run proves broad agent-quality
improvement. Repeat the implementation task across additional models or seeds, and add a harder
judgment task whose correct answer is not already strongly cued by the user request. Report scripted
artifact acceptance separately from live provider accuracy.
