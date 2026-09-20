# Plugins

Scruple plugins are rule libraries. Register each factory under the namespace used by its rule IDs, then enable individual rules in `rules`. Except for Architecture, these plugins provide semantic rules: Scruple sends bounded source evidence to the configured decision provider and reports a finding only when the provider's probability and confidence clear the rule's thresholds. Architecture is a deterministic repository rule and does not use the provider.

| Plugin                                            | Choose it for                                              | Analysis                             |
| ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| [API Contracts](./api-contracts.md)               | Function names, failure contracts, and boundary validation | Semantic                             |
| [Architecture](./architecture.md)                 | Enforced repository layer dependencies                     | Deterministic                        |
| [Async](./async.md)                               | Concurrency, sequencing, and cancellation                  | Semantic                             |
| [Caches](./caches.md)                             | Cache isolation, freshness, and sensitive values           | Semantic                             |
| [Comments](./comments.md)                         | Comment usefulness, accuracy, and maintenance              | Semantic                             |
| [Configuration](./configuration.md)               | Environment validation and secure defaults                 | Semantic                             |
| [Dependencies](./dependencies.md)                 | Local reimplementations of dependency features             | Semantic, supplied evidence required |
| [Errors](./errors.md)                             | Swallowed exceptions                                       | Semantic                             |
| [HTTP Clients](./http-clients.md)                 | Timeouts, response validation, and retry bounds            | Semantic                             |
| [Observability](./observability.md)               | Safe, actionable logs and telemetry                        | Semantic                             |
| [Queues](./queues.md)                             | Consumer idempotency, acknowledgements, and dead letters   | Semantic                             |
| [Relational Databases](./relational-databases.md) | In-memory work that belongs in the database                | Semantic                             |
| [Resources](./resources.md)                       | Cleanup, ownership, and bounded retries                    | Semantic                             |
| [Security](./security.md)                         | Authorization trust and data exposure                      | Semantic advisory rules              |
| [Tests](./tests.md)                               | Tests without effective verification                       | Semantic                             |

Rule configuration follows the ESLint/Oxlint shape: use a severity alone, or `[severity, options]`. Plugin factories themselves take no arguments.

```ts
plugins: { comments: comments() },
rules: {
  "comments/no-misleading-comments": ["warn", { threshold: 0.9 }],
},
```
