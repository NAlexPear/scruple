# @scruple/async

Conservative semantic rules for asynchronous code, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/async
```

The rules inspect a limited amount of code from each function. They check concurrency fan-out,
independent serial work, cancellation, race cleanup, abort-listener lifetime, and unobserved
promises. The same function, import, and call limits apply to call-level findings.

A rule reports nothing when the selected function and its imports do not establish ownership,
cleanup, cancellation support, dependency order, or required sequencing. The unobserved-work rule
also checks local promise assignments with no later use. The abort-listener rule requires a visibly
typed `AbortSignal` parameter and does not treat `{ once: true }` as cleanup when an operation
completes normally.

Follow the published [quickstart](https://scruple.dev/guide/quickstart), browse the [rule registry](https://scruple.dev/plugins/), compare [providers](https://scruple.dev/providers/), or [write a custom rule](https://scruple.dev/guide/writing-a-plugin).
