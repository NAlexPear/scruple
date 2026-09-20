# Errors

`@scruple/errors` provides a provider-backed semantic check for caught errors.

```sh
pnpm add -D @scruple/errors
```

```ts
import { defineConfig } from "@scruple/core";
import { errors } from "@scruple/errors";

export default defineConfig({
  parser,
  provider,
  plugins: { errors: errors() },
  rules: { "errors/no-swallowed-errors": "warn" },
});
```

| Rule                                                                               | Checks                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`errors/no-swallowed-errors`](#errorsno-swallowed-errors)                         | Unexpected failures silently suppressed by catch handlers |
| [`errors/no-lossy-error-wrapping`](#errorsno-lossy-error-wrapping)                 | Replacement errors that lose the original cause           |
| [`errors/no-message-based-error-dispatch`](#errorsno-message-based-error-dispatch) | Control flow coupled to exception prose                   |

## `errors/no-swallowed-errors`

Reviews each catch handler with bounded source, imports, surrounding context, calls, and exits. It accepts propagation, observable reporting, cleanup followed by propagation, and visibly intentional recovery or expected-exception fallback. It abstains when an unseen helper may report, propagate, or establish the fallback contract.

Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`. Both must be finite values from `0` through `1`.

## `errors/no-lossy-error-wrapping`

Reviews catch handlers with visible non-direct replacement throws. A structured `cause` preserves the original failure; opaque custom wrappers and unresolved constructor behavior cause abstention.

## `errors/no-message-based-error-dispatch`

Reviews direct reads of a catch binding's `message` for branching or classification. Logging, display, and stable structured discriminators are not findings; opaque external classifiers cause abstention.

```ts
rules: { "errors/no-swallowed-errors": ["warn", { threshold: 0.95 }] }
```
