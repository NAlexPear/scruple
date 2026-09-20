import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  ChoiceAnswer,
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  ScruplePlugin,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";
import {
  hasEvalFailures,
  parseEvalFixtures,
  runEvaluation,
  validateEvalCorpus,
  type EvalFixture,
} from "@scruple/eval";
import { parseEvalOptions } from "@scruple/eval/options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

await test("evaluation options pair providers and models by position", () => {
  assert.deepEqual(
    parseEvalOptions([
      "--provider",
      "jev",
      "--provider",
      "laya",
      "--model",
      "jev-test",
      "--model",
      "typed-decisions",
      "--repetitions",
      "2",
    ]),
    {
      help: false,
      repetitions: 2,
      specs: [
        { provider: "jev", model: "jev-test" },
        { provider: "laya", model: "typed-decisions" },
      ],
    },
  );
  assert.throws(
    () => parseEvalOptions(["--provider", "jev", "--provider", "laya", "--model", "one"]),
    /exactly one --model/u,
  );
});

await test("evaluation corpus covers every registered rule with exact candidates and choices", async () => {
  const raw: unknown = JSON.parse(
    await readFile(new URL("./eval-fixtures.json", import.meta.url), "utf8"),
  );
  const fixtures = parseEvalFixtures(raw);
  const plugins = evaluationPlugins();
  const parser = oxcParser();

  assert.doesNotThrow(() => {
    validateEvalCorpus(fixtures, parser, plugins);
  });
  for (const ruleId of [
    "api-contracts/no-ignored-significant-results",
    "async/no-unobserved-async-work",
    "async/no-async-initialization",
    "errors/no-useless-catch-boundaries",
    "tests/no-nondeterministic-tests",
  ]) {
    assert.ok(
      fixtures.some((fixture) => fixture.ruleId === ruleId),
      `${ruleId} must be covered`,
    );
  }
});

await test("evaluation fixtures require candidate, exact-choice, and abstention expectations", () => {
  const [fixture] = parseEvalFixtures([
    {
      id: "ambiguous",
      filename: "ambiguous.ts",
      source: "function ambiguous() {}",
      rule_id: "test/choice-rule",
      expected_finding: false,
      expected_candidates: 1,
      expected_choice: "insufficient_context",
      expected_abstention: true,
      rationale: "The evidence is intentionally incomplete.",
      tags: ["abstention"],
    },
  ]);

  assert.deepEqual(fixture?.expectedChoices, ["insufficient_context"]);
  assert.equal(fixture?.expectedAbstention, true);
  assert.equal(fixture?.expectedCandidates, 1);
  assert.throws(
    () =>
      parseEvalFixtures([
        {
          id: "invalid-choice",
          filename: "fixture.ts",
          source: "function fixture() {}",
          rule_id: "test/choice-rule",
          expected_finding: false,
          expected_candidates: 1,
          expected_choice: false,
          rationale: "Invalid fixture.",
          tags: ["invalid"],
        },
      ]),
    /nonempty expected_choice/u,
  );
  assert.throws(
    () =>
      parseEvalFixtures([
        {
          id: "invalid-abstention",
          filename: "fixture.ts",
          source: "function fixture() {}",
          rule_id: "test/choice-rule",
          expected_finding: false,
          expected_candidates: 1,
          expected_choice: "safe",
          expected_abstention: "yes",
          rationale: "Invalid fixture.",
          tags: ["invalid"],
        },
      ]),
    /boolean expected_abstention/u,
  );
  assert.throws(
    () =>
      parseEvalFixtures([
        {
          id: "invalid-candidates",
          filename: "fixture.ts",
          source: "function fixture() {}",
          rule_id: "test/choice-rule",
          expected_finding: false,
          expected_candidates: -1,
          rationale: "Invalid fixture.",
          tags: ["invalid"],
        },
      ]),
    /nonnegative expected_candidates/u,
  );
});

const makeTestPlugin = (): ScruplePlugin => {
  return definePlugin({
    rules: {
      "bad-rule": () => ({
        description: "Fixture rule",
        collect(document) {
          const target = document.functions[0];
          return target === undefined
            ? []
            : [
                {
                  target,
                  state: { source: target.source },
                  question: {
                    type: "choice",
                    instructions: "Is this bad?",
                    criteria: { bad: "Bad fixture", good: "Good fixture" },
                  },
                },
              ];
        },
        diagnose(answer, candidate) {
          return answer.type === "choice" && answer.choice === "bad"
            ? {
                message: "Bad fixture",
                filename: candidate.target.filename,
                location: candidate.target.location,
              }
            : null;
        },
      }),
    },
  });
};

const makeScoringProvider = (): DecisionProvider => {
  return {
    id: "fixture",
    evaluate(request): Promise<DecisionResponse> {
      const source = JSON.stringify(request.state);
      const answers: Record<string, DecisionAnswer> = {};
      for (const id of Object.keys(request.questions)) {
        const choice = source.includes("bad") ? "bad" : "good";
        answers[id] = { type: "choice", choice, confidence: 1, probabilities: { [choice]: 1 } };
      }
      return Promise.resolve({
        model: "resolved-model",
        answers,
        usage: { inputTokens: 7, outputTokens: 3 },
      });
    },
  };
};

const makeChoicePlugin = (): ScruplePlugin => {
  return definePlugin({
    rules: {
      "choice-rule": () => ({
        description: "Choice fixture rule",
        collect(document) {
          const target = document.functions[0];
          return target === undefined
            ? []
            : [
                {
                  target,
                  state: { source: target.source },
                  question: {
                    type: "choice" as const,
                    instructions: "Classify the fixture.",
                    criteria: {
                      finding: "The fixture is a finding.",
                      safe: "The fixture is safe.",
                      insufficient_context: "The evidence is incomplete.",
                    },
                  },
                },
              ];
        },
        diagnose(answer, candidate) {
          return answer.type === "choice" &&
            answer.choice === "finding" &&
            (answer.probabilities["finding"] ?? 0) >= 0.9 &&
            answer.confidence >= 0.7
            ? {
                message: "Choice finding",
                filename: candidate.target.filename,
                location: candidate.target.location,
              }
            : null;
        },
      }),
    },
  });
};

const choiceProvider = (choice: string): DecisionProvider => {
  return {
    id: "choice-fixture",
    evaluate(request): Promise<DecisionResponse> {
      return Promise.resolve({
        model: "choice-model",
        answers: Object.fromEntries(
          Object.keys(request.questions).map((id) => [
            id,
            { type: "choice", choice, confidence: 1, probabilities: { [choice]: 1 } },
          ]),
        ),
      });
    },
  };
};

await test("evaluation runner scores findings and aggregates usage", async () => {
  const fixtures: EvalFixture[] = [
    {
      id: "bad",
      filename: "bad.ts",
      source: "function bad() { return 1; }",
      ruleId: "test/bad-rule",
      expectedFinding: true,
      expectedCandidates: 1,
      expectedChoices: ["bad"],
      rationale: "The fixture provider identifies the bad function.",
      tags: ["positive"],
    },
    {
      id: "good",
      filename: "good.ts",
      source: "function good() { return 1; }",
      ruleId: "test/bad-rule",
      expectedFinding: false,
      expectedCandidates: 1,
      expectedChoices: ["good"],
      rationale: "The fixture provider does not identify the good function.",
      tags: ["negative"],
    },
  ];
  const report = await runEvaluation({
    fixtures,
    parser: oxcParser(),
    plugins: { test: makeTestPlugin() },
    provider: makeScoringProvider(),
    providerName: "fixture",
    requestedModel: "requested",
    repetition: 2,
  });

  assert.deepEqual(report.summary, { total: 2, passed: 2, failed: 0 });
  assert.equal(report.repetition, 2);
  assert.deepEqual(
    report.cases.map((result) => result.actualCandidates),
    [1, 1],
  );
  assert.deepEqual(report.usage, { inputTokens: 14, modelCalls: 2, outputTokens: 6 });
  assert.equal(report.cases[0]?.model, "resolved-model");
  assert.equal(hasEvalFailures([report]), false);
});

await test("evaluation runner distinguishes exact safe decisions from abstentions", async () => {
  const base: EvalFixture = {
    id: "choice",
    filename: "choice.ts",
    source: "function choice() { return 1; }",
    ruleId: "test/choice-rule",
    expectedFinding: false,
    expectedCandidates: 1,
    expectedChoices: ["safe"],
    rationale: "Exercise exact decision scoring.",
    tags: ["choice"],
  };
  const options = {
    parser: oxcParser(),
    plugins: { test: makeChoicePlugin() },
    providerName: "fixture",
    requestedModel: "requested",
    repetition: 1,
  };

  const abstention = await runEvaluation({
    ...options,
    fixtures: [{ ...base, expectedChoices: ["insufficient_context"], expectedAbstention: true }],
    provider: choiceProvider("insufficient_context"),
  });
  assert.equal(abstention.summary.passed, 1);
  assert.deepEqual(abstention.cases[0]?.actualChoices, ["insufficient_context"]);
  assert.equal(abstention.cases[0]?.actualAbstention, true);

  const wrongSafeChoice = await runEvaluation({
    ...options,
    fixtures: [{ ...base, expectedChoices: ["safe"], expectedAbstention: false }],
    provider: choiceProvider("insufficient_context"),
  });
  assert.equal(wrongSafeChoice.summary.failed, 1);
  assert.equal(wrongSafeChoice.cases[0]?.actualFinding, false);
});

await test("evaluation runner scores deterministic candidate selection", async () => {
  const report = await runEvaluation({
    fixtures: [
      {
        id: "not-selected",
        filename: "empty.ts",
        source: "const value = 1;",
        ruleId: "test/bad-rule",
        expectedFinding: false,
        expectedCandidates: 1,
        expectedChoices: ["good"],
        rationale: "Exercise selector scoring independently of provider output.",
        tags: ["selector"],
      },
    ],
    parser: oxcParser(),
    plugins: { test: makeTestPlugin() },
    provider: makeScoringProvider(),
    providerName: "fixture",
    requestedModel: "requested",
    repetition: 1,
  });

  assert.equal(report.cases[0]?.actualCandidates, 0);
  assert.equal(report.summary.failed, 1);
});

await test("evaluation rejects a below-threshold finding choice for a safe fixture", async () => {
  const provider: DecisionProvider = {
    id: "below-threshold",
    evaluate(request): Promise<DecisionResponse> {
      return Promise.resolve({
        model: "below-threshold",
        answers: Object.fromEntries(
          Object.keys(request.questions).map((id) => [
            id,
            {
              type: "choice",
              choice: "finding",
              confidence: 1,
              probabilities: { finding: 0.5, safe: 0.5 },
            } satisfies ChoiceAnswer,
          ]),
        ),
      });
    },
  };
  const report = await runEvaluation({
    fixtures: [
      {
        id: "safe-but-wrong-choice",
        filename: "safe.ts",
        source: "function safe() {}",
        ruleId: "test/choice-rule",
        expectedFinding: false,
        expectedCandidates: 1,
        expectedChoices: ["safe"],
        rationale: "A below-threshold finding must not pass as a safe answer.",
        tags: ["negative"],
      },
    ],
    parser: oxcParser(),
    plugins: { test: makeChoicePlugin() },
    provider,
    providerName: "fixture",
    requestedModel: "requested",
    repetition: 1,
  });

  assert.equal(report.cases[0]?.actualFinding, false);
  assert.deepEqual(report.cases[0]?.actualChoices, ["finding"]);
  assert.equal(report.summary.failed, 1);
});

await test("corpus validation rejects duplicate candidates", () => {
  const choiceFactory = makeChoicePlugin().rules["choice-rule"];
  assert.ok(choiceFactory);
  const baseRule = choiceFactory();
  const duplicatePlugin = definePlugin({
    rules: {
      duplicate: () => ({
        ...baseRule,
        collect(document: Parameters<typeof baseRule.collect>[0]) {
          const [candidate] = baseRule.collect(document);
          assert.ok(candidate);
          return [candidate, candidate];
        },
      }),
    },
  });
  const duplicateFixtures: EvalFixture[] = [
    {
      id: "duplicate-positive",
      filename: "duplicate.ts",
      source: "function duplicate() {}",
      ruleId: "test/duplicate",
      expectedFinding: true,
      expectedCandidates: 2,
      expectedChoices: ["finding", "finding"],
      rationale: "Exercise duplicate candidate rejection.",
      tags: ["positive"],
    },
    {
      id: "duplicate-safe",
      filename: "duplicate.ts",
      source: "function duplicate() {}",
      ruleId: "test/duplicate",
      expectedFinding: false,
      expectedCandidates: 2,
      expectedChoices: ["safe", "safe"],
      rationale: "Exercise duplicate candidate rejection.",
      tags: ["negative"],
    },
  ];
  assert.throws(() => {
    validateEvalCorpus(duplicateFixtures, oxcParser(), { test: duplicatePlugin });
  }, /duplicate candidate/u);
});

await test("corpus validation rejects uncovered registered rules", () => {
  const choiceFactory = makeChoicePlugin().rules["choice-rule"];
  assert.ok(choiceFactory);
  const uncoveredPlugin = definePlugin({
    rules: {
      "choice-rule": choiceFactory,
      uncovered: choiceFactory,
    },
  });
  const coveredFixtures: EvalFixture[] = [
    {
      id: "covered-positive",
      filename: "covered.ts",
      source: "function covered() {}",
      ruleId: "test/choice-rule",
      expectedFinding: true,
      expectedCandidates: 1,
      expectedChoices: ["finding"],
      rationale: "Only one registered rule is represented.",
      tags: ["positive"],
    },
    {
      id: "covered-safe",
      filename: "covered.ts",
      source: "function covered() {}",
      ruleId: "test/choice-rule",
      expectedFinding: false,
      expectedCandidates: 1,
      expectedChoices: ["safe"],
      rationale: "Only one registered rule is represented.",
      tags: ["negative"],
    },
  ];
  assert.throws(() => {
    validateEvalCorpus(coveredFixtures, oxcParser(), { test: uncoveredPlugin });
  }, /no evaluation fixtures: test\/uncovered/u);
});

await test("evaluation keeps missing and unexpected provider answer IDs visible", async () => {
  const provider: DecisionProvider = {
    id: "extra-answer",
    evaluate(): Promise<DecisionResponse> {
      const answer: ChoiceAnswer = {
        type: "choice",
        choice: "safe",
        confidence: 1,
        probabilities: { safe: 1 },
      };
      return Promise.resolve({
        model: "extra-answer",
        answers: { unexpected: answer },
      });
    },
  };
  const report = await runEvaluation({
    fixtures: [
      {
        id: "extra-answer",
        filename: "safe.ts",
        source: "function safe() {}",
        ruleId: "test/choice-rule",
        expectedFinding: false,
        expectedCandidates: 1,
        expectedChoices: ["safe"],
        rationale: "Unexpected answer IDs are provider failures.",
        tags: ["provider"],
      },
    ],
    parser: oxcParser(),
    plugins: { test: makeChoicePlugin() },
    provider,
    providerName: "fixture",
    requestedModel: "requested",
    repetition: 1,
  });

  assert.equal(report.summary.failed, 1);
  const [result] = report.cases;
  assert.ok(result);
  const [error] = result.errors;
  assert.ok(error !== undefined);
  assert.match(error, /missing: test_choice-rule_0; unexpected: unexpected/u);
});
