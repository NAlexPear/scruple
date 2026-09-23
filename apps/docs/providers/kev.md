# Kev provider

`@scruple/provider-kev` sends bounded code evidence and fixed questions to a
[Kev](https://github.com/jaredpalmer/kev) server, which serves the System One API from open weights.
Kev's server binds to `127.0.0.1`, so evidence stays on your machine.

```sh
pnpm add --save-dev @scruple/provider-kev
```

```ts
import { kevProvider } from "@scruple/provider-kev";

const provider = kevProvider({ baseURL: "http://127.0.0.1:8008" });
```

## Options

| Option        | Default        | Purpose                                        |
| ------------- | -------------- | ---------------------------------------------- |
| `baseURL`     | Required       | Root of the Kev server                         |
| `apiKey`      | `"kev-local"`  | Needed only when the server sets `KEV_API_KEY` |
| `model`       | `"kev-latest"` | Model sent with each request                   |
| `concurrency` | `1`            | Maximum simultaneous provider requests         |
| `timeoutMs`   | `60000`        | Request timeout in milliseconds                |
| `maxRetries`  | `0`            | SDK retry count                                |
| `fetch`       | Runtime fetch  | Custom fetch implementation                    |
