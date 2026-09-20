# Introduction

Scruple turns engineering judgment into named, tested code checks.

## What Scruple checks

Scruple checks code that already compiles for problems that need judgment. A rule can check whether a comment contradicts nearby code, whether a test proves what it claims, or whether a retry loop has a deadline.

Compilers and linters work best when syntax or types can prove the answer. Scruple handles written standards that need more context. If a rule cannot see enough code to decide, it reports nothing.

## What Scruple controls

Scruple limits what the model can do:

1. The parser finds comments, functions, tests, calls, and other parts of the code.
2. Each rule chooses the code it needs and asks one fixed question.
3. Jev answers that question.
4. The rule decides whether the answer is strong enough to report.

The model never writes warnings or fixes. Each rule controls the warning, severity, location, and required score. Your standards stay in code and can be reviewed with the rest of the project.

## What you choose

Every part is explicit in `scruple.config.ts`:

- **Parser:** how Scruple reads source files.
- **Provider:** how Scruple sends questions to Jev.
- **Plugins:** which sets of rules are available.
- **Rules:** which checks are enabled and how serious their findings are.
- **Scope:** which files are included or ignored.

Start with one plugin and a few rules. Review the findings, adjust the required scores for your project, and add more rules when the results are useful.

## Next steps

- Follow the [quickstart](./quickstart.md) to run your first check.
- [Write your own plugin](./writing-a-plugin.md) to check your team's standards.
- Learn how Scruple limits [what each rule can see and ask](../concepts/evidence-and-decisions.md).
- Browse the [plugin rule libraries](../plugins/index.md).
