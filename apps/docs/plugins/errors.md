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

| Rule                                                       | Checks                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| [`errors/no-swallowed-errors`](#errorsno-swallowed-errors) | Unexpected failures silently suppressed by catch handlers |

## `errors/no-swallowed-errors`

Reviews each catch handler with bounded source, imports, surrounding context, calls, and exits. It accepts propagation, observable reporting, cleanup followed by propagation, and visibly intentional recovery or expected-exception fallback. It abstains when an unseen helper may report, propagate, or establish the fallback contract.

Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`. Both must be finite values from `0` through `1`.

```ts
rules: { "errors/no-swallowed-errors": ["warn", { threshold: 0.95 }] }
```
