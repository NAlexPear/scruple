# Scruple skills

This directory contains installable skills for configuring Scruple and authoring its extension points:

- `configuring-scruple`
- `recommending-scruple-rules`
- `authoring-scruple-rules`
- `authoring-scruple-providers`

Use `recommending-scruple-rules` to rank evidence-backed policies from written standards and repeated
code/test patterns without implementing them. Hand selected candidates to `authoring-scruple-rules`.

## Install

Choose the skills, harnesses, and scope interactively with the generic installer:

```sh
npx skills add NAlexPear/scruple
```

For a non-interactive install, specify the skill and harness, for example:

```sh
npx skills add NAlexPear/scruple --skill '*' --agent codex --yes
```

List available skills before installing:

```sh
npx skills add NAlexPear/scruple --list
```

See `apps/docs/guide/agent-skills.md` for Amp, Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot,
and OpenCode options, direct bare-skill links, verification, updates, and example prompts.

## Regression evals

Each skill keeps behavioral regression cases in `evals/evals.json` using this shape:

```json
{
  "skill_name": "skill-directory-name",
  "evals": [
    {
      "id": "stable-case-id",
      "prompt": "A standalone user request",
      "expected_output": "Observable requirements used to grade the response",
      "files": []
    }
  ]
}
```

`tests/skill-evals.test.ts` checks corpus structure and referenced inputs during `pnpm test`. The
authoring skill also bundles an executable plugin acceptance checker with mutation tests; it checks
selection, diagnosis, fixture replay, language scopes, and suppressions. These checks do not measure
agent behavior or live-provider accuracy. The recommendation skill includes a frozen evidence packet
and citation-based review rubrics for policy/inference, counterexamples, scope, and tool suitability.

For a periodic behavioral regression check, run every prompt in a clean thread rooted at this
repository, confirm the named skill triggers, and grade the resulting changes or answer against
`expected_output` and, where present, every `assertions` and `reject_if` item. Give only the prompt
and listed `files` to the agent, not the grading rubric or reference solution. Record the Amp
version/model and case IDs so results from different runs remain
comparable. Run risky external-provider smoke tests only with explicit authorization; none of these
skill evals require credentials or network access.

When a regression is found, first add or sharpen a case that distinguishes the wrong behavior, then
update the smallest relevant skill instruction or reference. Keep prompts standalone and expected
outputs behavioral rather than tied to exact prose.
