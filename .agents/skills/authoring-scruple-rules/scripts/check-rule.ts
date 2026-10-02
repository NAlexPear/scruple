import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  defineConfig,
  runScruple,
  type ChoiceAnswer,
  type DecisionRuleOptions,
  type RuleFactory,
  type ScruplePlugin,
  type SourceParser,
} from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

type ValidationPlugin = ScruplePlugin<{
  "require-local-validation": RuleFactory<DecisionRuleOptions>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const answer = (choice: string, probability = 0.97, confidence = 0.9): ChoiceAnswer => ({
  type: "choice",
  choice,
  confidence,
  probabilities: { [choice]: probability },
});

// Accepts an independently authored artifact; does not import the reference solution.
export const checkValidationPlugin = async (plugin: ValidationPlugin): Promise<void> => {
  const raw: unknown = JSON.parse(
    await readFile(new URL("../evals/validation-fixtures.json", import.meta.url), "utf8"),
  );
  assert.ok(Array.isArray(raw));
  const fixtures = raw.map((value: unknown) => {
    assert.ok(isRecord(value));
    const { id, filename, source, choices, diagnostics, abstentions } = value;
    assert.ok(typeof id === "string");
    assert.ok(typeof filename === "string");
    assert.ok(typeof source === "string");
    assert.ok(Array.isArray(choices));
    assert.ok(choices.every((choice: unknown): choice is string => typeof choice === "string"));
    assert.equal(typeof diagnostics, "number");
    assert.equal(typeof abstentions, "number");
    return { id, filename, source, choices, diagnostics, abstentions };
  });
  const factory = plugin.rules["require-local-validation"];
  assert.equal(typeof factory, "function", "local rule key");
  const rule = factory({ threshold: { warning: 0.8, error: 0.95 }, minConfidence: 0.7 });
  const scope = rule.languages ?? plugin.languages;
  assert.ok(scope !== "*", "Express semantics must not claim wildcard portability");
  assert.deepEqual(scope.toSorted(), ["javascript", "typescript"], "effective language scope");
  const parser = oxcParser();
  const finding = fixtures[0];
  assert.ok(finding);
  const document = parser.parse(finding.filename, finding.source);
  const candidates = rule.collect(document);
  assert.equal(candidates.length, 1, "finding selection");
  const candidate = candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.target.range.start, 54, "parser target offset");
  assert.deepEqual(candidate.target.location.start, { line: 3, column: 1 });
  assert.deepEqual(
    rule.collect({ ...document, source: "irrelevant source replaced" }),
    candidates,
    "selection and evidence use normalized targets, not raw source",
  );
  const { apiBoundaries: _boundaries, ...withoutBoundaries } = document;
  assert.deepEqual(rule.collect(withoutBoundaries), [], "missing capability is not a finding");
  assert.deepEqual(rule.collect({ ...document, apiBoundaries: [] }), [], "empty boundaries");
  const boundary = document.apiBoundaries?.[0];
  assert.ok(boundary);
  const second = { ...boundary, range: { start: 900, end: 1000 }, path: "/second" };
  assert.deepEqual(
    rule
      .collect({ ...document, apiBoundaries: [boundary, second] })
      .map((item) => item.target.range.start),
    [54, 900],
    "source order and no target deduplication",
  );
  const partial = rule.collect({
    ...document,
    apiBoundaries: [
      {
        ...boundary,
        completeness: { ...boundary.completeness, handler: "partial", reasons: ["hidden handler"] },
      },
    ],
  })[0];
  assert.ok(partial, "partial evidence remains eligible for abstention");
  assert.equal(
    rule.diagnose(answer("unvalidated"), partial),
    null,
    "partial evidence cannot convict",
  );
  const large = rule.collect({
    ...document,
    apiBoundaries: [
      {
        ...boundary,
        handlerSource: "\u0000".repeat(30_000),
        attachments: Array.from({ length: 8 }, () => ({
          kind: "middleware" as const,
          range: { start: 0, end: 3000 },
          source: "\u0000".repeat(3000),
        })),
      },
    ],
  })[0];
  assert.ok(large);
  assert.ok(
    JSON.stringify({ state: large.state, question: large.question }).length <= 5000,
    "bounded request",
  );
  assert.equal(rule.diagnose(answer("unvalidated"), large), null, "truncation cannot convict");

  const custom = factory({ threshold: { warning: 0.61, error: 0.88 }, minConfidence: 0.83 });
  assert.equal(
    custom.diagnose(answer("unvalidated", 0.61, 0.83), candidate)?.severity,
    "warning",
    "custom warning threshold",
  );
  assert.equal(
    custom.diagnose(answer("unvalidated", 0.88, 0.83), candidate)?.severity,
    "error",
    "custom error threshold",
  );
  assert.equal(
    custom.diagnose(answer("unvalidated", 0.99, 0.82), candidate),
    null,
    "custom confidence threshold",
  );

  for (const [probability, confidence, severity] of [
    [0.799, 0.9, null],
    [0.8, 0.7, "warning"],
    [0.949, 0.9, "warning"],
    [0.95, 0.9, "error"],
    [0.99, 0.699, null],
    [Number.NaN, 0.9, null],
    [0.99, Number.NaN, null],
  ] as const) {
    assert.equal(
      rule.diagnose(answer("unvalidated", probability, confidence), candidate)?.severity ?? null,
      severity,
      `diagnosis boundary ${probability}/${confidence}`,
    );
  }
  for (const choice of ["validated", "insufficient_context", "unexpected"]) {
    assert.equal(rule.diagnose(answer(choice), candidate), null, `non-finding ${choice}`);
  }
  assert.equal(rule.diagnose({ type: "noul", noul: 1 }, candidate), null, "wrong answer type");
  assert.equal(
    rule.diagnose({ ...answer("unvalidated"), probabilities: {} }, candidate),
    null,
    "missing probability",
  );
  for (const options of [
    { threshold: 0.8 },
    { threshold: { warning: 0.96, error: 0.8 } },
    { threshold: { warning: -0.1, error: 1 } },
    { threshold: { warning: 0.8, error: 1.01 } },
    { minConfidence: Number.NaN },
  ]) {
    assert.throws(
      () => Reflect.apply(factory, undefined, [options]),
      "invalid options at construction",
    );
  }

  await Promise.all(
    fixtures.map(async (fixture) => {
      let consumed = 0;
      const result = await runScruple(
        defineConfig({
          parser,
          cache: false,
          provider: {
            id: "scripted-eval",
            evaluate(request) {
              assert.ok(JSON.stringify(request).length <= 5000, "bounded full request");
              const answers = Object.fromEntries(
                Object.entries(request.questions).map(([id, question]) => {
                  const choice = fixture.choices[consumed++];
                  assert.ok(choice !== undefined, "unexpected provider question");
                  assert.equal(question.type, "choice");
                  assert.deepEqual(Object.keys(question.criteria ?? {}).toSorted(), [
                    "insufficient_context",
                    "unvalidated",
                    "validated",
                  ]);
                  return [id, answer(choice)];
                }),
              );
              return Promise.resolve({
                model: "scripted-model",
                answers,
                usage: { inputTokens: 11, outputTokens: 3 },
              });
            },
          },
          plugins: { team: plugin },
          rules: { "team/require-local-validation": "error" },
        }),
        [fixture],
        undefined,
        { includeDecisions: true },
      );
      assert.deepEqual(result.errors, [], fixture.id);
      assert.equal(consumed, fixture.choices.length, `${fixture.id}: all labels consumed`);
      assert.equal(result.stats.candidates, fixture.choices.length, `${fixture.id}: candidates`);
      assert.equal(result.stats.requests, fixture.choices.length, `${fixture.id}: requests`);
      assert.equal(result.stats.inputTokens, 11 * fixture.choices.length);
      assert.equal(result.stats.outputTokens, 3 * fixture.choices.length);
      assert.ok(result.decisions);
      assert.equal(
        result.decisions.filter(
          (item) => item.answer.type === "choice" && item.answer.choice === "insufficient_context",
        ).length,
        fixture.abstentions,
      );
      assert.equal(result.diagnostics.length, fixture.diagnostics, `${fixture.id}: diagnostics`);
      for (const diagnostic of result.diagnostics) {
        assert.equal(diagnostic.ruleId, "team/require-local-validation");
        assert.equal(diagnostic.filename, fixture.filename);
        assert.deepEqual(diagnostic.location.start, { line: 3, column: 1 });
        assert.equal(diagnostic.severity, "error");
        assert.equal(diagnostic.model, "scripted-model");
        assert.ok(diagnostic.message.length > 10);
        assert.equal(
          diagnostic.message,
          rule.diagnose(answer("unvalidated"), candidate)?.message,
          "stable author-written message",
        );
      }
    }),
  );

  // Synthetic adapter tests dispatch only; it is not a Python syntax parser.
  const python: SourceParser = {
    id: "synthetic-language-contract",
    languages: ["python"],
    filePatterns: ["**/*.py"],
    supports: (filename) => filename.endsWith(".py"),
    parse: (filename, source) => ({ ...document, filename, source, language: "python" }),
  };
  const collected: string[] = [];
  const scoped = {
    ...plugin,
    rules: {
      "require-local-validation": () => ({
        ...rule,
        collect(doc: Parameters<typeof rule.collect>[0]) {
          collected.push(doc.language);
          return rule.collect(doc);
        },
      }),
    },
  };
  const config = {
    parser: [parser, python],
    provider: {
      id: "must-not-call",
      evaluate: () => {
        throw new Error("unexpected provider work");
      },
    },
    plugins: { team: scoped },
    rules: { "team/require-local-validation": "error" as const },
  };
  const dispatch = await runScruple(config, [{ filename: "service.py", source: "pass" }]);
  assert.deepEqual(dispatch.errors, []);
  assert.deepEqual(collected, [], "unsupported language never reaches collect");
  const noOverlap = await runScruple({ ...config, parser: python }, []);
  assert.equal(noOverlap.errors.length, 1, "unsupported parser is an operational error");
  const suppressed = await runScruple(config, [
    {
      filename: "routes.ts",
      source: finding.source.replace(
        "app.post",
        "// scruple-disable-next-line team/require-local-validation\napp.post",
      ),
    },
  ]);
  assert.deepEqual(suppressed.errors, []);
  assert.equal(suppressed.stats.requests, 0, "suppression prevents provider work");
  assert.equal(suppressed.diagnostics.length, 0);
  collected.length = 0;
  const override = await runScruple(
    {
      ...config,
      plugins: {
        team: {
          ...scoped,
          languages: ["python"],
          rules: {
            "require-local-validation": () => ({
              ...scoped.rules["require-local-validation"](),
              languages: ["typescript"],
            }),
          },
        },
      },
    },
    [
      { filename: "empty.ts", source: "const x = 1;" },
      { filename: "service.py", source: "pass" },
    ],
  );
  assert.deepEqual(override.errors, []);
  assert.deepEqual(collected, ["typescript"], "rule scope replaces plugin scope, not intersection");
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const modulePath = process.argv[2];
  assert.ok(modulePath !== undefined, "Usage: node check-rule.ts ./plugin.ts");
  /* eslint-disable typescript/no-unsafe-type-assertion -- The executable checker below validates this caller-supplied artifact's behavior; a wrong export fails the run. */
  const artifact = (await import(pathToFileURL(resolve(modulePath)).href)) as {
    validationPlugin: ValidationPlugin;
  };
  /* eslint-enable typescript/no-unsafe-type-assertion */
  await checkValidationPlugin(artifact.validationPlugin);
  process.stdout.write(
    "PASS: rule selection, diagnosis, fixture replay, scopes, and suppressions\n",
  );
}
