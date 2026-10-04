# Introduction

Scruple turns engineering standards into named, tested code checks. Language-specific parsers read
the source; project-owned rules define what to check.

## What Scruple maintains

Scruple publishes the engine, CLI, parser packages, providers, eval tooling, and agent skills. OXC
parses JavaScript and TypeScript. Tree-sitter packages parse Python, Go, Rust, and SQL.

Scruple does not publish rule packs. The rules under `examples/rules` are unsupported examples and
test fixtures. Projects own their rule policy, evidence, diagnostics, tests, and maintenance.

Shared parser contracts do not make rules portable. Rule authors declare and test each supported
language and framework.

## What Scruple checks

Scruple checks code that already compiles for problems that need judgment. A rule can check whether a comment contradicts nearby code, whether a test proves what it claims, or whether a retry loop has a deadline.

Compilers and linters work best when syntax or types can prove the answer. Scruple handles written standards that need more context. If a rule cannot see enough code to decide, it reports nothing.

## What Scruple controls

Scruple limits what the model can do:

1. A language-specific parser finds bounded source targets and exposes the facts it supports.
2. Each applicable rule narrows those targets. When relevance is ambiguous, it can ask the provider a small classification question.
3. The rule asks one fixed decision question about each selected candidate.
4. The provider answers that question, and the rule decides whether the answer is strong enough to report.

The model never writes warnings or fixes. Each rule controls the warning, severity, location, and required score. Your standards stay in code and can be reviewed with the rest of the project.

## What you choose

Every part is explicit in `scruple.config.ts`:

- **Parsers:** one parser or an array, each owning language IDs, default file patterns, and file support.
- **Provider:** which adapter answers typed questions, using a hosted or local model.
- **Plugins:** which rule implementations are available.
- **Rules:** which checks are enabled and how serious their findings are.
- **Scope:** which files are included or ignored.

Plugins declare language applicability; individual rules can override the plugin scope. Callers do
not repeat language scopes in configuration. Start with one plugin you own or trust and a few rules.
Review the findings and calibrate scores with representative evals before expanding.

## Next steps

- Follow the [quickstart](./quickstart.md) to run your first check.
- [Write a plugin](./writing-a-plugin.md) to check your team's standards.
- Learn how Scruple limits [what each rule can see and ask](../concepts/evidence-and-decisions.md).
- Use the [agent skills](./agent-skills.md) to author, test, and evaluate your own rules.
