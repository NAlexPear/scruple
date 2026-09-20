import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skills = [
  "configuring-scruple",
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
    }),
  ),
);

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
  assert.match(documentation, /amp skill add NAlexPear\/scruple\/\.agents\/skills/u);
  assert.match(documentation, /npx skills add NAlexPear\/scruple/u);
  assert.match(documentation, /--agent amp/u);
});
