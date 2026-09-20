import assert from "node:assert/strict";
import test from "node:test";

import { comments } from "@scruple/comments";
import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  SemanticPlugin,
} from "@scruple/core";
import { runScruple } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { relationalDatabases } from "@scruple/relational-databases";
import { tests as testRules } from "@scruple/tests";

await test("OXC normalizes comments, tests, functions, imports, and calls", () => {
  const parser = oxcParser();
  const source = `import { db } from "./db";

// Explains a non-obvious constraint.
test("loads users", async () => {
  await loadUsers();
});

async function joinedUsers() {
  const users = await db.user.findMany();
  const orders = await db.order.findMany();
  return users.map((user) => orders.filter((order) => order.userId === user.id));
}
`;

  const document = parser.parse("example.test.ts", source);

  assert.deepEqual(document.issues, []);
  assert.deepEqual(document.imports, [`import { db } from "./db";`]);
  const comment = document.comments[0];
  assert.ok(comment);
  assert.equal(comment.value, " Explains a non-obvious constraint.");
  assert.deepEqual(comment.location.start, { line: 3, column: 1 });

  const testFunction = document.functions.find((fn) => fn.kind === "test");
  assert.ok(testFunction);
  assert.equal(testFunction.testName, "loads users");
  assert.equal(testFunction.async, true);
  assert.deepEqual(
    testFunction.calls.map((call) => call.callee),
    ["loadUsers"],
  );
  assert.deepEqual(
    document.functions.find((fn) => fn.name === "joinedUsers")?.calls.map((call) => call.callee),
    ["db.user.findMany", "db.order.findMany", "users.map"],
  );
});

await test("engine reports decisions from all three rule categories", async () => {
  const source = `import { db } from "./db";

// Loop through the users and attach their orders.
test("loads users", async () => {
  await loadUsers();
});

async function joinedUsers() {
  const users = await db.user.findMany();
  const orders = await db.order.findMany();
  return users.map((user) => orders.filter((order) => order.userId === user.id));
}
`;
  const result = await runScruple(
    {
      parser: oxcParser(),
      provider: fixtureProvider(),
      concurrency: 2,
      plugins: [...comments(), ...testRules(), ...relationalDatabases()],
    },
    [{ filename: "example.test.ts", source }],
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.pluginId),
    [
      "comments/no-useless-comments",
      "tests/no-vacuous-tests",
      "relational-databases/prefer-database-join",
    ],
  );
  assert.equal(result.diagnostics[1]?.severity, "error");
  assert.equal(result.diagnostics[1]?.probability, 0.96);
  assert.deepEqual(result.stats, {
    files: 1,
    candidates: 3,
    requests: 3,
    inputTokens: 30,
    outputTokens: 0,
  });
});

await test("category packs can disable individual rules", () => {
  assert.deepEqual(comments({ noUselessComments: false }), []);
  assert.deepEqual(testRules({ noVacuousTests: false }), []);
  assert.deepEqual(relationalDatabases({ preferDatabaseJoin: false }), []);
});

await test("engine batches independent questions sharing identical evidence", async () => {
  let requests = 0;
  const provider: DecisionProvider = {
    id: "batch-fixture",
    evaluate(request): Promise<DecisionResponse> {
      requests += 1;
      const answers: Record<string, DecisionAnswer> = {};
      for (const id of Object.keys(request.questions)) {
        answers[id] = { type: "noul", noul: 0 };
      }
      return Promise.resolve({ model: "fixture", answers });
    },
  };

  const result = await runScruple(
    { parser: oxcParser(), provider, plugins: [makePlugin("one"), makePlugin("two")] },
    [{ filename: "one.ts", source: "function example() { return 1; }" }],
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.candidates, 2);
  assert.equal(result.stats.requests, 1);
  assert.equal(requests, 1);
});

await test("engine rejects duplicate plugin IDs", async () => {
  const result = await runScruple(
    {
      parser: oxcParser(),
      provider: fixtureProvider(),
      plugins: [makePlugin("duplicate"), makePlugin("duplicate")],
    },
    [{ filename: "one.ts", source: "function example() { return 1; }" }],
  );

  assert.deepEqual(
    result.errors.map((error) => error.message),
    ["Plugin ID is configured more than once: duplicate"],
  );
  assert.equal(result.stats.candidates, 1);
  assert.equal(result.stats.requests, 1);
});

function fixtureProvider(): DecisionProvider {
  return {
    id: "fixture",
    evaluate(request): Promise<DecisionResponse> {
      const answers: Record<string, DecisionAnswer> = {};
      for (const [id, question] of Object.entries(request.questions)) {
        if (question.type === "noul") {
          answers[id] = { type: "noul", noul: 0.99 };
        } else if ("vacuous" in question.criteria) {
          answers[id] = {
            type: "choice",
            choice: "vacuous",
            confidence: 0.9,
            probabilities: {
              meaningful_verification: 0.02,
              vacuous: 0.96,
              insufficient_context: 0.02,
            },
          };
        } else {
          answers[id] = {
            type: "choice",
            choice: "database_pushdown",
            confidence: 0.85,
            probabilities: {
              database_pushdown: 0.9,
              intentionally_in_memory: 0.05,
              insufficient_context: 0.05,
            },
          };
        }
      }
      return Promise.resolve({
        model: "fixture-1",
        answers,
        usage: { inputTokens: 10, outputTokens: 0 },
      });
    },
  };
}

function makePlugin(id: string): SemanticPlugin {
  return {
    id,
    description: id,
    collect(document) {
      const target = document.functions[0];
      if (target === undefined) {
        return [];
      }
      return [
        {
          target,
          state: { function: target.source },
          question: { type: "noul", instructions: id },
        },
      ];
    },
    diagnose: () => null,
  };
}
