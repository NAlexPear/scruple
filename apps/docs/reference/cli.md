# CLI reference

## Usage

```text
scruple [patterns...] [options]
```

The optional `check` alias is retained for compatibility.

## Options

| Option                  | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `--cache-dir <path>`    | Set the decision cache directory                         |
| `-c, --config <path>`   | Use an explicit configuration file                       |
| `--explain`             | Include accepted and abstained decisions                 |
| `-f, --format <format>` | `stylish` or `json`; defaults to `stylish`               |
| `-h, --help`            | Print usage information                                  |
| `--no-cache`            | Run without reading or writing cached provider responses |

## File patterns

Positional patterns are globbed from the current working directory. Without positional patterns, the CLI uses `config.include` or the default `**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`.

Dependencies, `dist`, `build`, coverage output, and `.git` are always ignored. `config.ignore` adds more patterns.

## Decision cache

By default, the CLI stores successful provider responses in `node_modules/.cache/scruple`. Set
`config.cache` to another `DecisionCache` strategy for remote, multi-tier, or other storage, or to
`false` to disable caching. The key includes the provider ID and the complete request, so it covers
both collection classifications and final decisions. Changing the evidence, question, answer labels,
or provider ID produces a miss. Changing only a rule's warning threshold or message reuses the
existing answer.

Cache hits do not make provider requests or add tokens to the current run. JSON statistics report
`cacheHits` separately from `requests`. Invalid entries are discarded, and cache read or write failures
do not stop the check.

Use `--no-cache` when checking live provider behavior. Use `--cache-dir` to replace either the default
or configured strategy with a filesystem cache for that invocation. Delete the cache directory to
clear all saved decisions. Pin moving model aliases when results must remain tied to one model version.

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

`--format json` prints the complete run result, including diagnostics, operational errors, and statistics. Use it for CI integrations that need structured locations, probabilities, confidence, model IDs, cache hits, or token counts.

Add `--explain` to retain every **final candidate decision** in a `decisions` array, including safe
answers and `insufficient_context` abstentions that do not produce diagnostics. Collection
classifications are filtering steps and are not included. Without `--explain`, final answers that do
not diagnose are discarded to keep normal output small. Stylish explain output prints one compact line
per evaluated candidate.
