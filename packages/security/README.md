# @scruple/security

Advisory semantic rules for security-sensitive JavaScript and TypeScript, packaged as a plugin for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/security
```

Each rule examines a selected function and a limited excerpt from the same file. It never sends the
entire file as surrounding context. The request records each size limit and whether any source was
cut short.

- `security/no-user-controlled-authorization` identifies visible authorization decisions that trust
  client-supplied authority claims such as roles, permissions, scopes, or tenant access.
- `security/no-sensitive-data-exposure` identifies visible sensitive values sent to the deliberately
  bounded sink set below without visible projection, masking, or sanitization.
- `security/no-untrusted-command-execution` checks direct request-controlled command or dynamic-code
  flows.
- `security/no-untrusted-mass-assignment` checks direct request-object persistence and assignment.
- `security/no-unsafe-redirect` checks direct request-controlled redirect targets.

The rules explicitly abstain when trust provenance, middleware, helper behavior, data sensitivity, or
an access boundary is not established by the bounded evidence. A general
`security/require-permission-checks` rule is intentionally not included: per-file function evidence
cannot reliably prove that permission enforcement is absent from router middleware, decorators,
framework policy, or callers.

## Sensitive-output sink boundary

`no-sensitive-data-exposure` selects these statically named JavaScript/TypeScript calls:

- Response/rendering: `download`, `end`, `json`, `jsonp`, `redirect`, `render`, `respondWith`,
  `send`, `sendFile`, `sendStatus`, `write`, and `Response.json`.
- Files: imported `appendFile`, `appendFileSync`, `writeFile`, and `writeFileSync`; the corresponding
  `fs`/`promises` methods; `Bun.write`; and `Deno.writeFile`/`Deno.writeTextFile`.
- Streams: `pipe` and `pipeline`.

Logging remains owned by `observability/no-sensitive-logs`. Unconfigured custom output wrappers are
not guessed: when a helper contract or the destination is hidden, the rule preserves
`insufficient_context` rather than assuming that the helper leaks or protects data.

## Evidence budgets

A security request can include up to:

- 4,000 characters from the function
- 2,000 characters of surrounding code from the same file
- 10 imports of up to 500 characters each
- 20 calls of up to 1,000 characters each

The request records the original size and whether each section was cut short. These limits apply to
the evidence sent to the provider, not to the source location used for the diagnostic.

The parser currently does not expose `NewExpression` or variable-initializer facts. Therefore the
rule can select direct `create`/`update`/assignment flows, but cannot soundly prove the identity chain
in `const model = new Model(req.body); await model.save()` without brittle source matching. Arbitrary
`.save()` calls are intentionally not selected. Constructor-to-save support should be added once the
parser exposes that relationship.

Security linting is not a security guarantee. These rules are advisory review signals, can miss
vulnerabilities, and can report false positives. Use them alongside threat modeling, least-privilege
design, code review, dependency and secret scanning, security tests, and runtime controls.

Follow the published [quickstart](https://scruple.alexpear.workers.dev/guide/quickstart), browse the [rule registry](https://scruple.alexpear.workers.dev/plugins/), compare [providers](https://scruple.alexpear.workers.dev/providers/), or [write a custom rule](https://scruple.alexpear.workers.dev/guide/writing-a-plugin).
