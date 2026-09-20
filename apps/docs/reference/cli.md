# CLI reference

## Usage

```text
scruple [patterns...] [options]
```

The optional `check` alias is retained for compatibility.

## Options

| Option                  | Description                                |
| ----------------------- | ------------------------------------------ |
| `-c, --config <path>`   | Use an explicit configuration file         |
| `--explain`             | Include accepted and abstained decisions   |
| `-f, --format <format>` | `stylish` or `json`; defaults to `stylish` |
| `-h, --help`            | Print usage information                    |

## File patterns

Positional patterns are globbed from the current working directory. Without positional patterns, the CLI uses `config.include` or the default `**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`.

Dependencies, `dist`, `build`, coverage output, and `.git` are always ignored. `config.ignore` adds more patterns.

## Configuration discovery

Without `--config`, Scruple checks these names in order:

1. `scruple.config.ts`
2. `scruple.config.mts`
3. `scruple.config.js`
4. `scruple.config.mjs`

## Exit codes

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| `0`  | No error-severity findings and no operational errors |
| `1`  | At least one error-severity finding                  |
| `2`  | Configuration, parsing, or provider failure          |

## JSON output

`--format json` prints the complete run result, including diagnostics, operational errors, and statistics. Use it for CI integrations that need structured locations, probabilities, confidence, model IDs, or token counts.

Add `--explain` to retain every **final candidate decision** in a `decisions` array, including safe
answers and `insufficient_context` abstentions that do not produce diagnostics. Collection
classifications are filtering steps and are not included. Without `--explain`, final answers that do
not diagnose are discarded to keep normal output small. Stylish explain output prints one compact line
per evaluated candidate.
