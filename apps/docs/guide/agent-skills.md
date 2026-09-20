# Agent skills

Scruple ships three [Agent Skills](https://agentskills.io/) that give coding agents its current
extension contracts, design constraints, tests, and repository workflows.

| Skill                         | Use it for                                                           |
| ----------------------------- | -------------------------------------------------------------------- |
| `configuring-scruple`         | Installation, `scruple.config.ts`, CLI, CI, and troubleshooting      |
| `authoring-scruple-rules`     | Semantic rules, plugins, bounded evidence, tests, and eval fixtures  |
| `authoring-scruple-providers` | `DecisionProvider` adapters, mapping, cancellation, usage, and tests |

Skills provide instructions to your coding agent; they do not install Scruple packages or replace the
`scruple` CLI. Review agent changes and run the verification commands the skill recommends.

## Install with Amp

Install all three into Amp's user-level skill directory:

```sh
amp skill add NAlexPear/scruple/.agents/skills --global
```

For a project-local installation, run this in the target repository:

```sh
amp skill add NAlexPear/scruple/.agents/skills --target .agents/skills
```

Point Amp at the `.agents/skills` parent directory as shown so it installs bundled references and evals
alongside every `SKILL.md`.

Verify discovery:

```sh
amp skill list
amp skill info configuring-scruple
amp skill info authoring-scruple-rules
amp skill info authoring-scruple-providers
```

New Amp sessions discover global and project skills automatically.

## Install with `npx skills`

The open-source [`skills` CLI](https://github.com/vercel-labs/skills) can discover the skills directly
from this GitHub repository. List them without installing:

```sh
npx skills add NAlexPear/scruple --list
```

Install all three for Amp in the current project without interactive prompts:

```sh
npx skills add NAlexPear/scruple --skill '*' --agent amp --yes
```

Install one skill instead:

```sh
npx skills add NAlexPear/scruple \
  --skill authoring-scruple-rules \
  --agent amp \
  --yes
```

Add `--global` for a user-level installation. Replace `amp` with another agent supported by the
installer, or use `--agent '*'` to install for every detected agent. Project installations include a
`skills-lock.json` file so `npx skills experimental_install` can restore the pinned skills later.

Verify project or global installation:

```sh
npx skills list --agent amp
npx skills list --global --agent amp
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

With Amp, rerun installation with `--overwrite`, or remove a named skill:

```sh
amp skill add NAlexPear/scruple/.agents/skills --global --overwrite
amp skill remove configuring-scruple
```

With `npx skills`:

```sh
npx skills update configuring-scruple
npx skills remove configuring-scruple --yes
```
