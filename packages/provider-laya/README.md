# @scruple/provider-laya

Local Laya decision provider for [Scruple](https://github.com/NAlexPear/scruple).

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
});
```

On Windows, use `python: ".venv\\Scripts\\python.exe"`.
