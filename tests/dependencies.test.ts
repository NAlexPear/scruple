import assert from "node:assert/strict";
import test from "node:test";

import {
  dependencies,
  maximumEvidenceExcerptCharacters,
  type DependencyFeatureEvidence,
} from "@scruple/dependencies";
import { oxcParser } from "@scruple/parser-oxc";

const source = `export function decodeEntities(input: string) {
  return input.replaceAll("&amp;", "&").replaceAll("&lt;", "<");
}
`;

const featureEvidence = (): DependencyFeatureEvidence => {
  return {
    dependency: "he",
    capability: "Decode HTML character references",
    manifest: { path: "package.json", specifier: "^1.2.0" },
    dependencyImport: {
      filename: "src/render.ts",
      source: 'import { decode } from "he";',
    },
    capabilityExcerpt: {
      path: "node_modules/he/he.d.ts",
      startLine: 2,
      endLine: 2,
      source: "export function decode(text: string): string;",
    },
    localSymbol: {
      filename: "src/decode.ts",
      name: "decodeEntities",
      searchQuery: "function decodeEntities",
      excerpt: {
        path: "src/decode.ts",
        startLine: 1,
        endLine: 3,
        source: 'return input.replaceAll("&amp;", "&").replaceAll("&lt;", "<");',
      },
    },
  };
};

await test("dependency rule only collects exact local symbols with complete bounded evidence", () => {
  const document = oxcParser().parse("src/decode.ts", source);
  const plugin = dependencies();
  const rule = plugin.rules["no-reimplemented-dependency-feature"]({
    evidence: [featureEvidence()],
  });

  const candidates = rule.collect(document);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0]?.state, {
    language: "typescript",
    local_function: source.trim().replace("export ", ""),
    dependency_capability: {
      dependency: "he",
      capability: "Decode HTML character references",
      manifest: { path: "package.json", specifier: "^1.2.0" },
      import: { filename: "src/render.ts", source: 'import { decode } from "he";' },
      excerpt: {
        path: "node_modules/he/he.d.ts",
        startLine: 2,
        endLine: 2,
        source: "export function decode(text: string): string;",
      },
    },
    local_evidence: {
      symbol: "decodeEntities",
      search_query: "function decodeEntities",
      excerpt: {
        path: "src/decode.ts",
        startLine: 1,
        endLine: 3,
        source: 'return input.replaceAll("&amp;", "&").replaceAll("&lt;", "<");',
      },
    },
  });
});

await test("dependency rule abstains when prerequisite evidence is missing, oversized, or stale", () => {
  const document = oxcParser().parse("src/decode.ts", source);
  const missingManifest = featureEvidence();
  missingManifest.manifest.specifier = "";
  const incompleteImport = featureEvidence();
  incompleteImport.dependencyImport.source = 'import { decode } from "another-package";';
  const oversizedCapability = featureEvidence();
  oversizedCapability.capabilityExcerpt.source = "x".repeat(maximumEvidenceExcerptCharacters + 1);
  const staleLocalExcerpt = featureEvidence();
  staleLocalExcerpt.localSymbol.excerpt.source = "return legacyDecode(input);";

  for (const evidence of [
    missingManifest,
    incompleteImport,
    oversizedCapability,
    staleLocalExcerpt,
  ]) {
    const rule = dependencies().rules["no-reimplemented-dependency-feature"]({
      evidence: [evidence],
    });
    assert.deepEqual(rule.collect(document), []);
  }
});

await test("dependency rule diagnoses only confident reimplementation decisions", () => {
  const rule = dependencies().rules["no-reimplemented-dependency-feature"]({
    evidence: [featureEvidence()],
  });
  const candidate = rule.collect(oxcParser().parse("src/decode.ts", source))[0];
  assert.ok(candidate);

  assert.ok(
    rule.diagnose(
      {
        type: "choice",
        choice: "dependency_reimplementation",
        confidence: 0.7,
        probabilities: { dependency_reimplementation: 0.9 },
      },
      candidate,
    ),
  );
  assert.equal(
    rule.diagnose(
      {
        type: "choice",
        choice: "insufficient_context",
        confidence: 0.99,
        probabilities: { dependency_reimplementation: 0.99, insufficient_context: 0.99 },
      },
      candidate,
    ),
    null,
  );
});
