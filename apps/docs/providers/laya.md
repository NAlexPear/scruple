# Laya provider

`@scruple/provider-laya` keeps one Python process and Laya router alive for a Scruple run.

```sh
pnpm add --save-dev @scruple/provider-laya
uv init --bare # Skip this if your project already has pyproject.toml
uv add laya
```

uv records Laya in `pyproject.toml` and creates or updates the project environment in `.venv`.

```ts
import { layaProvider } from "@scruple/provider-laya";

const provider = layaProvider({
  model: "typed-decisions",
  python: ".venv/bin/python",
  preload: true,
});
```

On Windows, use `python: ".venv\\Scripts\\python.exe"`.

## Options

| Option        | Default      | Purpose                                                 |
| ------------- | ------------ | ------------------------------------------------------- |
| `python`      | `"python3"`  | Python executable; set this to your uv environment      |
| `model`       | `"auto"`     | `auto`, `english`, `multilingual`, or `typed-decisions` |
| `device`      | Laya default | Device passed to the Laya router                        |
| `preload`     | `true`       | Preload models when the bridge starts                   |
| `concurrency` | `1`          | Maximum simultaneous provider requests                  |
| `timeoutMs`   | `30000`      | Per-request timeout in milliseconds                     |

`model: "auto"` lets Laya route by language. The provider shuts down its child process when the CLI run finishes.
