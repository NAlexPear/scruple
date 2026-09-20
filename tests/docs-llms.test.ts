import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const dist = new URL("../apps/docs/.vitepress/dist/", import.meta.url);
const readOutput = (path: string): Promise<string> => readFile(new URL(path, dist), "utf8");

await test("documentation build publishes complete LLM-readable Markdown", async () => {
  const [index, full, generatedFiles] = await Promise.all([
    readOutput("llms.txt"),
    readOutput("llms-full.txt"),
    readdir(dist, { recursive: true }),
  ]);

  assert.match(index, /^# Scruple\n\n> Scruple turns engineering judgment/u);
  assert.doesNotMatch(index, /> >/u);

  const urls = [...index.matchAll(/\]\((https:\/\/scruple\.dev\/[^)]+\.md)\)/gu)].map(
    ([, url]) => new URL(url!),
  );
  assert.ok(urls.length > 60, "llms.txt should index guides, references, plugins, and rules");

  const generatedMarkdown = generatedFiles
    .filter((path) => path.endsWith(".md"))
    .map((path) => path.replaceAll("\\", "/"))
    .toSorted();
  assert.deepEqual(
    urls.map(({ pathname }) => pathname.slice(1)).toSorted(),
    generatedMarkdown,
    "every generated Markdown page should be discoverable from llms.txt",
  );

  await Promise.all(
    urls.map(async ({ href, pathname }) => {
      const markdown = await readOutput(pathname.slice(1));
      assert.match(markdown, /^---\n/u);
      assert.ok(markdown.includes(href));
      assert.match(markdown, /\n# /u);
      assert.doesNotMatch(markdown, /<!doctype html>|<html/u);
    }),
  );

  for (const content of [
    "# Agent skills",
    "# Write a plugin",
    "# Configuration API",
    "# resources/require-cleanup-on-failure",
  ]) {
    assert.match(full, new RegExp(content.replaceAll("/", "\\/"), "u"));
  }
});

await test("HTML pages advertise and render their Markdown alternatives", async () => {
  await Promise.all(
    ["guide/quickstart.html", "rules/resources/require-cleanup-on-failure.html"].map(
      async (path) => {
        const html = await readOutput(path);
        assert.match(html, /rel="alternate" type="text\/markdown"/u);
        assert.match(html, /rel="describedby"/u);
        assert.match(html, />Copy page</u);
      },
    ),
  );
});
