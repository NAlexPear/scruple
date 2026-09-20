import assert from "node:assert/strict";
import test from "node:test";

import { comments } from "@scruple/comments";
import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  SemanticRule,
} from "@scruple/core";
import { defineConfig, definePlugin, runScruple } from "@scruple/core";
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
  const config = defineConfig({
    parser: oxcParser(),
    provider: fixtureProvider(),
    concurrency: 2,
    plugins: {
      comments: comments(),
      tests: testRules(),
      "relational-databases": relationalDatabases(),
    },
    rules: {
      "comments/no-useless-comments": "warn",
      "tests/no-vacuous-tests": "error",
      "relational-databases/prefer-database-join": "warn",
    },
  });
  const result = await runScruple(config, [{ filename: "example.test.ts", source }]);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.ruleId),
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

await test("plugins register rules without enabling them", async () => {
  assert.deepEqual(Object.keys(comments().rules), [
    "no-useless-comments",
    "no-misleading-comments",
    "no-commented-out-code",
    "no-change-history-comments",
    "prefer-concise-comments",
    "require-actionable-todos",
  ]);
  const result = await runScruple(
    {
      parser: oxcParser(),
      provider: fixtureProvider(),
      plugins: { comments: comments() },
      rules: {},
    },
    [{ filename: "one.ts", source: "// Set active to true\nuser.active = true;" }],
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.candidates, 0);
  assert.equal(result.stats.requests, 0);
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
    {
      parser: oxcParser(),
      provider,
      plugins: {
        fixture: definePlugin({
          rules: {
            one: () => makeRule("one"),
            two: () => makeRule("two"),
          },
        }),
      },
      rules: { "fixture/one": "warn", "fixture/two": "warn" },
    },
    [{ filename: "one.ts", source: "function example() { return 1; }" }],
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.candidates, 2);
  assert.equal(result.stats.requests, 1);
  assert.equal(requests, 1);
});

await test("engine rejects rules from missing plugins and unknown rule names", async () => {
  const result = await runScruple(
    {
      parser: oxcParser(),
      provider: fixtureProvider(),
      plugins: {
        fixture: definePlugin({ rules: { known: () => makeRule("known") } }),
      },
      rules: {
        "missing/rule": "warn",
        "fixture/unknown": "error",
      },
    },
    [{ filename: "one.ts", source: "function example() { return 1; }" }],
  );

  assert.deepEqual(
    result.errors.map((error) => error.message),
    ["Rule missing/rule requires plugin missing", "Plugin fixture does not provide rule unknown"],
  );
  assert.equal(result.stats.candidates, 0);
  assert.equal(result.stats.requests, 0);
});

await test("all comments rules produce their own configured diagnostics", async () => {
  const cases: Array<{
    ruleId: string;
    source: string;
    finding?: string;
    options: Record<string, unknown>;
  }> = [
    {
      ruleId: "comments/no-useless-comments",
      source: "// Set active to true\nuser.active = true;",
      options: {},
    },
    {
      ruleId: "comments/no-misleading-comments",
      source: "export function value() {\n  // Returns milliseconds\n  return seconds;\n}",
      finding: "misleading",
      options: {},
    },
    {
      ruleId: "comments/no-commented-out-code",
      source:
        "export function users() {\n  // const legacy = loadLegacyUsers();\n  return currentUsers;\n}",
      finding: "disabled_code",
      options: {},
    },
    {
      ruleId: "comments/no-change-history-comments",
      source:
        "export function users() {\n  // Previously this used the legacy endpoint.\n  return fetchCurrent();\n}",
      finding: "obsolete_history",
      options: {},
    },
    {
      ruleId: "comments/prefer-concise-comments",
      source:
        "export function cap(retries: number) {\n  // It is important to note that we deliberately cap retries at three. In other words, the retry count cannot exceed three, which is worth keeping in mind.\n  return Math.min(retries, 3);\n}",
      finding: "unnecessarily_verbose",
      options: { minCharacters: 20 },
    },
    {
      ruleId: "comments/require-actionable-todos",
      source: "export function value() {\n  // TODO: fix this later\n  return legacyValue;\n}",
      finding: "unactionable",
      options: {},
    },
  ];

  await Promise.all(
    cases.map(async (entry) => {
      const result = await runScruple(
        {
          parser: oxcParser(),
          provider: findingProvider(entry.finding),
          plugins: { comments: comments() },
          rules: { [entry.ruleId]: ["warn", entry.options] },
        },
        [{ filename: "comment.ts", source: entry.source }],
      );
      assert.deepEqual(result.errors, [], entry.ruleId);
      assert.equal(result.diagnostics[0]?.ruleId, entry.ruleId);
      assert.equal(result.diagnostics[0]?.severity, "warning");
    }),
  );
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

function makeRule(id: string): SemanticRule {
  return {
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

function findingProvider(finding: string | undefined): DecisionProvider {
  return {
    id: "finding-fixture",
    evaluate(request): Promise<DecisionResponse> {
      const answers: Record<string, DecisionAnswer> = {};
      for (const [id, question] of Object.entries(request.questions)) {
        if (question.type === "noul") {
          answers[id] = { type: "noul", noul: 0.99 };
        } else {
          if (finding === undefined) {
            throw new Error("Choice fixtures require a finding");
          }
          answers[id] = {
            type: "choice",
            choice: finding,
            confidence: 0.99,
            probabilities: { [finding]: 0.99 },
          };
        }
      }
      return Promise.resolve({ model: "fixture", answers });
    },
  };
}
