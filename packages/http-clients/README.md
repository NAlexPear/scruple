# @scruple/http-clients

Semantic rules for bounded HTTP client safety checks, packaged as a plugin for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/http-clients
```

The plugin recognizes global and imported `fetch`, imported Axios, visible `axios.create()` instances,
and client names explicitly supplied through `recognizedClients`. Unknown `client.get()` abstractions
are deliberately ignored. Visible configuration near a recognized client is included as supporting
evidence, while hidden wrapper behavior remains an abstention case.

```ts
httpClients().rules["require-timeout"]({
  recognizedClients: [
    {
      name: "billingClient",
      kind: "axios",
      guarantees: { timeout: true, responseValidation: true, maxRetries: 2 },
    },
  ],
});
```

The three rules are `require-timeout`, `require-response-validation`, and
`no-unbounded-retries`. See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme)
for configuration and provider setup.
