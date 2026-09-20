import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  ScrupleConfig,
  SemanticRule,
} from "@scruple/core";
import { runScruple } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { preferDatabaseJoinRule, unhelpfulCommentRule, vacuousTestRule } from "@scruple/rules";
import { describe, expect, it } from "vitest";

describe("OXC parser", () => {
  it("normalizes comments, tests, functions, imports, and calls into source targets", () => {
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

    expect(document.issues).toEqual([]);
    expect(document.imports).toEqual([`import { db } from "./db";`]);
    expect(document.comments[0]).toMatchObject({
      value: " Explains a non-obvious constraint.",
      location: { start: { line: 3, column: 1 } },
    });
    expect(document.functions.find((fn) => fn.kind === "test")).toMatchObject({
      testName: "loads users",
      async: true,
      calls: [{ callee: "loadUsers" }],
    });
    expect(
      document.functions.find((fn) => fn.name === "joinedUsers")?.calls.map((call) => call.callee),
    ).toEqual(["db.user.findMany", "db.order.findMany", "users.map"]);
  });
});

describe("semantic rule engine", () => {
  it("finds all three initial rule classes and reports typed model decisions", async () => {
    const provider = fixtureProvider();
    const config: ScrupleConfig = {
      parser: oxcParser(),
      provider,
      concurrency: 2,
      rules: [unhelpfulCommentRule(), vacuousTestRule(), preferDatabaseJoinRule()],
    };
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

    const result = await runScruple(config, [{ filename: "example.test.ts", source }]);

    expect(result.errors).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).toEqual([
      "unhelpful-comment",
      "vacuous-test",
      "prefer-database-join",
    ]);
    expect(result.diagnostics[1]).toMatchObject({ severity: "error", probability: 0.96 });
    expect(result.stats).toMatchObject({ files: 1, candidates: 3, requests: 3 });
  });

  it("batches independent questions that share identical evidence", async () => {
    let requests = 0;
    const provider: DecisionProvider = {
      id: "batch-fixture",
      evaluate(request): Promise<DecisionResponse> {
        requests += 1;
        const answers: Record<string, DecisionAnswer> = {};
        for (const id of Object.keys(request.questions)) {
          answers[id] = { type: "noul", noul: 0 };
        }
        return Promise.resolve({
          model: "fixture",
          answers,
        });
      },
    };

    const result = await runScruple(
      { parser: oxcParser(), provider, rules: [makeRule("one"), makeRule("two")] },
      [{ filename: "one.ts", source: "function example() { return 1; }" }],
    );

    expect(result.errors).toEqual([]);
    expect(result.stats).toMatchObject({ candidates: 2, requests: 1 });
    expect(requests).toBe(1);
  });
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
