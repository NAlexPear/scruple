# Queues

`@scruple/queues` provides provider-backed semantic checks for visible queue consumers and declarations using amqplib, KafkaJS, sqs-consumer, and Google Cloud Pub/Sub patterns.

```sh
pnpm add -D @scruple/queues
```

```ts
import { defineConfig } from "@scruple/core";
import { queues } from "@scruple/queues";

export default defineConfig({
  parser,
  provider,
  plugins: { queues: queues() },
  rules: { "queues/require-idempotent-handler": "warn" },
});
```

| Rule                                                                                 | Checks                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| [`queues/require-idempotent-handler`](#queuesrequire-idempotent-handler)             | Handlers unsafe under redelivery                    |
| [`queues/no-acknowledge-before-processing`](#queuesno-acknowledge-before-processing) | Explicit acknowledgement before processing succeeds |
| [`queues/require-dead-letter-policy`](#queuesrequire-dead-letter-policy)             | Declarations missing dead-letter and retry limits   |

Every rule accepts `threshold` and `minConfidence`, defaulting to `0.85` and `0.7`.

## `queues/require-idempotent-handler`

Checks recognized inline handlers for durable duplicate suppression, idempotency keys applied to effects, conditional writes, upserts, or naturally idempotent operations. IDs alone, ordering, retries, and in-memory checks are insufficient.

## `queues/no-acknowledge-before-processing`

For recognized APIs with explicit acknowledgements, checks handlers containing exactly one recognized acknowledgement and reports when it can run before required processing and transaction commits succeed.

## `queues/require-dead-letter-policy`

Checks recognized authoritative RabbitMQ queue and Google Pub/Sub subscription declarations for both a dead-letter destination and a bounded retry or delivery-attempt policy. RabbitMQ dead-letter exchange configuration alone is incomplete.

```ts
rules: { "queues/require-dead-letter-policy": ["warn", { threshold: 0.9 }] }
```
