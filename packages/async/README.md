# @scruple/async

Conservative semantic rules for asynchronous code, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/async
```

The rules use bounded function-local evidence to review concurrency fan-out, independent serial
work, cancellation propagation, race-loser cleanup, and abort-listener lifetime. They intentionally
abstain when dependencies, ownership, cleanup, cancellation support, or required ordering are not
visible in the selected function and imports. The same function, import, and call budgets apply to
call-level findings. Unobserved-work analysis includes local promise assignments that have no later
visible use, while abort-listener analysis requires a visibly typed `AbortSignal` parameter and does
not treat `{ once: true }` as cleanup for normal operation completion.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
