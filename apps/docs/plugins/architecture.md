# Architecture

`@scruple/architecture` enforces repository layer boundaries from parsed relative module references. This is a deterministic repository rule: it does not ask the decision provider.

```sh
pnpm add -D @scruple/architecture
```

```ts
import { defineConfig } from "@scruple/core";
import { architecture } from "@scruple/architecture";

export default defineConfig({
  parser,
  provider,
  plugins: { architecture: architecture() },
  rules: {
    "architecture/no-layer-violations": [
      "error",
      {
        layers: [
          { name: "domain", files: ["src/domain/**"] },
          { name: "application", files: ["src/application/**"], allow: ["domain"] },
        ],
      },
    ],
  },
});
```

| Rule                                                                   | Checks                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| [`architecture/no-layer-violations`](#architectureno-layer-violations) | Relative imports across configured layer boundaries |

## `architecture/no-layer-violations`

Assigns analyzed files to layers using picomatch patterns. A file may depend on its own layer and on layers listed in its source layer's `allow`. It reports resolved relative imports into any other configured layer. Package imports and targets outside configured layers are ignored. Runtime `.js`, `.jsx`, `.mjs`, and `.cjs` references can resolve to their TypeScript source equivalents.

The required `layers` option is a non-empty array. Each layer requires a unique, non-empty `name` and at least one `files` glob. `allow` defaults to `[]` and may contain only configured layer names. A file matching multiple layers is an error. There are no threshold options.
