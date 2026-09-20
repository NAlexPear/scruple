# @scruple/comments

Checks for source comments that restate code, contradict visible behavior, preserve disabled code or change history, use unnecessary prose, or lack actionable guidance.

```sh
pnpm add --save-dev @scruple/comments
```

Rules cover comment usefulness, correctness, disabled code, change history, concision, actionable
TODOs, justified suppression directives, and actionable deprecations.

Comment source, value, and surrounding context are independently bounded before provider evaluation,
with truncation flags included in the evidence. Suppression directives remain auditable when they
disable `comments/require-justified-suppressions` on their own line; their normal effect on other
candidates is unchanged. During an engine run, TODO selection uses the configured provider to classify
bounded non-directive comments, including `todo:`, `to-do:`, FIXME, HACK, and `@todo` JSDoc tags,
without treating ordinary phrases such as “to-do list” as maintenance markers. Selected comments then
receive the separate actionability decision.

Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
