import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  ScruplePlugin,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";
import { hasEvalFailures, parseEvalFixtures, runEvaluation, type EvalFixture } from "@scruple/eval";
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

await test("evaluation corpus has unique, reachable positive and negative cases", async () => {
  const raw: unknown = JSON.parse(
    await readFile(new URL("./eval-fixtures.json", import.meta.url), "utf8"),
  );
  const fixtures = parseEvalFixtures(raw);
  const plugins = evaluationPlugins();
  const parser = oxcParser();

  for (const fixture of fixtures) {
    const separator = fixture.ruleId.indexOf("/");
    assert.notEqual(separator, -1, `${fixture.ruleId} must have a plugin namespace`);
    const namespace = fixture.ruleId.slice(0, separator);
    const ruleName = fixture.ruleId.slice(separator + 1);
    const factory = plugins[namespace]?.rules[ruleName];
    assert.ok(factory, `${fixture.ruleId} must be registered`);
    const ruleFixtures = fixtures.filter((candidate) => candidate.ruleId === fixture.ruleId);
    assert.deepEqual(
      new Set(ruleFixtures.map((candidate) => candidate.expectedFinding)),
      new Set([true, false]),
      `${fixture.ruleId} must have both positive and negative cases`,
    );
    const rule = factory();
    assert.ok("collect" in rule, `${fixture.ruleId} must be a semantic rule`);
    const candidates = rule.collect(parser.parse(fixture.filename, fixture.source));
    assert.ok(candidates.length > 0, `${fixture.id} must reach ${fixture.ruleId}`);
  }
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
                  question: { type: "noul", instructions: "Is this bad?" },
                },
              ];
        },
        diagnose(answer, candidate) {
          return answer.type === "noul" && answer.noul > 0.5
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
        answers[id] = { type: "noul", noul: source.includes("bad") ? 0.9 : 0.1 };
      }
      return Promise.resolve({
        model: "resolved-model",
        answers,
        usage: { inputTokens: 7, outputTokens: 3 },
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
      rationale: "The fixture provider identifies the bad function.",
      tags: ["positive"],
    },
    {
      id: "good",
      filename: "good.ts",
      source: "function good() { return 1; }",
      ruleId: "test/bad-rule",
      expectedFinding: false,
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
  assert.deepEqual(report.usage, { inputTokens: 14, modelCalls: 2, outputTokens: 6 });
  assert.equal(report.cases[0]?.model, "resolved-model");
  assert.equal(hasEvalFailures([report]), false);
});
