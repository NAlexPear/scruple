import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { SemanticRule } from "@scruple/core";

import type * as ValidationModule from "../.agents/skills/authoring-scruple-rules/reference/local-validation.ts";
import type * as PortableTodoModule from "../.agents/skills/authoring-scruple-rules/reference/portable-todo.ts";
import type * as PortableCheckerModule from "../.agents/skills/authoring-scruple-rules/scripts/check-portable-rule.ts";
import type * as CheckerModule from "../.agents/skills/authoring-scruple-rules/scripts/check-rule.ts";
import type * as ParserEvidenceModule from "../.agents/skills/recommending-scruple-rules/evals/inspect-parser-evidence.ts";

// URL imports execute the installable TypeScript assets without requiring emitted .js copies.
/* eslint-disable typescript/no-unsafe-type-assertion -- Fixed local modules checked by tsc via the type imports. */
const { validationPlugin } = (await import(
  new URL(
    "../.agents/skills/authoring-scruple-rules/reference/local-validation.ts",
    import.meta.url,
  ).href
)) as typeof ValidationModule;
const { checkValidationPlugin } = (await import(
  new URL("../.agents/skills/authoring-scruple-rules/scripts/check-rule.ts", import.meta.url).href
)) as typeof CheckerModule;
const { portableTodoPlugin } = (await import(
  new URL("../.agents/skills/authoring-scruple-rules/reference/portable-todo.ts", import.meta.url)
    .href
)) as typeof PortableTodoModule;
const { checkPortableTodoPlugin } = (await import(
  new URL(
    "../.agents/skills/authoring-scruple-rules/scripts/check-portable-rule.ts",
    import.meta.url,
  ).href
)) as typeof PortableCheckerModule;
const { inspectParserEvidence } = (await import(
  new URL(
    "../.agents/skills/recommending-scruple-rules/evals/inspect-parser-evidence.ts",
    import.meta.url,
  ).href
)) as typeof ParserEvidenceModule;
/* eslint-enable typescript/no-unsafe-type-assertion */

const skills = [
  "configuring-scruple",
  "recommending-scruple-rules",
  "authoring-scruple-rules",
  "authoring-scruple-providers",
] as const;

interface SkillEval {
  id: string;
  prompt: string;
  expected_output: string;
  files: string[];
}

interface SkillEvalCorpus {
  skill_name: string;
  evals: SkillEval[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (record: Record<string, unknown>, key: string, minLength = 1): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length < minLength) {
    throw new TypeError(`${key} must be a string of at least ${minLength} characters`);
  }
  return value;
};

const parseCorpus = (value: unknown): SkillEvalCorpus => {
  if (!isRecord(value)) {
    throw new TypeError("Skill eval corpus must be an object");
  }
  const skillName = requiredString(value, "skill_name");
  const entries = value["evals"];
  if (!Array.isArray(entries)) {
    throw new TypeError("evals must be an array");
  }

  const evals = entries.map((entry): SkillEval => {
    if (!isRecord(entry)) {
      throw new TypeError("Each eval must be an object");
    }
    const id = requiredString(entry, "id");
    const prompt = requiredString(entry, "prompt", 21);
    const expectedOutput = requiredString(entry, "expected_output", 41);
    const files = entry["files"];
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    if (!Array.isArray(files) || !files.every((file) => typeof file === "string")) {
      throw new TypeError("files must be an array of strings");
    }
    return { id, prompt, expected_output: expectedOutput, files };
  });

  return { skill_name: skillName, evals };
};

await Promise.all(
  skills.map((skill) =>
    test(`${skill} has valid metadata and behavioral evals`, async () => {
      const skillUrl = new URL(`../.agents/skills/${skill}/SKILL.md`, import.meta.url);
      const evalUrl = new URL(`../.agents/skills/${skill}/evals/evals.json`, import.meta.url);
      const skillMarkdown = await readFile(skillUrl, "utf8");
      const corpus = parseCorpus(JSON.parse(await readFile(evalUrl, "utf8")) as unknown);

      assert.match(skillMarkdown, new RegExp(`^---\\nname: ${skill}\\n`, "u"));
      assert.equal(corpus.skill_name, skill);
      assert.ok(corpus.evals.length >= 3);
      assert.equal(new Set(corpus.evals.map((entry) => entry.id)).size, corpus.evals.length);
      await Promise.all(
        corpus.evals
          .flatMap((entry) => entry.files)
          .map(async (file) => {
            assert.match(file, /^(?:evals|reference)\/[a-z0-9./-]+$/u);
            assert.ok(!file.includes(".."));
            assert.ok((await readFile(new URL(file, skillUrl), "utf8")).length > 0);
          }),
      );
    }),
  ),
);

await test("authoring acceptance checker accepts the worked consumer rule", async () => {
  await checkValidationPlugin(validationPlugin);
});

await test("authoring acceptance checker rejects ignored options", async () => {
  await assert.rejects(
    checkValidationPlugin({
      ...validationPlugin,
      rules: {
        "require-local-validation": () => validationPlugin.rules["require-local-validation"](),
      },
    }),
    /custom warning threshold/u,
  );
});

// These are deliberately wrong implementations, not alternate golden solutions. Each assertion
// must reject for the intended reason, rather than any incidental parser/import/type failure.
const mutations: [string, (rule: SemanticRule) => SemanticRule, RegExp][] = [
  ["empty selector", (rule) => ({ ...rule, collect: () => [] }), /finding selection/u],
  [
    "raw-source discovery",
    (rule) => ({
      ...rule,
      collect: (document) => (document.source.includes("app.post") ? rule.collect(document) : []),
    }),
    /normalized targets/u,
  ],
  [
    "wildcard cross-language claim",
    (rule) => ({ ...rule, languages: "*" }),
    /wildcard portability/u,
  ],
  [
    "missing framework filter",
    (rule) => ({
      ...rule,
      collect: (document) =>
        rule.collect({
          ...document,
          apiBoundaries:
            document.apiBoundaries?.map((target) =>
              Object.assign({}, target, { framework: "express" as const }),
            ) ?? [],
        }),
    }),
    /wrong-framework/u,
  ],
  [
    "unbounded evidence",
    (rule) => ({
      ...rule,
      collect: (document) =>
        rule.collect(document).map((candidate) =>
          Object.assign({}, candidate, {
            state: candidate.target.source + (document.apiBoundaries?.[0]?.handlerSource ?? ""),
          }),
        ),
    }),
    /bounded request/u,
  ],
  [
    "partial evidence conviction",
    (rule) => ({
      ...rule,
      diagnose: (answer, candidate) =>
        rule.diagnose(answer, { ...candidate, data: { incomplete: false } }),
    }),
    /partial evidence cannot convict/u,
  ],
  [
    "safe answers reported",
    (rule) => ({
      ...rule,
      diagnose: (answer, candidate) =>
        rule.diagnose(
          answer.type === "choice" && answer.choice !== "unvalidated"
            ? {
                ...answer,
                choice: "unvalidated",
                probabilities: { unvalidated: 0.99 },
              }
            : answer,
          candidate,
        ),
    }),
    /non-finding validated/u,
  ],
  [
    "strict instead of inclusive error threshold",
    (rule) => ({
      ...rule,
      diagnose(answer, candidate) {
        const diagnostic = rule.diagnose(answer, candidate);
        return diagnostic?.probability === 0.95
          ? { ...diagnostic, severity: "warning" }
          : diagnostic;
      },
    }),
    /diagnosis boundary 0.95/u,
  ],
];

await Promise.all(
  mutations.map(([name, mutate, reason]) =>
    test(`authoring acceptance checker rejects ${name}`, async () => {
      await assert.rejects(
        checkValidationPlugin({
          ...validationPlugin,
          rules: {
            "require-local-validation": (options) =>
              mutate(validationPlugin.rules["require-local-validation"](options)),
          },
        }),
        reason,
      );
    }),
  ),
);

await test("portable authoring checker accepts the real four-parser rule", async () => {
  await checkPortableTodoPlugin(portableTodoPlugin);
});

const portableMutations: [string, typeof portableTodoPlugin, RegExp][] = [
  ["wildcard scope", { ...portableTodoPlugin, languages: "*" }, /four tested parser languages/u],
  [
    "missing language",
    { ...portableTodoPlugin, languages: ["python", "rust", "sql"] },
    /declared language matrix/u,
  ],
  [
    "raw-source selection",
    {
      ...portableTodoPlugin,
      rules: {
        "require-actionable-todo": (options) => {
          const rule = portableTodoPlugin.rules["require-actionable-todo"](options);
          return {
            ...rule,
            collect: (document) => (document.source.includes("TODO") ? rule.collect(document) : []),
          };
        },
      },
    },
    /raw source independence/u,
  ],
  [
    "unbounded normalized comment",
    {
      ...portableTodoPlugin,
      rules: {
        "require-actionable-todo": (options) => {
          const rule = portableTodoPlugin.rules["require-actionable-todo"](options);
          return {
            ...rule,
            collect: (document) =>
              rule
                .collect(document)
                .map((candidate) =>
                  Object.assign({}, candidate, { state: { comment: candidate.target.source } }),
                ),
          };
        },
      },
    },
    /bounded oversized request/u,
  ],
  [
    "truncated evidence conviction",
    {
      ...portableTodoPlugin,
      rules: {
        "require-actionable-todo": (options) => {
          const rule = portableTodoPlugin.rules["require-actionable-todo"](options);
          return {
            ...rule,
            diagnose: (answer, candidate) =>
              rule.diagnose(answer, { ...candidate, data: { truncated: false } }),
          };
        },
      },
    },
    /truncated evidence cannot convict/u,
  ],
];

await Promise.all(
  portableMutations.map(([name, plugin, reason]) =>
    test(`portable authoring checker rejects ${name}`, async () => {
      await assert.rejects(checkPortableTodoPlugin(plugin), reason);
    }),
  ),
);

await test("recommendation evidence probe uses the real parser capability matrix", async () => {
  const evidence = await inspectParserEvidence();
  assert.deepEqual(
    evidence.map(({ parser, language, filename }) => ({ parser, language, filename })),
    [
      { parser: "python", language: "python", filename: "service.py" },
      { parser: "go", language: "go", filename: "service.go" },
      { parser: "rust", language: "rust", filename: "service.rs" },
      { parser: "sql", language: "sql", filename: "service.sql" },
    ],
  );
  assert.deepEqual(evidence[0]?.errorHandlers, [
    { binding: "error", calls: ["log.error"], exits: ["throw"] },
  ]);
  for (const row of evidence.slice(1)) {
    assert.deepEqual(row.errorHandlers, [], `${row.parser}: unsupported normalized error handlers`);
  }
  for (const row of evidence) {
    assert.equal(row.functions.length, 1, `${row.parser}: normalized function`);
    assert.equal(row.hasFacts, false, `${row.parser}: no structured facts`);
    assert.equal(row.hasApiBoundaries, false, `${row.parser}: no API boundaries`);
    assert.deepEqual(row.issues, [], `${row.parser}: valid fixture`);
  }
});

await test("rule skills package actionable grading rubrics, not keyword scores", async () => {
  await Promise.all(
    ["authoring-scruple-rules", "recommending-scruple-rules"].map(async (skill) => {
      const raw: unknown = JSON.parse(
        await readFile(
          new URL(`../.agents/skills/${skill}/evals/evals.json`, import.meta.url),
          "utf8",
        ),
      );
      assert.ok(isRecord(raw));
      assert.ok(Array.isArray(raw["evals"]));
      for (const entry of raw["evals"]) {
        assert.ok(isRecord(entry));
        for (const field of ["assertions", "reject_if"]) {
          const rubric: unknown = entry[field];
          assert.ok(Array.isArray(rubric));
          assert.ok(rubric.length >= 2);
          for (const item of rubric) {
            assert.equal(typeof item, "string");
            assert.ok(String(item).length > 20);
          }
        }
      }
    }),
  );
});

await test("skill installation is documented with every published skill", async () => {
  const documents = await Promise.all(
    [
      new URL("../README.md", import.meta.url),
      new URL("../.agents/skills/README.md", import.meta.url),
      new URL("../apps/docs/guide/agent-skills.md", import.meta.url),
    ].map((url) => readFile(url, "utf8")),
  );
  const documentation = documents.join("\n");

  for (const skill of skills) {
    assert.match(documentation, new RegExp(`\\b${skill}\\b`, "u"));
  }
  assert.match(documentation, /npx skills add NAlexPear\/scruple/u);
  for (const agent of [
    "amp",
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli",
    "github-copilot",
    "opencode",
  ]) {
    assert.match(documentation, new RegExp(`\\b${agent}\\b`, "u"));
  }
  assert.match(documentation, /Bare skills/u);
  assert.match(documentation, /\.agents\/skills\/configuring-scruple/u);
});
