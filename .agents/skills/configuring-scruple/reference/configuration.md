# Configuration reference

## Minimal downstream configuration

```ts
import { defineConfig } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { resources } from "@scruple/resources";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) throw new Error("TYPESAFE_API_KEY is required");

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  plugins: { resources: resources() },
  rules: {
    "resources/require-cleanup-on-failure": "error",
  },
});
```

The configuration contract lives in `@scruple/core`. In this monorepo, verify it in
`packages/core/src/index.ts`; do not rely on this template if the types have changed.

## Useful commands

Downstream repositories normally run:

```sh
pnpm exec scruple "src/**/*.{ts,tsx}"
pnpm exec scruple --format json
```

In this monorepo, use the source entrypoint and existing checks:

```sh
pnpm scruple -- "src/**/*.{ts,tsx}"
pnpm typecheck
pnpm test
```

Adapt the package-manager spelling to the repository. Do not replace an established workflow merely
to match these examples.

## Troubleshooting order

1. Confirm the command's working directory and config discovery.
2. Confirm package installation and compatible versions.
3. Confirm the parser supports the target filename.
4. Confirm the plugin namespace matches the rule ID prefix.
5. Confirm the plugin exports the named rule.
6. Confirm the severity/options tuple is valid.
7. Confirm include, ignore, and suppression rules do not remove the target.
8. Only then investigate provider behavior.
