# Contributing to Scruple

Thank you for helping improve Scruple. This guide explains how to propose a change, how contributor
access works, and what we expect from a pull request.

## Before writing code

For a small fix, you can open a pull request directly. For a new feature or a change to public
behavior, open an issue first. Explain the problem, show an example, and describe the result you want.
Early discussion helps avoid work on an approach the project cannot accept.

Keep each pull request focused on one problem. Do not include unrelated cleanup unless it is required
for the change.

## Contributor access

Scruple uses [Vouch](https://github.com/mitchellh/vouch) to maintain a small list of accepted
contributors. This protects the project from automated spam while leaving contribution decisions
with its maintainers.

Bots and people with write access are accepted automatically. Everyone else must be vouched for by a
maintainer before the full pull request workflow runs.

A maintainer may vouch for someone after a useful issue discussion, previous constructive work, or
another interaction that gives the maintainer enough reason to trust the contribution. Vouching means
the person may submit work for review. It does not guarantee that a pull request will be approved or
merged.

If you are not yet vouched for:

1. Open an issue describing what you want to change, or open a focused pull request with enough context
   to review the proposal.
2. A maintainer can comment `vouch` on that issue or pull request.
3. The project records your GitHub handle in [`.github/VOUCHED.td`](.github/VOUCHED.td). If a pull
   request is already open, a maintainer reruns its contributor check.

Maintainers may `unvouch` someone when access is no longer appropriate. They may `denounce` accounts
used for spam, abuse, impersonation, or repeated bad-faith contributions. These decisions are about
protecting the project, not resolving ordinary technical disagreement.

## Make a change

This repository uses Node.js 22.18 or newer and pnpm 12.

```sh
pnpm install --frozen-lockfile
```

Follow the existing package boundaries and coding style. Prefer the smallest change that fully solves
the problem. Add tests for behavior that could plausibly break, and update documentation when users
would otherwise see stale instructions.

Commit subjects start with an appropriate [Gitmoji](https://gitmoji.dev/) followed by a space.

## Check your work

Run the ordinary checks before opening or updating a pull request:

```sh
pnpm check
pnpm test
```

If you have a TypeSafe API key, also run Scruple itself:

```sh
TYPESAFE_API_KEY=your-key pnpm scruple --format json
```

Do not put keys in source files, command output, issues, or pull requests.

GitHub Actions repeats the build, type checks, tests, and documentation build. For vouched
contributors, it also checks the proposed source with Scruple. That check uses trusted code from the
base branch and never installs or executes code from the pull request with repository credentials.
Because symbolic links could cross that boundary, pull requests containing them are rejected by this
workflow.

## Pull request review

A pull request should explain:

- what problem it solves;
- why the chosen approach is appropriate;
- how the change was tested; and
- any behavior, compatibility, or security tradeoffs reviewers should know about.

All required checks must pass. A maintainer may ask for changes, close work that is out of scope, or
choose a different solution. Be direct and respectful when discussing technical disagreements.

By contributing, you agree that your contribution is provided under the repository's
[MIT License](LICENSE).
