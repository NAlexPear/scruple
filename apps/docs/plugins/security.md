# Security

`@scruple/security` provides advisory, provider-backed semantic checks for security-sensitive code. Findings depend on visible same-file evidence and are designed to abstain when trust boundaries or helper behavior are unavailable.

```sh
pnpm add -D @scruple/security
```

```ts
import { defineConfig } from "@scruple/core";
import { security } from "@scruple/security";

export default defineConfig({
  parser,
  provider,
  plugins: { security: security() },
  rules: { "security/no-user-controlled-authorization": "warn" },
});
```

| Rule                                                                                     | Checks                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`security/no-user-controlled-authorization`](#securityno-user-controlled-authorization) | Authorization based on attacker-controlled authority claims |
| [`security/no-sensitive-data-exposure`](#securityno-sensitive-data-exposure)             | Sensitive data sent through output sinks                    |
| [`security/no-untrusted-command-execution`](#securityno-untrusted-command-execution)     | Request data reaching command or code execution             |
| [`security/no-untrusted-mass-assignment`](#securityno-untrusted-mass-assignment)         | Request objects assigned or persisted wholesale             |
| [`security/no-unsafe-redirect`](#securityno-unsafe-redirect)                             | Request-controlled redirect targets                         |

All rules accept `threshold`, defaulting to `0.9`, and `minConfidence`, defaulting to `0.75`.

## `security/no-user-controlled-authorization`

Reviews visible request boundaries or authorization operations. It reports when code grants access or assigns authority based on client-controlled roles, permissions, scopes, ownership, tenant, or admin claims without validation against a trusted source. Resource IDs alone are not authority claims.

## `security/no-sensitive-data-exposure`

Reviews recognized response, render, file-transfer, and redirect sinks. Logging belongs to `observability/no-sensitive-logs`. It traces visible projection, masking, redaction, and sanitization before output.

## `security/no-untrusted-command-execution`

Reviews direct same-function flows from request data to command, shell, or dynamic-code execution. Fixed executables with visibly allowlisted arguments and shell parsing disabled are accepted.

## `security/no-untrusted-mass-assignment`

Reviews direct request-object or spread flows into persistence and assignment sinks. Explicit field projection or a visible allowlisting schema is accepted.

## `security/no-unsafe-redirect`

Reviews request-controlled redirects. Fixed local paths and parsed URLs compared against an exact visible origin allowlist are accepted; hidden validators cause abstention.

```ts
rules: { "security/no-sensitive-data-exposure": ["warn", { minConfidence: 0.8 }] }
```
