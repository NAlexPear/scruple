# @scruple/async

Conservative semantic rules for asynchronous code, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/async
```

The rules use bounded function-local evidence to review concurrency fan-out, independent serial
work, cancellation propagation, race-loser cleanup, and abort-listener lifetime. They intentionally
abstain when dependencies, ownership, cleanup, cancellation support, or required ordering are not
visible in the selected function and imports.

See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration and
the current exported rules.
