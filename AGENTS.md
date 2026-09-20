# Repository guidelines

- Every commit subject must start with an appropriate Gitmoji emoji followed by a space.
- Before pushing to `main`, run `pnpm check`, `pnpm test`, and `pnpm scruple --format json`. All three checks must pass. The Scruple check requires `TYPESAFE_API_KEY`; if it is unavailable, do not push and report the blocker.
