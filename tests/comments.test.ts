import assert from "node:assert/strict";
import test from "node:test";

import { comments } from "@scruple/comments";
import type { ChoiceAnswer, JsonValue } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

const answer = (choice: string, probability: number, confidence: number): ChoiceAnswer => {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: probability },
  };
};

const objectValue = (value: JsonValue | undefined): { [key: string]: JsonValue } => {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value;
};

const stringValue = (value: JsonValue | undefined): string => {
  if (typeof value !== "string") {
    throw new TypeError("Expected string evidence");
  }
  return value;
};

await test("no-useless-comments uses explicit choices and abstains on uncertain evidence", () => {
  const document = oxcParser().parse("comments.ts", "// Set active to true\nuser.active = true;\n");
  const rule = comments().rules["no-useless-comments"]();
  const candidate = rule.collect(document)[0];
  assert.ok(candidate);
  assert.deepEqual(candidate.question, {
    type: "choice",
    instructions:
      "Does `comment` add no maintainability value because it merely restates obvious code, uses generic section-heading prose, narrates a straightforward next step, or contains AI-assistant meta commentary? Distinguish genuinely useful rationale from comments owned by another rule. Choose insufficient_context when the bounded evidence does not establish whether the comment adds information.",
    criteria: {
      redundant:
        "The comment adds no useful rationale, constraint, warning, domain knowledge, or non-obvious explanation.",
      useful:
        "The comment adds current rationale, a constraint, a warning, domain knowledge, or another non-obvious explanation.",
      belongs_to_other_rule:
        "The comment's primary issue is that it is misleading, disabled code, change history, a deprecation, or another concern owned by a more specific rule.",
      insufficient_context:
        "The bounded evidence does not establish whether the comment adds information beyond the code.",
    },
  });

  assert.equal(rule.diagnose(answer("useful", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("belongs_to_other_rule", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("redundant", 0.89, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("redundant", 0.99, 0.69), candidate), null);
  assert.deepEqual(rule.diagnose(answer("redundant", 0.9, 0.7), candidate), {
    message: "This comment appears to add no useful information.",
    filename: "comments.ts",
    location: candidate.target.location,
    probability: 0.9,
    confidence: 0.7,
  });
});

await test("suppression rule selects disabling directives but not enabling directives or prose", () => {
  const document = oxcParser().parse(
    "suppressions.ts",
    `// @ts-check
// Explain why the compatibility branch exists.
// Documentation should prefer @ts-expect-error over @ts-ignore.
const stable = true;
// @ts-expect-error: TODO
legacyClient.send(payload);
// eslint-disable-next-line security/detect-object-injection -- key is checked above
result[key] = value;
// scruple-disable-next-line security/no-untrusted-command-execution -- command is a fixed fixture
execute(command);
// scruple-enable security/no-untrusted-command-execution
/* c8 ignore next -- platform branch cannot run on Linux */
runWindowsFallback();
`,
  );
  const candidates = comments().rules["require-justified-suppressions"]().collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    [
      "// @ts-expect-error: TODO",
      "// eslint-disable-next-line security/detect-object-injection -- key is checked above",
      "// scruple-disable-next-line security/no-untrusted-command-execution -- command is a fixed fixture",
      "/* c8 ignore next -- platform branch cannot run on Linux */",
    ],
  );
  const question = candidates[0]?.question;
  assert.ok(question?.type === "choice");
  assert.deepEqual(Object.keys(question.criteria), [
    "justified_suppression",
    "unjustified_suppression",
    "generated_or_test_fixture",
    "insufficient_context",
  ]);
});

await test("suppression diagnostics require an unjustified high-confidence decision", () => {
  const rule = comments().rules["require-justified-suppressions"]();
  const candidate = rule.collect(
    oxcParser().parse(
      "suppression.ts",
      "// eslint-disable-next-line no-console\nconsole.log(value);",
    ),
  )[0];
  assert.ok(candidate);

  assert.equal(rule.diagnose(answer("justified_suppression", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("generated_or_test_fixture", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("unjustified_suppression", 0.84, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("unjustified_suppression", 0.99, 0.69), candidate), null);
  assert.deepEqual(rule.diagnose(answer("unjustified_suppression", 0.85, 0.7), candidate), {
    message: "Explain why this suppression is necessary and keep its scope as narrow as possible.",
    filename: "suppression.ts",
    location: candidate.target.location,
    probability: 0.85,
    confidence: 0.7,
  });
});

await test("comment evidence independently bounds million-character line and block comments", () => {
  const payload = "x".repeat(1_000_000);
  const sources = [`// ${payload}\nconst value = 1;`, `/* ${payload} */\nconst value = 1;`];

  for (const source of sources) {
    const candidate = comments()
      .rules["no-misleading-comments"]()
      .collect(oxcParser().parse("large-comment.ts", source))[0];
    assert.ok(candidate);
    const state = objectValue(candidate.state);
    const comment = objectValue(state["comment"]);
    const context = objectValue(state["context"]);
    const commentSource = stringValue(comment["source"]);
    const commentValue = stringValue(comment["value"]);
    const enclosingCode = stringValue(context["enclosing_code"]);

    assert.equal(commentSource.length, 2_000);
    assert.equal(commentValue.length, 2_000);
    assert.equal(enclosingCode.length, 1_000);
    assert.equal(comment["source_truncated"], true);
    assert.equal(comment["value_truncated"], true);
    assert.equal(context["enclosing_code_truncated"], true);
    assert.match(commentSource, /… evidence truncated …/u);
    assert.match(commentValue, /… evidence truncated …/u);
    assert.match(enclosingCode, /… evidence truncated …/u);
    assert.ok(JSON.stringify(state).length < 5_500);
  }
});

await test("actionable TODO selection recognizes standard JSDoc @todo markers", () => {
  const document = oxcParser().parse(
    "todos.ts",
    `/** @todo Replace the compatibility transport after v1 support ends. */
export function send() {}
/** Documentation without a task marker. */
export function receive() {}
`,
  );

  const candidates = comments().rules["require-actionable-todos"]().collect(document);
  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    ["/** @todo Replace the compatibility transport after v1 support ends. */"],
  );
});

await test("change-history selection recognizes completed changes without temporal prose noise", () => {
  const document = oxcParser().parse(
    "history.ts",
    `// Renamed timeoutMs to timeoutSeconds.
const timeoutSeconds = 30;
// Replaced request with fetch.
const client = fetch;
// Added in v2 for streaming clients.
const stream = createStream();
// Before returning, flush the buffered writes.
flush();
// Remove older entries after one hour.
prune();
// The cache is updated before each read.
readCache();
`,
  );

  const candidates = comments().rules["no-change-history-comments"]().collect(document);
  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    [
      "// Renamed timeoutMs to timeoutSeconds.",
      "// Replaced request with fetch.",
      "// Added in v2 for streaming clients.",
    ],
  );
});

await test("deprecation rule selects only @deprecated comments and exposes abstention", () => {
  const document = oxcParser().parse(
    "deprecations.ts",
    `/** Stable connection API. */
export function connect() {}
/** @deprecated Use connect({ protocol: "v2" }) instead. */
export function connectLegacy() {}
/** @deprecated */
export function connectOld() {}
`,
  );
  const rule = comments().rules["require-actionable-deprecations"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source),
    ['/** @deprecated Use connect({ protocol: "v2" }) instead. */', "/** @deprecated */"],
  );
  const candidate = candidates[1];
  assert.ok(candidate);
  const question = candidate.question;
  assert.ok(question.type === "choice");
  assert.deepEqual(Object.keys(question.criteria), [
    "actionable_replacement",
    "justified_no_replacement",
    "unactionable_deprecation",
    "insufficient_context",
  ]);
  assert.equal(rule.diagnose(answer("actionable_replacement", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("justified_no_replacement", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.deepEqual(rule.diagnose(answer("unactionable_deprecation", 0.85, 0.7), candidate), {
    message: "Add a replacement, migration steps, or a clear reason that no replacement exists.",
    filename: "deprecations.ts",
    location: candidate.target.location,
    probability: 0.85,
    confidence: 0.7,
  });
});

await test("comments plugin registers the expanded advisory rule set", () => {
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
});
