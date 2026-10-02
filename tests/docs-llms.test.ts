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

await test("rule catalog pages describe unsupported source examples, not installable packages", async () => {
  const [html, markdown, plugin, index] = await Promise.all([
    readOutput("rules/resources/require-cleanup-on-failure.html"),
    readOutput("rules/resources/require-cleanup-on-failure.md"),
    readOutput("plugins/resources.md"),
    readOutput("plugins.md"),
  ]);
  for (const content of [html, markdown, plugin, index]) {
    assert.match(content, /Unsupported example/u);
    assert.doesNotMatch(content, /pnpm add|@scruple\/resources/u);
  }
  assert.match(html, /Repository-only setup/u);
  assert.match(markdown, /examples\/rules\/resources\/index\.ts/u);
  assert.match(plugin, /@scruple\/example-rules\/resources/u);
});

await test("HTML pages publish rich link preview metadata", async () => {
  const [home, guide, pluginIndex, socialCard] = await Promise.all([
    readOutput("index.html"),
    readOutput("guide/quickstart.html"),
    readOutput("plugins/index.html"),
    readFile(new URL("assets/social-card.png", dist)),
  ]);

  assert.match(home, /<link rel="canonical" href="https:\/\/scruple\.dev\/">/u);
  assert.match(
    home,
    /<meta property="og:title" content="Code checks for problems linters miss \| Scruple">/u,
  );
  assert.match(
    home,
    /<meta property="og:image" content="https:\/\/scruple\.dev\/assets\/social-card\.png">/u,
  );
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/u);
  assert.match(
    guide,
    /<meta property="og:url" content="https:\/\/scruple\.dev\/guide\/quickstart">/u,
  );
  assert.match(guide, /<meta property="og:title" content="Quickstart \| Scruple">/u);
  assert.match(pluginIndex, /<link rel="canonical" href="https:\/\/scruple\.dev\/plugins\/">/u);
  assert.equal(socialCard.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
});
