# Introduction

## Make good taste enforceable

Scruple turns engineering judgment into named, tested code checks. Start with built-in rules for common problems, or write custom rules for standards your team repeats in review.

Keep fast compilers and linters close to your editor. Run Scruple after them in CI and before review, where it can check questions that need more context than a syntax pattern can provide. People can then spend review time on architecture, product intent, and standards that still need discussion.

Scruple complements linters and security scanners rather than replacing them. It is MIT licensed, and you choose where its typed decisions run: hosted Jev uses paid model tokens, while local Laya uses your own hardware.

## What Scruple checks

Scruple finds likely mistakes, unclear code, and policy violations by combining focused source evidence with typed decisions. For example, a rule can check whether a comment contradicts nearby code, whether a test verifies the behavior it claims to cover, or whether a retry loop has a deadline.

Traditional static analysis is strongest when syntax and types are enough to prove a result. Scruple is for questions that require interpretation, such as whether a queue handler is safe under redelivery. When the visible evidence cannot support an answer, the rule abstains.

## What Scruple controls

Scruple keeps the decision provider inside a narrow contract:

1. A parser normalizes source files into comments, functions, tests, imports, calls, and other targets.
2. Enabled plugin rules select bounded evidence and define typed questions.
3. A provider answers those questions.
4. The rule applies its own thresholds and emits a stable diagnostic, or abstains.

The provider never writes diagnostic messages or fixes. Rules own the message, severity, source location, and threshold. Policy stays in versioned plugin code, and a rule abstains when the available evidence is insufficient.

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
