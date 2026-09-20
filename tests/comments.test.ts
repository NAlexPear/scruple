import assert from "node:assert/strict";
import test from "node:test";

import { comments } from "@scruple/comments";
import type { ChoiceAnswer } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

const answer = (choice: string, probability: number, confidence: number): ChoiceAnswer => {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: probability },
  };
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
