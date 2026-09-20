# @scruple/architecture

Deterministic repository architecture rules for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/architecture
```

`no-layer-violations` assigns parsed files to explicitly configured layers and checks relative static imports and re-exports that resolve to another parsed file. A dependency is valid when it stays within its layer or its target layer is listed in `allow`.

```ts
plugins: { architecture: architecture() },
rules: {
  "architecture/no-layer-violations": ["error", {
    layers: [
      { name: "domain", files: ["src/domain/**"] },
      { name: "application", files: ["src/application/**"], allow: ["domain"] },
      { name: "infrastructure", files: ["src/infrastructure/**"], allow: ["application", "domain"] },
    ],
  }],
},
```

The graph evidence contract is intentionally conservative: filenames, static module specifiers, reference kinds, and source locations come from all successfully parsed repository documents. Bare package imports, unresolved aliases, dynamic imports, and files outside that set are not inferred.
