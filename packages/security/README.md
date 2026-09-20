# @scruple/security

Advisory semantic rules for security-sensitive JavaScript and TypeScript, packaged as a plugin for
[Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/security
```

The initial rules inspect selected functions plus bounded context from the same file:

- `security/no-user-controlled-authorization` identifies visible authorization decisions that trust
  client-supplied authority claims such as roles, permissions, scopes, or tenant access.
- `security/no-sensitive-data-exposure` identifies visible sensitive values sent to response or log
  sinks without visible projection, masking, or sanitization.

The rules explicitly abstain when trust provenance, middleware, helper behavior, data sensitivity, or
an access boundary is not established by the supplied file. A general
`security/require-permission-checks` rule is intentionally not included: per-file function evidence
cannot reliably prove that permission enforcement is absent from router middleware, decorators,
framework policy, or callers.

Security linting is not a security guarantee. These rules are advisory review signals, can miss
vulnerabilities, and can report false positives. Use them alongside threat modeling, least-privilege
design, code review, dependency and secret scanning, security tests, and runtime controls.
