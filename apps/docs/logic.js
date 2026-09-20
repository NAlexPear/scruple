export const rules = [
  {
    id: "comments/no-useless-comments",
    category: "comments",
    title: "No useless comments",
    description:
      "Finds comments that merely narrate obvious code instead of adding rationale or constraints.",
  },
  {
    id: "comments/no-misleading-comments",
    category: "comments",
    title: "No misleading comments",
    description: "Catches comments that contradict the behavior visible in nearby code.",
  },
  {
    id: "comments/no-commented-out-code",
    category: "comments",
    title: "No commented-out code",
    description:
      "Distinguishes disabled implementation from examples, pseudocode, grammars, and configuration.",
  },
  {
    id: "comments/no-change-history-comments",
    category: "comments",
    title: "No change-history comments",
    description:
      "Leaves completed-change narration to version control while preserving active migration notes.",
  },
  {
    id: "comments/prefer-concise-comments",
    category: "comments",
    title: "Prefer concise comments",
    description: "Finds useful comments padded with repetition, framing, hedging, or filler.",
  },
  {
    id: "comments/require-actionable-todos",
    category: "comments",
    title: "Require actionable TODOs",
    description: "Checks TODO, FIXME, and HACK markers for meaningful follow-up context.",
  },
  {
    id: "tests/no-vacuous-tests",
    category: "tests",
    title: "No vacuous tests",
    description: "Flags tests that execute but do not meaningfully verify behavior.",
  },
  {
    id: "relational-databases/prefer-database-join",
    category: "database",
    title: "Prefer database joins",
    description:
      "Finds in-memory joins that could reasonably use an available relational database layer.",
  },
];

export function filterRules(query = "", category = "all") {
  const normalized = query.trim().toLowerCase();
  return rules.filter((rule) => {
    const categoryMatches = category === "all" || rule.category === category;
    const queryMatches =
      !normalized ||
      `${rule.id} ${rule.title} ${rule.description}`.toLowerCase().includes(normalized);
    return categoryMatches && queryMatches;
  });
}

export function setupContent(step, provider) {
  const providerPackage = provider === "jev" ? "@scruple/provider-jev" : "@scruple/provider-laya";
  if (step === "install") {
    return {
      kicker: "Step one",
      title: "Add Scruple to your project",
      description:
        "Install the CLI, core contracts, parser, one provider, and the rule packs you want to use.",
      filename: "terminal",
      code: `pnpm add --save-dev \\
  @scruple/cli @scruple/core @scruple/parser-oxc \\
  ${providerPackage} @scruple/comments @scruple/tests`,
    };
  }

  if (step === "configure") {
    const providerImport =
      provider === "jev"
        ? 'import { jevProvider } from "@scruple/provider-jev";'
        : 'import { layaProvider } from "@scruple/provider-laya";';
    const providerSetup =
      provider === "jev"
        ? `

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required");
}`
        : "";
    const providerConfig =
      provider === "jev"
        ? "jevProvider({ apiKey })"
        : 'layaProvider({ model: "typed-decisions", preload: true })';
    return {
      kicker: "Step two",
      title: "Make every choice explicit",
      description:
        "Register parser, provider, and plugins separately. Then enable rules by their namespaced IDs.",
      filename: "scruple.config.ts",
      code: `import { comments } from "@scruple/comments";
import { defineConfig } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
${providerImport}${providerSetup}

export default defineConfig({
  parser: oxcParser(),
  provider: ${providerConfig},
  plugins: { comments: comments() },
  rules: {
    "comments/no-useless-comments": "warn",
    "comments/require-actionable-todos": "error",
  },
});`,
    };
  }

  return {
    kicker: "Step three",
    title: "Check the code that matters",
    description:
      "Run Scruple against explicit globs. Use stylish output for people or JSON for automation.",
    filename: "terminal",
    code: `pnpm exec scruple check "src/**/*.{ts,tsx}"

# Machine-readable diagnostics
pnpm exec scruple check --format json`,
  };
}
