# Quickstart

Scruple requires Node.js 22.18 or newer. Run it after compilers and linters.

This guide configures the OXC JavaScript/TypeScript parser and the
[Jev provider](../providers/jev.md), then adds a project-owned rule.

## 1. Install the packages

```sh
pnpm add --save-dev \
  @scruple/cli \
  @scruple/core \
  @scruple/parser-oxc \
  @scruple/provider-jev
```

## 2. Create the configuration

Create `scruple.config.ts` in the directory where you will run the CLI:

```ts
import { defineConfig } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required");
}

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  plugins: {},
  rules: {},
});
```

This starter configuration parses files but enables no semantic checks. Installing a parser does not
install rules, and registering a plugin does not enable its rules.

`parser` accepts one parser or a non-empty array. OXC advertises `javascript`, `jsx`, `typescript`, and
`tsx`, plus the file patterns it handles. Use `@scruple/parser-python`, `@scruple/parser-go`,
`@scruple/parser-rust`, or `@scruple/parser-sql` for those languages. See
[file selection](./configuration.md#file-selection) before combining parsers.

## 3. Run Scruple

```sh
export TYPESAFE_API_KEY=your-key
pnpm exec scruple
pnpm exec scruple "src/**/*.{ts,tsx}"
```

The first command discovers files using parser-owned patterns. The second overrides discovery for
that run. With no rules enabled, neither command requests semantic decisions.

Use JSON output in automation:

```sh
pnpm exec scruple --format json
```

Scruple packages use compiled JavaScript by default. To make Node.js 22.18 or newer resolve their
package imports to the published raw TypeScript instead, opt into the `source` condition:

```sh
node --conditions=source app.ts
```

Tooling that consumes this mode must support custom export conditions and erasable TypeScript syntax.

## 4. Add a rule you own

Follow [Write a plugin](./writing-a-plugin.md) to build and test a TODO rule for JavaScript and
TypeScript. Import `todoPolicy` from your own module or package, then replace the empty `plugins`
and `rules` in the starter configuration:

```ts
plugins: { todos: todoPolicy() },
rules: {
  "todos/require-specific-todo": "warn",
},
```

The `todos` key supplies the namespace. The plugin declares supported language IDs; each rule can
override that scope. Scruple runs the rule only on matching documents and reports an enabled rule
whose scope matches none of the configured parsers.

You can also use a third-party plugin whose authors maintain the languages and frameworks you need.
Review its evidence, tests, and evals before enabling it. Existing specialized Scruple rules are
kept under `examples/rules` as unsupported examples and test fixtures. The
[authoring skills](./agent-skills.md) and eval tooling help you develop and validate your own policy.
