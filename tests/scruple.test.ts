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
import { observability } from "@scruple/observability";
import { oxcParser } from "@scruple/parser-oxc";
import { relationalDatabases } from "@scruple/relational-databases";
import { tests as testRules } from "@scruple/tests";

const fixtureProvider = (): DecisionProvider => {
  return {
    id: "fixture",
    evaluate(request): Promise<DecisionResponse> {
      const answers: Record<string, DecisionAnswer> = {};
      for (const [id, question] of Object.entries(request.questions)) {
        if (question.type === "noul") {
          answers[id] = { type: "noul", noul: 0.99 };
        } else if ("redundant" in question.criteria) {
          answers[id] = {
            type: "choice",
            choice: "redundant",
            confidence: 0.9,
            probabilities: {
              redundant: 0.96,
              useful: 0.02,
              belongs_to_other_rule: 0.01,
              insufficient_context: 0.01,
            },
          };
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
};

const makeRule = (id: string): SemanticRule => {
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
};

const reportingRule = (id: string): SemanticRule => {
  return {
    description: id,
    collect(document) {
      return document.functions.map((target) => ({
        target,
        state: { function: target.source },
        question: { type: "noul", instructions: id },
      }));
    },
    diagnose(_answer, candidate) {
      return {
        message: id,
        filename: candidate.target.filename,
        location: candidate.target.location,
      };
    },
  };
};

const findingProvider = (finding: string | undefined): DecisionProvider => {
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
};

const vacuousAnswer = (probability: number, confidence: number): DecisionAnswer => {
  return {
    type: "choice",
    choice: "vacuous",
    confidence,
    probabilities: { vacuous: probability },
  };
};

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

await test("OXC recognizes modified and generated test callbacks", () => {
  const document = oxcParser().parse(
    "example.test.ts",
    `test.skip("disabled", () => run());
test.each([[1, 2, 3]])("adds %s and %s", (left, right, expected) => {
  expect(add(left, right)).toBe(expected);
});
`,
  );
  const testFunctions = document.functions.filter((fn) => fn.kind === "test");

  assert.deepEqual(
    testFunctions.map((fn) => fn.testName),
    ["disabled", "adds %s and %s"],
  );
  assert.equal(testFunctions[0]?.enclosingSource, 'test.skip("disabled", () => run())');
  const generatedTest = testFunctions[1];
  assert.match(String(generatedTest?.enclosingSource), /^test\.each/u);
});

await test("test rule includes invocation and transitive local assertion helpers", () => {
  const document = oxcParser().parse(
    "math.test.ts",
    `import { expect } from "vitest";

function verifyEqual(actual: number, expected: number) {
  expect(actual).toBe(expected);
}

function assertSum(left: number, right: number, expected: number) {
  verifyEqual(add(left, right), expected);
}

test.each([[1, 2, 3]])("adds %s and %s", (left, right, expected) => {
  assertSum(left, right, expected);
});
`,
  );
  const candidate = testRules().rules["no-vacuous-tests"]().collect(document)[0];
  assert.ok(candidate);

  assert.deepEqual(candidate.state, {
    language: "typescript",
    imports: ['import { expect } from "vitest";'],
    test: {
      name: "adds %s and %s",
      invocation: `test.each([[1, 2, 3]])("adds %s and %s", (left, right, expected) => {
  assertSum(left, right, expected);
})`,
      callback: `(left, right, expected) => {
  assertSum(left, right, expected);
}`,
      calls: ["assertSum"],
    },
    local_helpers: [
      {
        name: "assertSum",
        source: `function assertSum(left: number, right: number, expected: number) {
  verifyEqual(add(left, right), expected);
}`,
      },
      {
        name: "verifyEqual",
        source: `function verifyEqual(actual: number, expected: number) {
  expect(actual).toBe(expected);
}`,
      },
    ],
  });
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

await test("engine optionally preserves accepted and abstained provider decisions", async () => {
  const rule: SemanticRule = {
    description: "Audit fixture",
    collect(document) {
      return document.functions.slice(0, 1).map((target) => ({
        target,
        state: { function: target.source },
        question: {
          type: "choice" as const,
          instructions: "Classify the visible evidence.",
          criteria: { safe: "Safe.", insufficient_context: "Not enough evidence." },
        },
      }));
    },
    diagnose: () => null,
  };
  const provider: DecisionProvider = {
    id: "audit-fixture",
    evaluate(request) {
      const answers = Object.fromEntries(
        Object.keys(request.questions).map((id) => [
          id,
          {
            type: "choice" as const,
            choice: "insufficient_context",
            confidence: 0.88,
            probabilities: { safe: 0.12, insufficient_context: 0.88 },
          },
        ]),
      );
      return Promise.resolve({ model: "audit-model", answers });
    },
  };
  const config = defineConfig({
    parser: oxcParser(),
    provider,
    plugins: { audit: definePlugin({ rules: { evidence: () => rule } }) },
    rules: { "audit/evidence": "warn" },
  });
  const files = [{ filename: "audit.ts", source: "export function audit() { return true; }" }];

  const normal = await runScruple(config, files);
  const explained = await runScruple(config, files, undefined, { includeDecisions: true });

  assert.equal(normal.decisions, undefined);
  assert.deepEqual(explained.diagnostics, []);
  assert.deepEqual(explained.decisions, [
    {
      ruleId: "audit/evidence",
      filename: "audit.ts",
      location: { start: { line: 1, column: 8 }, end: { line: 1, column: 41 } },
      targetKind: "function",
      answer: {
        type: "choice",
        choice: "insufficient_context",
        confidence: 0.88,
        probabilities: { safe: 0.12, insufficient_context: 0.88 },
      },
      diagnostic: false,
      model: "audit-model",
    },
  ]);
});

await test("plugins register rules without enabling them", async () => {
  assert.deepEqual(Object.keys(comments().rules), [
    "no-useless-comments",
    "no-misleading-comments",
    "no-commented-out-code",
    "no-change-history-comments",
    "prefer-concise-comments",
    "require-actionable-todos",
    "require-justified-suppressions",
    "require-actionable-deprecations",
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

await test("observability rules deterministically select bounded call evidence", () => {
  const plugin = observability();
  const document = oxcParser().parse(
    "checkout.ts",
    `import { logger } from "./logger.js";
export function checkout(card: Card, event: string) {
  service.info(card);
  requestLogger.info({ operation: "checkout", card });
  telemetry.captureException(new Error("declined"));
  span.setAttribute("customer.email", card.email);
  logger.error(event);
}
`,
  );

  const sensitive = plugin.rules["no-sensitive-logs"]().collect(document);
  const errors = plugin.rules["no-unactionable-errors"]().collect(document);
  const operations = plugin.rules["require-operation-context"]().collect(document);

  assert.deepEqual(
    sensitive.map((candidate) => candidate.target.source),
    [
      'requestLogger.info({ operation: "checkout", card })',
      'telemetry.captureException(new Error("declined"))',
      'span.setAttribute("customer.email", card.email)',
      "logger.error(event)",
    ],
  );
  assert.deepEqual(
    errors.map((candidate) => candidate.target.source),
    ['telemetry.captureException(new Error("declined"))', "logger.error(event)"],
  );
  assert.deepEqual(
    operations.map((candidate) => candidate.target.source),
    [
      'requestLogger.info({ operation: "checkout", card })',
      'telemetry.captureException(new Error("declined"))',
      "logger.error(event)",
    ],
  );
  assert.equal(sensitive[0]?.target.location.start.line, 4);
  assert.ok(JSON.stringify(sensitive[0]?.state).length < 2_500);

  const largeDocument = oxcParser().parse(
    "large.ts",
    `function record() { logger.info({ operation: "large", value: "${"x".repeat(8_000)}" }); }`,
  );
  const largeState = plugin.rules["no-sensitive-logs"]().collect(largeDocument)[0]?.state;
  assert.ok(JSON.stringify(largeState).length < 6_000);
  assert.match(JSON.stringify(largeState), /excerpt truncated/u);
});

await test("observability rules diagnose only confident configured findings", () => {
  const plugin = observability();
  const document = oxcParser().parse(
    "checkout.ts",
    'function checkout(card: Card) { logger.error("checkout failed", { card }); }',
  );
  const cases = [
    ["no-sensitive-logs", "exposed_sensitive_value"],
    ["no-unactionable-errors", "unactionable"],
    ["require-operation-context", "operation_missing"],
  ] as const;

  for (const [ruleName, finding] of cases) {
    const rule = plugin.rules[ruleName]();
    const candidate = rule.collect(document)[0];
    assert.ok(candidate);
    assert.ok(
      rule.diagnose(
        {
          type: "choice",
          choice: finding,
          confidence: 0.95,
          probabilities: { [finding]: 0.95 },
        },
        candidate,
      ),
    );
    assert.equal(
      rule.diagnose(
        {
          type: "choice",
          choice: "insufficient_context",
          confidence: 0.99,
          probabilities: { insufficient_context: 0.99 },
        },
        candidate,
      ),
      null,
    );
  }
});

await test("comments rules preserve calibrated default decision margins", () => {
  const plugin = comments();
  const parser = oxcParser();
  const document = parser.parse(
    "comments.ts",
    "// Set active to true\nuser.active = true;\n// TODO: fix this later\n",
  );
  const ordinaryCandidate = plugin.rules["no-useless-comments"]().collect(document)[0];
  const todoCandidate = plugin.rules["require-actionable-todos"]().collect(document)[0];
  assert.ok(ordinaryCandidate);
  assert.ok(todoCandidate);

  assert.ok(
    plugin.rules["no-useless-comments"]().diagnose(
      {
        type: "choice",
        choice: "redundant",
        confidence: 0.7,
        probabilities: { redundant: 0.9 },
      },
      ordinaryCandidate,
    ),
  );
  assert.ok(
    plugin.rules["no-misleading-comments"]().diagnose(
      {
        type: "choice",
        choice: "misleading",
        confidence: 0.7,
        probabilities: { misleading: 0.85 },
      },
      ordinaryCandidate,
    ),
  );
  assert.ok(
    plugin.rules["require-actionable-todos"]().diagnose(
      {
        type: "choice",
        choice: "unactionable",
        confidence: 0.7,
        probabilities: { unactionable: 0.8 },
      },
      todoCandidate,
    ),
  );
});

await test("test rule preserves conservative default decision margins", () => {
  const rule = testRules().rules["no-vacuous-tests"]();
  const candidate = rule.collect(
    oxcParser().parse("example.test.ts", 'test("runs", () => run());'),
  )[0];
  assert.ok(candidate);

  assert.ok(rule.diagnose(vacuousAnswer(0.9, 0.7), candidate));
  assert.equal(rule.diagnose(vacuousAnswer(0.89, 0.99), candidate), null);
  assert.equal(rule.diagnose(vacuousAnswer(0.99, 0.69), candidate), null);
  assert.equal(
    rule.diagnose(
      {
        type: "choice",
        choice: "insufficient_context",
        confidence: 0.99,
        probabilities: { vacuous: 0.99, insufficient_context: 0.99 },
      },
      candidate,
    ),
    null,
  );
});

await test("commented-out code rule collects short executable comments", () => {
  const plugin = comments();
  const document = oxcParser().parse(
    "comments.ts",
    "function retry() {\n  // x++;\n  return x;\n}\n",
  );

  assert.equal(plugin.rules["no-commented-out-code"]().collect(document).length, 1);
  assert.equal(plugin.rules["no-misleading-comments"]().collect(document).length, 1);
  assert.equal(plugin.rules["no-useless-comments"]().collect(document).length, 0);
});

await test("comments rules recognize block TODOs, ignore directives, and retain prose", () => {
  const plugin = comments();
  const document = oxcParser().parse(
    "comments.ts",
    '/**\n * TODO: fix this later\n */\nexport const value = legacyValue;\n/* #__PURE__ */ factory();\n// scruple-disable-next-line comments/no-useless-comments -- Generated fixture.\ngenerated();\n// Scruple reports semantic policy findings.\n/// <reference path="./types.d.ts" />\n',
  );

  assert.equal(plugin.rules["require-actionable-todos"]().collect(document).length, 1);
  for (const ruleName of ["no-useless-comments", "no-commented-out-code"] as const) {
    assert.deepEqual(
      plugin.rules[ruleName]()
        .collect(document)
        .map((candidate) => candidate.target.source),
      ["// Scruple reports semantic policy findings."],
    );
  }
});

await test("comments rules bound evidence from large enclosing functions", () => {
  const plugin = comments();
  const document = oxcParser().parse(
    "comments.ts",
    `function example() {\n  const DISTANT_START = "${"a".repeat(600)}";\n  // Return the timeout in milliseconds.\n  return 30;\n  const distantEnd = "${"b".repeat(600)}DISTANT_END";\n}\n`,
  );
  const candidate = plugin.rules["no-misleading-comments"]().collect(document)[0];
  assert.ok(candidate);
  const state = JSON.stringify(candidate.state);

  assert.match(state, /Return the timeout in milliseconds/u);
  assert.doesNotMatch(state, /DISTANT_START/u);
  assert.doesNotMatch(state, /DISTANT_END/u);
});

await test("comments rules reject invalid probability and length options", () => {
  const plugin = comments();

  assert.throws(
    () => plugin.rules["no-useless-comments"]({ threshold: Number.NaN }),
    /threshold must be a finite number between 0 and 1/u,
  );
  assert.throws(
    () => plugin.rules["no-misleading-comments"]({ minConfidence: 1.1 }),
    /minConfidence must be a finite number between 0 and 1/u,
  );
  assert.throws(
    () => plugin.rules["prefer-concise-comments"]({ minCharacters: 1.5 }),
    /minCharacters must be a non-negative integer/u,
  );
});

await test("database join prefilter recognizes common ORM query shapes", () => {
  const rule = relationalDatabases().rules["prefer-database-join"]();
  const sources = [
    `import { Repository } from "typeorm";
async function joined(userRepository: Repository<User>, teamRepository: Repository<Team>) {
  const users = await userRepository.find();
  const teams = await teamRepository.find();
  return users.map((user) => teams.find((team) => team.id === user.teamId));
}`,
    `import knex from "knex";
async function joined() {
  const users = await knex("users");
  const teams = await knex("teams");
  return users.map((user) => teams.find((team) => team.id === user.team_id));
}`,
  ];

  for (const [index, source] of sources.entries()) {
    const candidates = rule.collect(oxcParser().parse(`orm-${index}.ts`, source));
    assert.equal(candidates.length, 1, `ORM case ${index} should reach semantic evaluation`);
  }
});

await test("database join prefilter requires database provenance for generic call names", () => {
  const rule = relationalDatabases().rules["prefer-database-join"]();
  const document = oxcParser().parse(
    "promises.ts",
    `async function pair(values: Promise<string>[]) {
  const left = await Promise.all(values);
  const right = await Promise.all(values);
  return left.map((value, index) => [value, right[index]]);
}`,
  );

  assert.equal(rule.collect(document).length, 0);
});

await test("database join decision receives source-level provenance and can abstain", () => {
  const rule = relationalDatabases().rules["prefer-database-join"]();
  const document = oxcParser().parse(
    "report.ts",
    `import { db } from "./db.js";
async function report() {
  const users = await db.user.findMany();
  const teams = await db.team.findMany();
  return { users: users.map(toApiUser), teams: teams.map(toApiTeam) };
}`,
  );
  const candidate = rule.collect(document)[0];
  assert.ok(candidate);
  assert.deepEqual(candidate.state, {
    language: "typescript",
    imports: ['import { db } from "./db.js";'],
    function: document.functions.find((fn) => fn.name === "report")?.source,
    evidence: {
      database_calls: [
        { callee: "db.user.findMany", source: "db.user.findMany()" },
        { callee: "db.team.findMany", source: "db.team.findMany()" },
      ],
      database_sources: ["db"],
      collection_operations: [
        { callee: "users.map", source: "users.map(toApiUser)" },
        { callee: "teams.map", source: "teams.map(toApiTeam)" },
      ],
    },
    context: { evidence_boundary: "current_file" },
  });
  assert.equal(
    rule.diagnose(
      {
        type: "choice",
        choice: "intentionally_in_memory",
        confidence: 0.99,
        probabilities: { intentionally_in_memory: 0.99 },
      },
      candidate,
    ),
    null,
  );
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

await test("engine suppresses rule-specific candidates before provider evaluation", async () => {
  const result = await runScruple(
    {
      parser: oxcParser(),
      provider: fixtureProvider(),
      plugins: {
        fixture: definePlugin({
          rules: {
            one: () => reportingRule("one"),
            two: () => reportingRule("two"),
          },
        }),
      },
      rules: { "fixture/one": "warn", "fixture/two": "error" },
    },
    [
      {
        filename: "suppressed.ts",
        source: `// scruple-disable-next-line fixture/one -- The first function is intentionally exceptional.
function first() {}
function second() {} // scruple-disable-line fixture/missing, fixture/two -- This error is expected.
/* scruple-disable fixture/one -- Generated compatibility region. */
function third() {}
/* scruple-enable fixture/one */
function fourth() {}
`,
      },
    ],
    undefined,
    { includeDecisions: true },
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => ({
      ruleId: diagnostic.ruleId,
      severity: diagnostic.severity,
      line: diagnostic.location.start.line,
    })),
    [
      { ruleId: "fixture/two", severity: "error", line: 2 },
      { ruleId: "fixture/one", severity: "warning", line: 3 },
      { ruleId: "fixture/two", severity: "error", line: 5 },
      { ruleId: "fixture/one", severity: "warning", line: 7 },
      { ruleId: "fixture/two", severity: "error", line: 7 },
    ],
  );
  assert.equal(result.stats.candidates, 5);
  assert.equal(result.stats.requests, 4);
  assert.equal(result.decisions?.length, 5);
});

await test("engine supports all-rule suppression and selective re-enabling", async () => {
  const result = await runScruple(
    {
      parser: oxcParser(),
      provider: fixtureProvider(),
      plugins: {
        fixture: definePlugin({
          rules: {
            one: () => reportingRule("one"),
            two: () => reportingRule("two"),
          },
        }),
      },
      rules: { "fixture/one": "warn", "fixture/two": "warn" },
    },
    [
      {
        filename: "all-rules.ts",
        source:
          "/* scruple-disable-next-line -- Generated fixture. */\r\n" +
          "function first() {}\r\n" +
          "/* scruple-disable -- Generated compatibility region. */\r\n" +
          "/* scruple-enable fixture/one */\r\n" +
          "function second() {}\r\n" +
          "/* scruple-enable */\r\n" +
          "function third() {}\r\n",
      },
    ],
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => ({
      ruleId: diagnostic.ruleId,
      line: diagnostic.location.start.line,
    })),
    [
      { ruleId: "fixture/one", line: 5 },
      { ruleId: "fixture/one", line: 7 },
      { ruleId: "fixture/two", line: 7 },
    ],
  );
  assert.equal(result.stats.candidates, 3);
  assert.equal(result.stats.requests, 2);
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
      finding: "redundant",
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
    {
      ruleId: "comments/require-justified-suppressions",
      source: "// eslint-disable-next-line no-eval\neval(source);",
      finding: "unjustified_suppression",
      options: {},
    },
    {
      ruleId: "comments/require-actionable-deprecations",
      source: "/** @deprecated */\nexport function legacyValue() { return 1; }",
      finding: "unactionable_deprecation",
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
