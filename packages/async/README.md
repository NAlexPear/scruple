# @scruple/async

Conservative semantic rules for asynchronous code, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/async
```

The initial rules use only function-local evidence. They intentionally abstain when dependencies,
concurrency bounds, cancellation support, or required ordering are not visible in the selected
function and its imports.

See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration and
the current exported rules.
