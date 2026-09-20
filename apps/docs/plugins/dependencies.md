# Dependencies

`@scruple/dependencies` uses explicitly supplied evidence to ask the decision provider whether local code reimplements an installed dependency capability.

```sh
pnpm add -D @scruple/dependencies
```

```ts
import { defineConfig } from "@scruple/core";
import { dependencies } from "@scruple/dependencies";

export default defineConfig({
  parser,
  provider,
  plugins: { dependencies: dependencies() },
  rules: { "dependencies/no-reimplemented-dependency-feature": "warn" },
});
```

| Rule                                                                                                   | Checks                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| [`dependencies/no-reimplemented-dependency-feature`](#dependenciesno-reimplemented-dependency-feature) | Local functions duplicating evidenced dependency features |

## `dependencies/no-reimplemented-dependency-feature`

The rule does not discover capabilities by itself. With no `evidence`, it produces no candidates. Each valid evidence entry identifies a dependency and capability, the manifest declaration, an import that names that dependency, a dependency-capability excerpt, and an exact local function and excerpt. It reports only when the supplied evidence establishes equivalent, replaceable behavior rather than a distinct implementation or necessary adapter.

Options: `threshold` defaults to `0.9`; `minConfidence` defaults to `0.7`; `evidence` defaults to `[]`. Excerpts must be non-empty, at most 2,000 characters and 40 lines, with positive inclusive line numbers. The local excerpt path must equal the local filename and its source must occur in the named function. Invalid evidence entries are ignored.

```ts
rules: {
  "dependencies/no-reimplemented-dependency-feature": ["warn", {
    evidence: [{
      dependency: "some-package",
      capability: "parse a wire format",
      manifest: { path: "package.json", specifier: "^1.0.0" },
      dependencyImport: { filename: "src/read.ts", source: 'import { parse } from "some-package"' },
      capabilityExcerpt: { path: "node_modules/some-package/index.d.ts", startLine: 1, endLine: 1, source: "export function parse(value: string): Result;" },
      localSymbol: {
        filename: "src/local-parser.ts",
        name: "parseLocally",
        searchQuery: "function parseLocally",
        excerpt: { path: "src/local-parser.ts", startLine: 10, endLine: 12, source: "function parseLocally(value: string) { /* bounded source */ }" },
      },
    }],
  }],
}
```
