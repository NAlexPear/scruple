import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { noUselessCommentsPlugin } from "@scruple/comments";
import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionResponse,
  SemanticPlugin,
} from "@scruple/core";
import { hasEvalFailures, parseEvalFixtures, runEvaluation, type EvalFixture } from "@scruple/eval";
import { parseEvalOptions } from "@scruple/eval/options";
import { oxcParser } from "@scruple/parser-oxc";
import { preferDatabaseJoinPlugin } from "@scruple/relational-databases";
import { noVacuousTestsPlugin } from "@scruple/tests";

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
  const plugins = [noUselessCommentsPlugin(), noVacuousTestsPlugin(), preferDatabaseJoinPlugin()];
  const parser = oxcParser();

  for (const plugin of plugins) {
    const pluginFixtures = fixtures.filter((fixture) => fixture.pluginId === plugin.id);
    assert.deepEqual(
      new Set(pluginFixtures.map((fixture) => fixture.expectedFinding)),
      new Set([true, false]),
      `${plugin.id} must have both positive and negative cases`,
    );
    for (const fixture of pluginFixtures) {
      const candidates = plugin.collect(parser.parse(fixture.filename, fixture.source));
      assert.ok(candidates.length > 0, `${fixture.id} must reach ${plugin.id}`);
    }
  }
});

await test("evaluation runner scores findings and aggregates usage", async () => {
  const fixtures: EvalFixture[] = [
    {
      id: "bad",
      filename: "bad.ts",
      source: "function bad() { return 1; }",
      pluginId: "test-plugin",
      expectedFinding: true,
    },
    {
      id: "good",
      filename: "good.ts",
      source: "function good() { return 1; }",
      pluginId: "test-plugin",
      expectedFinding: false,
    },
  ];
  const report = await runEvaluation({
    fixtures,
    parser: oxcParser(),
    plugins: [makeTestPlugin()],
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

function makeTestPlugin(): SemanticPlugin {
  return {
    id: "test-plugin",
    description: "Fixture plugin",
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
            severity: "error",
            message: "Bad fixture",
            filename: candidate.target.filename,
            location: candidate.target.location,
          }
        : null;
    },
  };
}

function makeScoringProvider(): DecisionProvider {
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
}
