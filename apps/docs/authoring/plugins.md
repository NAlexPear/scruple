# Author a plugin

A plugin is a named collection of rule factories. Keep evidence selection, decision criteria, thresholds, and diagnostic messages inside the rule.

## Define the plugin

```ts
import { definePlugin } from "@scruple/core";

export const myPlugin = () =>
  definePlugin({
    rules: {
      "my-rule": (options) => createMyRule(options),
    },
  });
```

The consumer chooses the namespace:

```ts
plugins: { policy: myPlugin() },
rules: { "policy/my-rule": "warn" },
```

## Semantic rules

A semantic rule implements:

- `description`: a stable summary.
- `collect(document)`: returns bounded candidates.
- `diagnose(answer, candidate)`: returns a rule-owned diagnostic or `null`.

Each candidate contains a normalized target, JSON state, one typed question, and optional JSON data. Do not ask the provider to generate a message or fix.

## Repository rules

A repository rule implements `description` and `check(documents)`. Use this shape when a finding can be derived deterministically across files, such as import-layer enforcement.

## Options

Validate options when the rule factory runs. Give every optional value an explicit default. Probability and confidence thresholds should reject non-finite values and values outside the range from 0 through 1.

## Testing

Test candidate collection and diagnosis separately. Include positive, negative, and abstention cases where the same surface pattern has different semantics. Derive expected diagnostics from the policy, not from the implementation under test.

Use the existing plugins as reference implementations, and keep parser-specific details behind normalized core contracts.
