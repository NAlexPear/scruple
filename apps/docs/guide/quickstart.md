# Quickstart

Scruple requires Node.js 22.18 or newer. Run it in CI after fast compiler and linter checks and before human review.

This guide uses the Comments plugin with the hosted [Jev provider](../providers/jev.md). To run decisions on your own hardware instead, follow the [local Laya guide](../providers/laya.md).

## 1. Install the packages

```sh
pnpm add --save-dev \
  @scruple/cli \
  @scruple/core \
  @scruple/parser-oxc \
  @scruple/provider-jev \
  @scruple/comments
```

## 2. Create the configuration

Create `scruple.config.ts` in the directory where you will run the CLI:

```ts
import { comments } from "@scruple/comments";
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
  plugins: {
    comments: comments(),
  },
  rules: {
    "comments/no-misleading-comments": "error",
    "comments/no-useless-comments": "warn",
  },
});
```

The key in `plugins` supplies the namespace used by each rule ID. Registering a plugin does not enable its rules.

## 3. Run Scruple

```sh
TYPESAFE_API_KEY=your-key pnpm exec scruple check "src/**/*.{ts,tsx}"
```

Use JSON output in automation:

```sh
pnpm exec scruple check --format json
```

## 4. Expand deliberately

Browse [Plugins](../plugins/index.md) for focused rule libraries. Install only the packages you need, register each plugin, then enable its rules individually.
