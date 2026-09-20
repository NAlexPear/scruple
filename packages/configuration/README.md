# @scruple/configuration

Semantic rules for application configuration and environment variables, packaged as a plugin for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/configuration
```

The plugin provides:

- `configuration/no-insecure-production-defaults`, which reports security-sensitive fallback values
  only when the available source establishes that they can be used in production.
- `configuration/require-environment-validation`, which reports environment values used without
  schema or framework validation only when the available source establishes that no validation
  boundary protects them.

Both rules inspect a bounded excerpt around a recognizable JavaScript or TypeScript environment
read. They explicitly allow an `insufficient_context` decision when production reachability or a
validation boundary is outside that excerpt. This keeps the package independent of OXC-specific AST
details while Scruple's parser contract does not expose environment expressions.
