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
| [`security/no-sensitive-data-exposure`](#securityno-sensitive-data-exposure)             | Sensitive data sent through response or log sinks           |

Both rules accept `threshold`, defaulting to `0.9`, and `minConfidence`, defaulting to `0.75`.

## `security/no-user-controlled-authorization`

Reviews implementation functions containing authority-related terms. It reports when visible code grants access, assigns authority, or persists authority based on client-controlled roles, permissions, scopes, ownership, tenant, or admin claims without validation against a trusted source. Resource IDs alone are not authority claims.

## `security/no-sensitive-data-exposure`

Reviews functions with recognized response and logging sinks. It traces visible projection, masking, redaction, and sanitization and reports credentials, tokens, keys, password material, or evidently confidential personal or tenant data reaching a sink without protection.

```ts
rules: { "security/no-sensitive-data-exposure": ["warn", { minConfidence: 0.8 }] }
```
