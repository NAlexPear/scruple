# Scruple

Scruple is a pluggable semantic code checker that turns focused source evidence and Jev or local Laya decisions into deterministic diagnostics.

Read the [documentation](https://scruple.alexpear.workers.dev/).

## Use Scruple

Scruple requires Node.js 22.18 or newer. Install the CLI, core, OXC parser, a provider, and the example
rule packages you want:

```sh
pnpm add --save-dev \
  @scruple/api-contracts \
  @scruple/architecture \
  @scruple/cli \
  @scruple/core \
  @scruple/parser-oxc \
  @scruple/provider-jev \
  @scruple/async \
  @scruple/caches \
  @scruple/comments \
  @scruple/compatibility \
  @scruple/errors \
  @scruple/observability \
  @scruple/security \
  @scruple/http-clients \
  @scruple/queues \
  @scruple/dependencies \
  @scruple/configuration \
  @scruple/tests \
  @scruple/relational-databases \
  @scruple/resources
```

Create `scruple.config.ts`:

```ts
import { apiContracts } from "@scruple/api-contracts";
import { asyncRules } from "@scruple/async";
import { caches } from "@scruple/caches";
import { architecture } from "@scruple/architecture";
import { comments } from "@scruple/comments";
import { configuration } from "@scruple/configuration";
import { defineConfig } from "@scruple/core";
import { errors } from "@scruple/errors";
import { observability } from "@scruple/observability";
import { httpClients } from "@scruple/http-clients";
import { dependencies } from "@scruple/dependencies";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { queues } from "@scruple/queues";
import { relationalDatabases } from "@scruple/relational-databases";
import { resources } from "@scruple/resources";
import { security } from "@scruple/security";
import { tests } from "@scruple/tests";

const apiKey = process.env["TYPESAFE_API_KEY"];
if (apiKey === undefined) {
  throw new Error("TYPESAFE_API_KEY is required");
}

export default defineConfig({
  parser: oxcParser(),
  provider: jevProvider({ apiKey }),
  plugins: {
    "api-contracts": apiContracts(),
    async: asyncRules(),
    caches: caches(),
    architecture: architecture(),
    comments: comments(),
    errors: errors(),
    observability: observability(),
    security: security(),
    "http-clients": httpClients(),
    queues: queues(),
    dependencies: dependencies(),
    configuration: configuration(),
    tests: tests(),
    "relational-databases": relationalDatabases(),
    resources: resources(),
  },
  rules: {
    "api-contracts/no-misleading-function-names": "warn",
    "api-contracts/no-ambiguous-failure-contracts": "warn",
    "api-contracts/require-input-validation": "warn",
    "async/no-unbounded-concurrency": "warn",
    "async/no-serial-independent-work": "warn",
    "async/require-cancellation-propagation": "warn",
    "caches/no-unsafe-cache-key": "warn",
    "caches/require-cache-invalidation": "warn",
    "caches/no-sensitive-cache-data": "error",
    "architecture/no-layer-violations": [
      "error",
      {
        layers: [
          { name: "domain", files: ["src/domain/**"] },
          { name: "application", files: ["src/application/**"], allow: ["domain"] },
        ],
      },
    ],
    "comments/no-useless-comments": "warn",
    "comments/no-misleading-comments": "warn",
    "comments/no-commented-out-code": "warn",
    "comments/no-change-history-comments": "warn",
    "comments/prefer-concise-comments": ["warn", { threshold: 0.9 }],
    "comments/require-actionable-todos": "off",
    "errors/no-swallowed-errors": "error",
    "observability/no-sensitive-logs": "error",
    "observability/no-unactionable-errors": "warn",
    "observability/require-operation-context": "warn",
    "security/no-user-controlled-authorization": "warn",
    "security/no-sensitive-data-exposure": "warn",
    "http-clients/require-timeout": "error",
    "http-clients/require-response-validation": "warn",
    "http-clients/no-unbounded-retries": "error",
    "queues/require-idempotent-handler": "warn",
    "queues/no-acknowledge-before-processing": "error",
    "queues/require-dead-letter-policy": "warn",
    "dependencies/no-reimplemented-dependency-feature": "off",
    "configuration/no-insecure-production-defaults": "error",
    "configuration/require-environment-validation": "warn",
    "tests/no-vacuous-tests": "error",
    "relational-databases/prefer-database-join": "warn",
    "resources/no-leaked-resources": "error",
    "resources/require-bounded-retries": "warn",
    "resources/require-cleanup-on-failure": "error",
  },
});
```

The configuration chooses where to obtain the API key; this example reads it from the environment.
Then check source files:

```sh
pnpm exec scruple check "src/**/*.{ts,tsx}"
pnpm exec scruple check --format json
```

The Jev provider defaults to the pinned `jev-1.13.0` model rather than the moving `jev-latest`
alias. A run exits 0 when it has no error-severity findings, 1 when it finds at least one error, and
2 when configuration, parsing, or provider operations fail.

### Configure rules

Plugins register rules without enabling them. Configure each rule separately with `"off"`, `"warn"`,
or `"error"`; use a `[severity, options]` tuple for rule-specific options:

```ts
plugins: {
  comments: comments(),
},
rules: {
  "comments/no-useless-comments": ["warn", { threshold: 0.95 }],
  "comments/no-misleading-comments": "error",
  "comments/prefer-concise-comments": "off",
},
```

The key in `plugins` supplies the namespace used by its rule IDs. Unknown rules and rules whose
plugin is not registered are configuration errors.

### Use local Laya

Install the Laya provider and Laya itself:

```sh
pnpm add --save-dev @scruple/provider-laya
pip install laya
```

Replace the provider in `scruple.config.ts`:

```ts
import { layaProvider } from "@scruple/provider-laya";

provider: layaProvider({
  model: "typed-decisions",
  python: "python3",
  preload: true,
}),
```

Scruple keeps one Python process and preloaded router alive for the run. `model: "auto"` uses Laya's
language router. Laya has a smaller context budget than Jev, so calibrate thresholds separately for
each provider and model.

## Rules and plugins

Scruple has no core policy. The included category packages are examples of independently
publishable rule packs, not rules built into the engine:

- `async/no-unbounded-concurrency` identifies native Promise fan-out over visibly unbounded inputs.
- `async/no-serial-independent-work` identifies directly awaited operations that are visibly safe to
  start together.
- `async/require-cancellation-propagation` checks explicit `AbortSignal` contracts when downstream
  cancellation support is visible.
- `caches/no-unsafe-cache-key` identifies visible tenant or user isolation boundaries omitted from
  cache keys.
- `caches/require-cache-invalidation` identifies non-expiring writes without a visible TTL,
  version, invalidation, or external handoff.
- `caches/no-sensitive-cache-data` identifies sensitive values visibly passed to caches without
  encryption or redaction.
- `architecture/no-layer-violations` deterministically checks relative static imports and
  re-exports against explicit layer file globs and allowlists.
- `comments/no-useless-comments` identifies comments that add no useful rationale, constraint, or
  context.
- `comments/no-misleading-comments` identifies comments that contradict the visible code.
- `comments/no-commented-out-code` identifies disabled implementation code preserved in comments.
- `comments/no-change-history-comments` keeps completed change narration in version control.
- `comments/prefer-concise-comments` identifies useful comments padded with unnecessary prose.
- `comments/require-actionable-todos` requires TODO, FIXME, and HACK comments to explain meaningful
  follow-up work.
- `errors/no-swallowed-errors` identifies catch handlers that silently suppress unexpected failures
  without propagation, observable reporting, or a visible intentional recovery contract.
- `observability/no-sensitive-logs` identifies visibly sensitive values emitted without redaction.
- `observability/no-unactionable-errors` identifies error events that lack operation or failure
  evidence.
- `observability/require-operation-context` requires events to name the operation they describe.
- `api-contracts/no-misleading-function-names` identifies names contradicted by visible function
  behavior while abstaining on domain-specific or delegated behavior.
- `api-contracts/no-ambiguous-failure-contracts` identifies directly exported functions with
  overlapping visible failure channels.
- `api-contracts/require-input-validation` identifies directly exported, visibly untrusted
  boundaries that use input without visible runtime validation.
- `http-clients/require-timeout` requires a visible finite deadline for recognized HTTP requests.
- `http-clients/require-response-validation` identifies structured response data used without
  visible runtime validation.
- `http-clients/no-unbounded-retries` identifies recognized requests whose visible retry behavior
  has no finite bound.
- `queues/require-idempotent-handler` identifies visible queue handlers that can repeat side effects
  when a message is redelivered.
- `queues/no-acknowledge-before-processing` identifies explicit delivery acknowledgements that can
  run before processing or transaction commit succeeds.
- `queues/require-dead-letter-policy` checks recognized, visible queue declarations for both a
  dead-letter destination and bounded delivery attempts. It does not infer deployment-managed
  policy from consumer code.
- `dependencies/no-reimplemented-dependency-feature` identifies local functions that duplicate an
  installed dependency capability when supplied with complete, bounded evidence.
- `configuration/no-insecure-production-defaults` identifies insecure fallback values that can be
  used on production paths.
- `configuration/require-environment-validation` identifies environment configuration used without
  an established schema, framework, or direct validation boundary.
- `tests/no-vacuous-tests` identifies tests that do not meaningfully verify behavior.
- `relational-databases/prefer-database-join` identifies function-level in-memory joins that can
  reasonably be performed by the available database layer.
- `resources/no-leaked-resources` identifies function-local resources left owned on a visible exit
  path.
- `resources/require-bounded-retries` requires an enforced attempt, elapsed-time, or deadline bound.
- `resources/require-cleanup-on-failure` identifies success-only cleanup after potentially failing
  work.
- `security/no-user-controlled-authorization` identifies visible authorization decisions that trust
  client-supplied authority claims.
- `security/no-sensitive-data-exposure` identifies visible sensitive values sent to response or log
  sinks without visible protection.

A plugin registers named rules. Semantic rules collect normalized source targets and create typed
decision questions, then deterministically turn provider answers into diagnostics or abstain.
Repository rules inspect the complete normalized document set and can produce deterministic static
diagnostics without model calls. Rules provide stable diagnostic text and never ask a model to
generate messages or fixes.

Security rules are advisory and deliberately abstain when per-file evidence cannot establish trust
provenance, middleware, helper behavior, data sensitivity, or access boundaries. Security linting is
not a security guarantee; use it alongside threat modeling, review, testing, scanning, and runtime
controls.

`@scruple/compatibility` is a deterministic comparison policy set rather than a current-source
plugin. Its `no-breaking-api-changes` and `require-migration-path` rules require explicit, complete
before/after exported-API evidence and report insufficient context when that evidence is unavailable.

OXC is the initial parser, but plugins depend on normalized source excerpts, locations, imports,
calls, and facts rather than serialized syntax trees. Both parsers and decision providers are
swappable through the `SourceParser` and `DecisionProvider` interfaces.

```text
source → parser → normalized targets → enabled plugin rules → decision provider → diagnostics
           OXC                                            Jev or local Laya
```

## Develop Scruple

```sh
pnpm install
pnpm fix
pnpm check
pnpm test
```

`pnpm fix` applies safe Oxlint fixes and Oxfmt formatting. `pnpm check` verifies formatting, linting,
types, and builds without modifying source files. `pnpm test` runs the deterministic Node unit test
suite. Public packages are emitted as unbundled ESM with declarations, source maps, and TypeScript
source. The compiled `scruple` bin leaves dependencies external so parser, provider, and rule plugins
resolve from the consuming project.

Run the documentation site locally with `pnpm --filter @scruple/docs dev`; verify its production
build with `pnpm --filter @scruple/docs test`.

Live model evaluations are separate from deterministic checks:

```sh
# Jev; requires TYPESAFE_API_KEY
pnpm eval

# Local Laya
pnpm eval --provider laya --model typed-decisions

# Compare providers with two runs per pair
pnpm eval --provider jev --provider laya \
  --model jev-1.13.0 --model typed-decisions --repetitions 2
```

The eval runner reports per-case failures, requested and resolved models, token and model-call
counts, repetitions, and p50/p95/total latency as JSON. It exits 1 when decisions miss fixture
expectations and 2 for operational or configuration errors.

### Release

Scruple uses one version for every public package. Prepare and verify a release on `main`:

```sh
pnpm release:version 0.1.0
pnpm check
pnpm test
git add package.json packages/*/package.json
git commit -m "🔖 Release v0.1.0"
git tag -a v0.1.0 -m "🔖 Release v0.1.0"
git push origin main
git push origin v0.1.0
```

The tag workflow checks the fixed version, rebuilds and tests the repository, installs every packed
tarball in a clean npm consumer, then publishes those exact tarballs with provenance and creates a
GitHub release. Rerun it manually with an existing tag after a partial failure; already-published
package versions are skipped.

The `publish` job uses the GitHub `npm` environment and authenticates through short-lived OIDC. Each
package's trusted GitHub publisher points to `NAlexPear/scruple`, `release.yml`, environment `npm`,
with direct publishing enabled.

## License

[MIT](LICENSE)
