import { defineConfig, type ScrupleConfig } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { tests } from "@scruple/tests";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required for Scruple dogfooding");
}

const config: ScrupleConfig = defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  include: ["tests/**/*.test.ts"],
  plugins: { tests: tests() },
  rules: {
    "tests/no-fixed-delay-synchronization": "warn",
    "tests/no-vacuous-tests": "warn",
    "tests/require-specific-error-assertions": "warn",
  },
});

export default config;
