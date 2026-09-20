import assert from "node:assert/strict";
import test from "node:test";

import { oxcParser } from "@scruple/parser-oxc";
import { queues } from "@scruple/queues";

const parser = oxcParser();

await test("queues plugin registers the initial bounded rule set", () => {
  assert.deepEqual(Object.keys(queues().rules), [
    "require-idempotent-handler",
    "no-acknowledge-before-processing",
    "require-dead-letter-policy",
  ]);
});

await test("queue rules select one inline handler and one explicit acknowledgement", () => {
  const document = parser.parse(
    "worker.ts",
    `import amqp from "amqplib";
export async function start(channel: Channel) {
  await channel.consume("payments", async (message) => {
    await payments.capture(message.content);
    channel.ack(message);
  });
}
`,
  );
  const plugin = queues();
  const idempotency = plugin.rules["require-idempotent-handler"]().collect(document);
  const acknowledgement = plugin.rules["no-acknowledge-before-processing"]().collect(document);

  assert.equal(idempotency.length, 1);
  assert.equal(acknowledgement.length, 1);
  assert.equal(idempotency[0]?.data?.["api"], "amqplib");
  assert.equal(acknowledgement[0]?.data?.["acknowledgement"], "channel.ack(message)");
  assert.match(JSON.stringify(acknowledgement[0]?.state), /payments\.capture/u);
});

await test("automatic acknowledgement does not create an ordering candidate", () => {
  const document = parser.parse(
    "worker.ts",
    `import amqp from "amqplib";
export async function start(channel: Channel) {
  await channel.consume("events", async (message) => {
    await project(message.content);
  }, { noAck: true });
}
`,
  );
  const plugin = queues();

  assert.equal(plugin.rules["require-idempotent-handler"]().collect(document).length, 1);
  assert.equal(plugin.rules["no-acknowledge-before-processing"]().collect(document).length, 0);
});

await test("acknowledgement evidence preserves transaction commit ordering", () => {
  const document = parser.parse(
    "worker.ts",
    `import { connect } from "amqplib";
export async function start(channel: Channel) {
  await channel.consume("orders", async (message) => {
    const transaction = await database.begin();
    await transaction.insert(orderFrom(message));
    await transaction.commit();
    channel.ack(message);
  });
}
`,
  );
  const candidate = queues().rules["no-acknowledge-before-processing"]().collect(document)[0];

  assert.ok(candidate);
  const state = JSON.stringify(candidate.state);
  assert.ok(state.indexOf("transaction.commit") < state.indexOf("channel.ack"));
});

await test("idempotency evidence includes durable deduplication context", () => {
  const document = parser.parse(
    "worker.ts",
    `import { Kafka } from "kafkajs";
export async function start(consumer: Consumer) {
  await consumer.run({ eachMessage: async ({ message }) => {
    await database.transaction(async (transaction) => {
      await transaction.insertProcessedMessage(message.headers.eventId);
      await transaction.upsertAccount(message.value);
    });
  } });
}
`,
  );
  const candidate = queues().rules["require-idempotent-handler"]().collect(document)[0];

  assert.ok(candidate);
  assert.equal(candidate.data?.["api"], "kafkajs");
  assert.match(JSON.stringify(candidate.state), /insertProcessedMessage/u);
  assert.match(JSON.stringify(candidate.state), /upsertAccount/u);
});

await test("dead-letter rule selects only visible authoritative declarations", () => {
  const plugin = queues();
  const visible = parser.parse(
    "queues.ts",
    `import amqp from "amqplib";
export async function provision(channel: Channel) {
  await channel.assertQueue("jobs", {
    deadLetterExchange: "jobs.dead",
    arguments: { "x-delivery-limit": 5 }
  });
}
`,
  );
  const externallyConfigured = parser.parse(
    "worker.ts",
    `import amqp from "amqplib";
export async function start(channel: Channel) {
  await channel.consume("provisioned-by-terraform", async (message) => {
    await process(message);
    channel.ack(message);
  });
}
`,
  );

  const candidates = plugin.rules["require-dead-letter-policy"]().collect(visible);
  assert.equal(candidates.length, 1);
  assert.match(JSON.stringify(candidates[0]?.data?.["configuration"]), /deadLetterExchange/u);
  assert.equal(
    plugin.rules["require-dead-letter-policy"]().collect(externallyConfigured).length,
    0,
  );
});

await test("queue rules abstain on custom clients and ambiguous inline callbacks", () => {
  const plugin = queues();
  const custom = parser.parse(
    "custom.ts",
    `import { client } from "./custom-client.js";
export async function start() {
  await client.consume("items", async (item) => process(item));
  await client.assertQueue("items", {});
}
`,
  );
  const ambiguous = parser.parse(
    "ambiguous.ts",
    `import amqp from "amqplib";
export async function start(channel: Channel, first: boolean) {
  await channel.consume("items", first
    ? async (message) => processFirst(message)
    : async (message) => processSecond(message));
}
`,
  );

  for (const factory of Object.values(plugin.rules)) {
    assert.equal(factory().collect(custom).length, 0);
  }
  assert.equal(plugin.rules["require-idempotent-handler"]().collect(ambiguous).length, 0);
});

await test("queue diagnostics require the configured probability and confidence", () => {
  const document = parser.parse(
    "worker.ts",
    `import amqp from "amqplib";
export async function start(channel: Channel) {
  await channel.consume("mail", async (message) => mail.send(message.content));
}
`,
  );
  const rule = queues().rules["require-idempotent-handler"]();
  const candidate = rule.collect(document)[0];
  assert.ok(candidate);

  assert.equal(
    rule.diagnose(
      {
        type: "choice",
        choice: "non_idempotent",
        confidence: 0.69,
        probabilities: { non_idempotent: 0.99 },
      },
      candidate,
    ),
    null,
  );
  assert.ok(
    rule.diagnose(
      {
        type: "choice",
        choice: "non_idempotent",
        confidence: 0.7,
        probabilities: { non_idempotent: 0.85 },
      },
      candidate,
    ),
  );
});
