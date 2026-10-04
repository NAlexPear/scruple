import assert from "node:assert/strict";
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
import { goParser } from "@scruple/parser-go";
import { pythonParser } from "@scruple/parser-python";
import { rustParser } from "@scruple/parser-rust";
import { sqlParser } from "@scruple/parser-sql";

type PortableTodoPlugin = ScruplePlugin<{
  "require-actionable-todo": RuleFactory<DecisionRuleOptions>;
}>;

const parsers = [pythonParser(), sqlParser(), rustParser(), goParser()] as const;
const expectedLanguages = ["go", "python", "rust", "sql"];

const fixtures = [
  {
    filename: "service.py",
    source:
      'message = "# TODO fake"\n# TODO improve this\n# TODO remove fallback after issue 42 closes\n',
    expectedComments: ["TODO improve this", "TODO remove fallback after issue 42 closes"],
  },
  {
    filename: "queries.sql",
    source:
      "SELECT '-- TODO fake';\n-- TODO improve this\n-- TODO replace the scan after index idx_jobs ships\n",
    expectedComments: ["TODO improve this", "TODO replace the scan after index idx_jobs ships"],
  },
  {
    filename: "worker.rs",
    source:
      'const NOTE: &str = "// TODO fake";\n// TODO improve this\n// TODO remove polling after event delivery lands\n',
    expectedComments: ["TODO improve this", "TODO remove polling after event delivery lands"],
  },
  {
    filename: "worker.go",
    source:
      'package worker\nconst note = "// TODO fake"\n// TODO improve this\n// TODO remove polling after event delivery lands\n',
    expectedComments: ["TODO improve this", "TODO remove polling after event delivery lands"],
  },
] as const;

const answer = (choice: string, probability = 0.97, confidence = 0.9): ChoiceAnswer => ({
  type: "choice",
  choice,
  confidence,
  probabilities: { [choice]: probability },
});

export const checkPortableTodoPlugin = async (plugin: PortableTodoPlugin): Promise<void> => {
  assert.ok(plugin.languages !== "*", "support only the four tested parser languages");
  assert.deepEqual([...plugin.languages].toSorted(), expectedLanguages, "declared language matrix");

  const factory = plugin.rules["require-actionable-todo"];
  assert.equal(typeof factory, "function", "local rule key");
  const rule = factory({ threshold: { warning: 0.8, error: 0.95 }, minConfidence: 0.7 });

  await Promise.all(
    parsers.map(async (parser, index) => {
      const fixture = fixtures[index];
      assert.ok(fixture);
      assert.equal(parser.supports(fixture.filename), true, `${parser.id}: file routing`);
      const document = await parser.parse(fixture.filename, fixture.source);
      assert.equal(document.language, parser.id);
      assert.deepEqual(document.issues, []);
      assert.equal(document.comments.length, 2, `${parser.id}: strings are not comments`);
      assert.deepEqual(
        document.comments.map((comment) => comment.value.trim()),
        fixture.expectedComments,
      );

      const candidates = rule.collect(document);
      assert.equal(candidates.length, 2, `${parser.id}: normalized comment selection`);
      assert.deepEqual(
        rule.collect({ ...document, source: "raw source deliberately replaced" }),
        candidates,
        `${parser.id}: raw source independence`,
      );
      for (const candidate of candidates) {
        assert.equal(candidate.target.kind, "comment");
        assert.equal(candidate.target.language, parser.id);
        assert.equal(candidate.target.filename, fixture.filename);
        assert.ok(candidate.target.location.start.line >= 2);
        assert.ok(
          JSON.stringify({ state: candidate.state, question: candidate.question }).length < 2000,
        );
      }
      assert.equal(rule.diagnose(answer("vague"), candidates[0]!)?.severity, "error", "finding");
      assert.equal(
        factory().diagnose(answer("vague"), candidates[0]!)?.message,
        "Make this TODO identify concrete follow-up work.",
      );
      assert.equal(rule.diagnose(answer("actionable"), candidates[1]!), null, "safe answer");
      assert.equal(
        rule.diagnose(answer("insufficient_context"), candidates[0]!),
        null,
        "abstention",
      );
    }),
  );

  const python = await pythonParser().parse("large.py", `# TODO ${"x".repeat(100_000)}\n`);
  const large = rule.collect(python)[0];
  assert.ok(large);
  assert.ok(
    JSON.stringify({ state: large.state, question: large.question }).length < 5000,
    "bounded oversized request",
  );
  assert.equal(rule.diagnose(answer("vague"), large), null, "truncated evidence cannot convict");

  const result = await runScruple(
    defineConfig({
      parser: parsers,
      cache: false,
      provider: {
        id: "portable-scripted-eval",
        evaluate(request) {
          assert.ok(JSON.stringify(request).length < 5000, "bounded provider request");
          const state = request.state;
          assert.ok(typeof state === "object" && state !== null && !Array.isArray(state));
          const comment = state["comment"];
          assert.ok(typeof comment === "string");
          const choice = comment.includes("improve this") ? "vague" : "actionable";
          return Promise.resolve({
            model: "scripted-model",
            answers: Object.fromEntries(
              Object.keys(request.questions).map((id) => [id, answer(choice)]),
            ),
          });
        },
      },
      plugins: { team: plugin },
      rules: { "team/require-actionable-todo": "error" },
    }),
    fixtures.map(({ filename, source }) => ({ filename, source })),
    undefined,
    { includeDecisions: true },
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.files, 4, "all real parsers routed one file");
  assert.equal(result.stats.candidates, 8);
  assert.equal(result.stats.requests, 8);
  assert.equal(result.diagnostics.length, 4, "one finding per language");
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.filename).toSorted(),
    fixtures.map((fixture) => fixture.filename).toSorted(),
  );
};

export const parserMatrix = (): readonly SourceParser[] => parsers;

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const modulePath = process.argv[2];
  assert.ok(modulePath !== undefined, "Usage: node check-portable-rule.ts ./plugin.ts");
  /* eslint-disable typescript/no-unsafe-type-assertion -- The checker validates the caller-supplied export below. */
  const artifact = (await import(pathToFileURL(resolve(modulePath)).href)) as {
    portableTodoPlugin?: PortableTodoPlugin;
  };
  /* eslint-enable typescript/no-unsafe-type-assertion */
  assert.ok(artifact.portableTodoPlugin, "Artifact must export portableTodoPlugin");
  await checkPortableTodoPlugin(artifact.portableTodoPlugin);
  process.stdout.write("PASS: real-parser routing, normalized comments, bounds, and abstention\n");
}
