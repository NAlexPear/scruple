# Quickstart

Scruple requires Node.js 22.18 or newer. Run it after compilers and linters.

This guide uses the Resources plugin with the [Jev provider](../providers/jev.md).

## 1. Install the packages

```sh
pnpm add --save-dev \
  @scruple/cli \
  @scruple/core \
  @scruple/parser-oxc \
  @scruple/provider-jev \
  @scruple/resources
```

## 2. Create the configuration

Create `scruple.config.ts` in the directory where you will run the CLI:

```ts
import { defineConfig } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { resources } from "@scruple/resources";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required");
}

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  plugins: {
    resources: resources(),
  },
  rules: {
    "resources/require-cleanup-on-failure": "error",
    "resources/require-retry-time-budget": "warn",
  },
});
```

The key in `plugins` supplies the namespace used by each rule ID. Registering a plugin does not enable its rules.

## 3. Run Scruple

```sh
export TYPESAFE_API_KEY=your-key
pnpm exec scruple "src/**/*.{ts,tsx}"
```

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

## 4. Expand deliberately

Browse [Plugins](../plugins/index.md) for focused rule libraries. Install only the packages you need, register each plugin, then enable its rules individually.
