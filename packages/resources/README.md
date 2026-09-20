# @scruple/resources

Semantic rules for function-local resource lifecycles and retry bounds, packaged as plugins for [Scruple](https://github.com/NAlexPear/scruple).

```sh
pnpm add --save-dev @scruple/resources
```

The rules only evaluate functions with explicit lifecycle or retry evidence. They abstain when cleanup ownership or retry bounds depend on contracts outside the available function and imports.

See the [Scruple documentation](https://github.com/NAlexPear/scruple#readme) for configuration and the current exported rules.
