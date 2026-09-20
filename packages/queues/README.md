# @scruple/queues

Semantic rules for queue consumers and queue configuration, packaged as a plugin for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/queues
```

The initial rules inspect inline handlers registered through `amqplib`, `kafkajs`, `sqs-consumer`,
and `@google-cloud/pubsub`. Dead-letter checks are limited to visible `amqplib` queue declarations
and Google Pub/Sub subscription creation. Consumer code alone is not evidence that externally
managed infrastructure lacks a dead-letter policy.

See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration.
