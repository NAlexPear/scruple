# Agent skills

Scruple ships three [Agent Skills](https://agentskills.io/) that give coding agents its current
extension contracts, design constraints, tests, and repository workflows.

Skills provide instructions to your coding agent; they do not install Scruple packages or replace the
`scruple` CLI. Review agent changes and run the verification commands the skill recommends.

## Install with `npx skills`

The open-source [`skills` CLI](https://github.com/vercel-labs/skills) discovers the skills directly
from this GitHub repository. Run the generic installer and choose the skills, harnesses, and scope
interactively:

```sh
npx skills add NAlexPear/scruple
```

List the available skills without installing:

```sh
npx skills add NAlexPear/scruple --list
```

For a reproducible non-interactive project installation, name both the skills and target harness. This
example installs every Scruple skill for Codex:

```sh
npx skills add NAlexPear/scruple --skill '*' --agent codex --yes
```

Install just one skill by replacing `'*'` with its name. Add `--global` for a user-level installation,
or use `--agent '*'` to target every supported harness. Project installations include a
`skills-lock.json` file so `npx skills experimental_install` can restore the pinned skills later.

## Popular harness targets

Pass one or more of these exact values to `--agent`. Project scope is the default; `--global` selects
the user-level directory.

| Harness        | `--agent` value  | Project directory | Global directory             |
| -------------- | ---------------- | ----------------- | ---------------------------- |
| Amp            | `amp`            | `.agents/skills/` | `~/.config/agents/skills/`   |
| Claude Code    | `claude-code`    | `.claude/skills/` | `~/.claude/skills/`          |
| Codex          | `codex`          | `.agents/skills/` | `~/.codex/skills/`           |
| Cursor         | `cursor`         | `.agents/skills/` | `~/.cursor/skills/`          |
| Gemini CLI     | `gemini-cli`     | `.agents/skills/` | `~/.gemini/skills/`          |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/`         |
| OpenCode       | `opencode`       | `.agents/skills/` | `~/.config/opencode/skills/` |

For example:

```sh
npx skills add NAlexPear/scruple --skill '*' --agent claude-code --yes
npx skills add NAlexPear/scruple --skill configuring-scruple --agent cursor --yes
npx skills add NAlexPear/scruple --skill authoring-scruple-rules --agent gemini-cli --global --yes
```

Verify the installation for any target:

```sh
npx skills list --agent codex
npx skills list --global --agent claude-code
```

Harnesses with their own installer can also consume the same source. For example, Amp can install the
complete collection natively:

```sh
amp skill add NAlexPear/scruple/.agents/skills --global
```

Point native installers at the `.agents/skills` parent directory so references and evals remain beside
each `SKILL.md`.

## Bare skills

The skills are ordinary directories following the Agent Skills standard. Use them directly, inspect
them before installation, or copy a complete directory into the location expected by another harness:

| Skill                                                                                                                      | Use it for                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`configuring-scruple`](https://github.com/NAlexPear/scruple/tree/main/.agents/skills/configuring-scruple)                 | Installation, `scruple.config.ts`, CLI, CI, and troubleshooting      |
| [`authoring-scruple-rules`](https://github.com/NAlexPear/scruple/tree/main/.agents/skills/authoring-scruple-rules)         | Semantic rules, plugins, bounded evidence, tests, and eval fixtures  |
| [`authoring-scruple-providers`](https://github.com/NAlexPear/scruple/tree/main/.agents/skills/authoring-scruple-providers) | `DecisionProvider` adapters, mapping, cancellation, usage, and tests |

Preserve each whole directory rather than copying only `SKILL.md`; its `reference/` and `evals/`
content is part of the skill.

To copy the bare skills into a checkout that uses the shared `.agents/skills` project directory:

```sh
git clone --depth 1 https://github.com/NAlexPear/scruple.git /tmp/scruple
mkdir -p .agents/skills
cp -R /tmp/scruple/.agents/skills/{configuring-scruple,authoring-scruple-rules,authoring-scruple-providers} .agents/skills/
```

## Use the skills

Describe the task normally. The agent selects a skill from its description; no special prompt syntax
is required.

```text
Set up Scruple with OXC and the Jev provider, then enable the resources cleanup rule.
```

```text
Create a Scruple plugin that reports vague TODO comments. Include boundary tests and eval fixtures.
```

```text
Build a Scruple DecisionProvider adapter for Acme's SDK with cancellation and offline contract tests.
```

To force an explicit workflow, name the skill in the request, such as “Use
`authoring-scruple-providers` to review this adapter.”

## Use Scruple from the CLI

The configuration skill can install packages, create `scruple.config.ts`, and add CI commands. The
resulting project still runs Scruple through its normal CLI:

```sh
pnpm exec scruple "src/**/*.{ts,tsx}"
pnpm exec scruple --format json
```

Run Scruple after compilers and conventional linters. Keep provider credentials in environment
variables, and review the provider's data-handling and billing terms before sending source code.

## Update or remove

Update or remove an installation managed by `npx skills`:

```sh
npx skills update configuring-scruple
npx skills remove configuring-scruple --yes
```

For a native or manual installation, use that harness's update workflow or replace the copied skill
directory with the current version.
