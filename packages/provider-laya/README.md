# @scruple/provider-laya

Local Laya decision provider for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/provider-laya
uv venv
uv pip install laya
```

```ts
import { layaProvider } from "@scruple/provider-laya";

const provider = layaProvider({
  model: "typed-decisions",
  python: ".venv/bin/python",
});
```

On Windows, use `python: ".venv\\Scripts\\python.exe"`.
