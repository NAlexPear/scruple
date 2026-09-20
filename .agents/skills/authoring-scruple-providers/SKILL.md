---
name: authoring-scruple-providers
description: Implements and reviews Scruple DecisionProvider adapters, request and response mappings, cancellation, concurrency, usage accounting, cleanup, options, and contract tests. Use when creating a provider package or integrating a model service with Scruple.
---

# Authoring Scruple Providers

Build a narrow adapter between Scruple's provider-neutral decision protocol and one model service.

## Establish the current contract

Before coding, inspect the installed `DecisionProvider`, `DecisionRequest`, `DecisionQuestion`, and
`DecisionResponse` types. In this monorepo they live in `packages/core/src/index.ts`; use
`packages/provider-jev/src/index.ts` and `tests/provider-jev.test.ts` as concrete examples, not as a
substitute for the interface.

## Implement the adapter

1. Define explicit constructor options. Accept credentials and injectable transport/client dependencies rather than reading ambient secrets inside a reusable provider.
2. Validate required options before constructing the service client. Never include credentials in IDs, errors, logs, fixtures, or returned state.
3. Return a stable, non-secret `id`, normally including the configured model when it identifies provider behavior.
4. Set `concurrency` to a positive service-appropriate value when parallel requests are supported; otherwise omit it and let Scruple serialize requests.
5. Translate every supported Scruple question variant—`noul`, `choice`, and `score`—without weakening named criteria or changing JSON values.
6. Forward the optional `AbortSignal` through the service's supported cancellation mechanism.
7. Translate the service response into named Scruple answers. Preserve the resolved model ID and report input/output token usage when available.
8. Implement `close` only when the client owns resources that need cleanup. Make it safe for the engine's normal shutdown path.
9. Let actionable transport and protocol failures reject. Do not fabricate answers, swallow cancellation, or return a successful empty response.

Read [provider contract checks](reference/provider-contract.md) for mapping and test requirements.

## Test without live credentials

Inject a fake transport or client and assert the exact outbound request and normalized response. Cover:

- explicit credentials win over ambient environment values;
- all question types and optional criteria;
- configured and resolved model IDs;
- custom concurrency;
- signal propagation and cancellation;
- usage conversion;
- malformed or omitted service answers;
- timeout/retry options where owned by the adapter;
- cleanup when implemented.

Use obviously fake secrets. A unit test must not require network access or mutate the developer's real
provider configuration.

## Integrate and verify

Export the provider factory from a focused package, declare `@scruple/core` plus the service SDK as
dependencies, and add source/types/import export conditions consistent with neighboring packages. Add
consumer documentation covering credentials, defaults, data handling boundaries, and costs without
making unverified claims about the service.

Run the provider's focused contract test, then typecheck and build the package. Use a live smoke test
only when explicitly requested and authorized to consume external service resources.
