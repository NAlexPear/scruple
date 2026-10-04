# Multilanguage provider evaluation from 2026-10-04

This run extends Scruple's provider corpus from 187 to 195 fixtures. The eight new fixtures use the
real Python, Go, Rust, and SQL parsers, with one vague and one actionable TODO comment per language.
They exercise portable normalized comment evidence without claiming that code semantics transfer
between languages.

## Configuration

- Scruple commit: `c4c6960b107ffb207087dc4579dbea0b0c1fa195`
- Providers: Jev 1.13.0 and Cloudflare Clef
- Evaluation: one repetition; concurrency 64 for Jev and 4 for Clef
- Corpus: 195 fixtures, including eight real-parser multilingual cases
- Rule: `comments/require-actionable-todos`, with unchanged warning probability and confidence
  thresholds of 0.8 and 0.7

Commands:

```sh
node packages/eval/dist/cli.js --provider jev --model jev-1.13.0 --repetitions 1 --format json
node packages/eval/dist/cli.js --provider cloudflare --model clef --repetitions 1 --format json
```

## Results

| Provider | Full-corpus strict | Full-corpus label | Full-corpus diagnostic | New cases strict | New cases label |
| -------- | -----------------: | ----------------: | ---------------------: | ---------------: | --------------: |
| Jev 1.13 |   156/195 (80.00%) |  168/195 (86.15%) |       179/195 (91.79%) |    8/8 (100.00%) |   8/8 (100.00%) |
| Clef     |   124/195 (63.59%) |  173/195 (88.72%) |       143/195 (73.33%) |     5/8 (62.50%) |   8/8 (100.00%) |

Jev matched the label and thresholded diagnostic behavior for all eight new cases. Clef selected the
expected label for all eight. Its vague Python, Go, and Rust cases did not become diagnostics because
confidence was below the rule's 0.7 minimum; the SQL vague case cleared it. This is expected engine
calibration behavior, not a parser or provider error.

Both runs parsed all 195 fixtures, matched every expected candidate count, and had zero operational
errors. Each new TODO case made one collection-classification request and one final decision request.
The commands returned status 1 because strict fixture mismatches are represented as evaluation
failures.

## Artifacts

- `summary.json`: compact metrics and multilingual totals
- `raw/jev-1.13.0.json.gz`: complete Jev per-case report
- `raw/clef.json.gz`: complete Clef per-case report
- `SHA256SUMS`: checksums for the preserved artifacts
