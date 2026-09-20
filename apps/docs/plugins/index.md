---
aside: false
---

# Plugins

Scruple plugins package named, tested rules. They can check common engineering problems or standards your team repeats in review. Register each factory under the namespace used by its rule IDs, then enable individual rules in `rules`.

Scruple sends bounded source evidence to the configured decision provider and reports a finding only when the provider's probability and confidence clear the rule's thresholds.

| Plugin                                            | Choose it for                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| [API Contracts](./api-contracts.md)               | Function contracts and explicit Fastify or Express route behavior   |
| [Async](./async.md)                               | Concurrency, sequencing, cancellation, and async lifetime           |
| [Comments](./comments.md)                         | Comment usefulness, accuracy, suppressions, and deprecations        |
| [Errors](./errors.md)                             | Swallowed, wrapped, and message-dispatched exceptions               |
| [Observability](./observability.md)               | Safe, actionable, stable, and non-duplicated telemetry              |
| [Relational Databases](./relational-databases.md) | Joins, loop queries, transaction scope, and pagination order        |
| [Resources](./resources.md)                       | Cleanup, ownership, and bounded well-behaved retries                |
| [Security](./security.md)                         | Authorization, exposure, and direct request-to-sensitive-sink flows |
| [Tests](./tests.md)                               | Meaningful oracles, specific failures, and reliable synchronization |

Rule configuration follows the ESLint/Oxlint shape: use a severity alone, or `[severity, options]`. Plugin factories themselves take no arguments.

```ts
plugins: { comments: comments() },
rules: {
  "comments/no-misleading-comments": ["warn", { threshold: 0.9 }],
},
```

<script setup lang="ts">
import RuleRegistry from "../.vitepress/theme/RuleRegistry.vue";
</script>

<RuleRegistry />
