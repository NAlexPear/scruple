---
aside: false
---

# Plugins

Scruple plugins package named, tested rules. They can check common engineering problems or standards your team repeats in review. Register each factory under the namespace used by its rule IDs, then enable individual rules in `rules`.

Rules start from bounded parser targets. They can use the configured provider to classify ambiguous
possible candidates, then send selected candidates for the final rule decision. A finding appears only
when that final answer clears the rule's probability and confidence thresholds.

| Plugin                                            | Choose it for                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| [API Contracts](./api-contracts.md)               | Function contracts and explicit Fastify or Express route behavior   |
| [Async](./async.md)                               | Concurrency, sequencing, cancellation, and async lifetime           |
| [Comments](./comments.md)                         | Comment usefulness, accuracy, suppressions, and deprecations        |
| [Errors](./errors.md)                             | Swallowed, wrapped, and message-dispatched exceptions               |
| [Observability](./observability.md)               | Safe, actionable, stable, and non-duplicated telemetry              |
| [Relational Databases](./relational-databases.md) | Joins, loop queries, transaction scope, and pagination order        |
| [Resources](./resources.md)                       | Cleanup, ownership, retry limits, backoff, jitter, and deadlines    |
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
