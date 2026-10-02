import { defineConfig, type ScrupleConfig } from "@scruple/core";
import { apiContracts } from "@scruple/example-rules/api-contracts";
import { asyncRules } from "@scruple/example-rules/async";
import { comments } from "@scruple/example-rules/comments";
import { errors } from "@scruple/example-rules/errors";
import { resources } from "@scruple/example-rules/resources";
import { tests } from "@scruple/example-rules/tests";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required to run Scruple");
}

const config: ScrupleConfig = defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  include: [
    "packages/*/src/**/*.ts",
    "examples/rules/*/*.ts",
    "scripts/**/*.ts",
    "tests/**/*.test.ts",
  ],
  plugins: {
    "api-contracts": apiContracts(),
    async: asyncRules(),
    comments: comments(),
    errors: errors(),
    resources: resources(),
    tests: tests(),
  },
  rules: {
    "api-contracts/no-ambiguous-failure-contracts": "error",
    "api-contracts/require-input-validation": "error",
    "async/no-serial-independent-work": "error",
    "async/no-unbounded-concurrency": "error",
    "async/require-abort-listener-cleanup": "error",
    "async/require-cancellation-propagation": "error",
    "async/require-race-loser-cleanup": "error",
    "comments/require-actionable-deprecations": "error",
    "comments/require-actionable-todos": "error",
    "comments/require-justified-suppressions": "error",
    "errors/no-lossy-error-wrapping": "error",
    "errors/no-message-based-error-dispatch": "error",
    "errors/no-swallowed-errors": "error",
    "resources/no-leaked-resources": "error",
    "resources/require-bounded-retries": "error",
    "resources/require-cleanup-on-failure": "error",
    "resources/require-complete-resource-cleanup": "error",
    "resources/require-retry-backoff-with-jitter": "error",
    "resources/require-retry-time-budget": "error",
    "tests/no-fixed-delay-synchronization": "error",
    "tests/no-vacuous-tests": "error",
    "tests/require-specific-error-assertions": "error",
  },
});

export default config;
