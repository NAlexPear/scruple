# Introduction

Scruple is a pluggable semantic code checker. It finds likely mistakes, unclear code, and policy violations by combining focused source evidence with typed decisions from Jev or local Laya.

Traditional static analysis is strongest when syntax and types are enough to prove a result. Scruple is for questions that require interpretation, such as whether a comment contradicts nearby code or whether a queue handler is safe under redelivery.

## What Scruple controls

Scruple keeps the model inside a narrow contract:

1. A parser normalizes source files into comments, functions, tests, imports, calls, and other targets.
2. Enabled plugin rules select bounded evidence and define typed questions.
3. A provider answers those questions.
4. The rule applies its own thresholds and emits a stable diagnostic, or abstains.

The provider never writes diagnostic messages or fixes. Policy stays in versioned plugin code.

## What you choose

Every part is explicit in `scruple.config.ts`:

- **Parser:** how source becomes normalized targets.
- **Provider:** where typed decisions run.
- **Plugins:** which rule libraries are available.
- **Rules:** which policies are enabled and at what severity.
- **Scope:** which files are included or ignored.

Start with one plugin and a small set of rules. Review the findings, calibrate thresholds for your provider and codebase, and expand only when the signal is useful.

## Next steps

- Follow the [quickstart](./quickstart.md) to run your first check.
- [Write your own plugin](./writing-a-plugin.md) to add project-specific semantic policy.
- Learn how [evidence and decisions](../concepts/evidence-and-decisions.md) stay bounded.
- Browse the [plugin rule libraries](../plugins/index.md).
