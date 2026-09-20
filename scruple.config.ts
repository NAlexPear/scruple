import { apiContracts } from "@scruple/api-contracts";
import { asyncRules } from "@scruple/async";
import { comments } from "@scruple/comments";
import { defineConfig, type ScrupleConfig } from "@scruple/core";
import { errors } from "@scruple/errors";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { resources } from "@scruple/resources";
import { tests } from "@scruple/tests";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required to run Scruple");
}

const config: ScrupleConfig = defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  include: ["packages/*/src/**/*.ts", "scripts/**/*.ts", "tests/**/*.test.ts"],
  plugins: {
    "api-contracts": apiContracts(),
    async: asyncRules(),
    comments: comments(),
    errors: errors(),
    resources: resources(),
    tests: tests(),
  },
  rules: {
    "api-contracts/no-ambiguous-failure-contracts": "warn",
    "api-contracts/require-input-validation": "warn",
    "async/no-serial-independent-work": "warn",
    "async/no-unbounded-concurrency": "warn",
    "async/require-abort-listener-cleanup": "warn",
    "async/require-cancellation-propagation": "warn",
    "async/require-race-loser-cleanup": "warn",
    "comments/require-actionable-deprecations": "warn",
    "comments/require-actionable-todos": "warn",
    "comments/require-justified-suppressions": "warn",
    "errors/no-lossy-error-wrapping": "warn",
    "errors/no-message-based-error-dispatch": "warn",
    "errors/no-swallowed-errors": "warn",
    "resources/no-leaked-resources": "warn",
    "resources/require-bounded-retries": "warn",
    "resources/require-cleanup-on-failure": "warn",
    "resources/require-complete-resource-cleanup": "warn",
    "resources/require-retry-backoff-with-jitter": "warn",
    "resources/require-retry-time-budget": "warn",
    "tests/no-fixed-delay-synchronization": "warn",
    "tests/no-vacuous-tests": "warn",
    "tests/require-specific-error-assertions": "warn",
  },
});

export default config;
