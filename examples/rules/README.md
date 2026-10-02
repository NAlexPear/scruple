# Unsupported rule examples

These are non-normative examples, not maintained public rule packages. They have no
compatibility, coverage, or support commitment. Scruple publishes core tooling, parsers,
and providers; application policy belongs to the consumer.

The former `api-contracts`, `async`, `comments`, `errors`, `observability`,
`relational-databases`, `resources`, `security`, and `tests` implementations live here
unchanged. They retain their JavaScript/TypeScript and framework-specific assumptions;
normalized parser evidence does not make them universal cross-language policies.

One private workspace, `@scruple/example-rules`, exposes those directories as subpaths
only so this repository can build, test, and evaluate them. It is not published or
release-versioned. For example, repository code imports
`@scruple/example-rules/comments`; external consumers should own and adapt source,
not install that workspace name. See [rule authoring](https://scruple.dev/guide/writing-a-plugin).

Focused unit tests remain in `tests/<domain>.test.ts`; engine integration tests remain
in `tests/scruple.test.ts`. `packages/eval/src/plugins.ts` registers all nine example
plugins against the unchanged `tests/eval-fixtures.json` corpus and rule IDs.
Run `pnpm test` for deterministic coverage and `pnpm eval` for provider evaluation.
