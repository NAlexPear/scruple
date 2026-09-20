---
name: configuring-scruple
description: Configures Scruple parsers, providers, plugins, rules, suppressions, CLI usage, and CI integration. Use when installing Scruple, creating or editing scruple.config.ts, enabling rules, or troubleshooting Scruple configuration.
---

# Configuring Scruple

Configure Scruple from the packages and APIs actually available in the target repository.

## Workflow

1. Inspect the package manager, installed `@scruple/*` versions, existing `scruple.config.*`, and CI conventions.
2. If working in the Scruple monorepo, read `apps/docs/guide/quickstart.md`, `apps/docs/reference/configuration.md`, and the current exports in `packages/core/src/index.ts` before editing.
3. Install only the parser, provider, plugins, core, and CLI needed by the requested configuration.
4. Create or update `scruple.config.ts` with `defineConfig` so plugin-derived rule names and options remain typed.
5. Keep provider credentials in environment variables. Fail clearly when a required credential is absent; never embed or print it.
6. Register plugins under consumer-chosen namespaces, then enable rules separately. Registration alone must not activate a rule.
7. Preserve existing include, ignore, severity, and suppression choices unless the request changes them.
8. Run the narrowest useful Scruple command, then the repository's typecheck or configuration tests.

## Configuration invariants

- Supply exactly one `SourceParser` and one `DecisionProvider`.
- Plugin namespaces must be non-empty and contain no `/`.
- Rule IDs use exactly `namespace/rule-name` and refer to a registered plugin rule.
- Use `"off"`, `"warn"`, or `"error"`; pass options as `[severity, options]`.
- Do not infer a plugin's namespace from its package name. The key in `plugins` owns the namespace.
- Do not claim a registered plugin runs unless at least one of its rules is enabled.
- Prefer CLI positional globs for one-off runs and `include`/`ignore` for stable project defaults.
- Use full rule IDs in suppression directives and keep exceptions local and justified.

## Verification

Check all of the following when applicable:

1. TypeScript accepts every configured rule name and option.
2. The CLI discovers the intended config from the directory where it runs.
3. At least one representative file is included and an ignored file is excluded.
4. Severity is reflected in the resulting diagnostic.
5. Missing credentials or malformed rule IDs fail without exposing secrets.

Read [configuration details](reference/configuration.md) for templates and repository-specific checks.
