# @scruple/comments

Example semantic rules for source-code comments, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/comments
```

Rules include comment usefulness, correctness, disabled code, change history, concision, actionable
TODOs, justified suppression directives, and actionable deprecations. See the
[Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration.

Comment source, value, and surrounding context are independently bounded before provider evaluation,
with truncation flags included in the evidence. Suppression directives remain auditable when they
disable `comments/require-justified-suppressions` on their own line; their normal effect on other
candidates is unchanged. TODO selection includes `@todo` JSDoc tags.
