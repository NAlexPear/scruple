# Scruple skills

This directory contains installable skills for configuring Scruple and authoring its extension points:

- `configuring-scruple`
- `authoring-scruple-rules`
- `authoring-scruple-providers`

## Install

Install all three globally with Amp:

```sh
amp skill add NAlexPear/scruple/.agents/skills --global
```

Install all three for Amp in the current project with the `skills` CLI:

```sh
npx skills add NAlexPear/scruple --skill '*' --agent amp --yes
```

List available skills before installing:

```sh
npx skills add NAlexPear/scruple --list
```

See `apps/docs/guide/agent-skills.md` for individual installation, verification, updates, and example
prompts.

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

`tests/skill-evals.test.ts` checks corpus structure during `pnpm test`. That check does not measure
agent behavior.

For a periodic behavioral regression check, run every prompt in a clean thread rooted at this
repository, confirm the named skill triggers, and grade the resulting changes or answer against
`expected_output`. Record the Amp version/model and case IDs so results from different runs remain
comparable. Run risky external-provider smoke tests only with explicit authorization; none of these
skill evals require credentials or network access.

When a regression is found, first add or sharpen a case that distinguishes the wrong behavior, then
update the smallest relevant skill instruction or reference. Keep prompts standalone and expected
outputs behavioral rather than tied to exact prose.
