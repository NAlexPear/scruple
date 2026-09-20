# CodeQL CLI benchmark

This benchmark runs the official JavaScript and TypeScript CodeQL security-and-quality suite against the ten fixtures pinned by `benchmarks/fixtures.json`. It also runs one benchmark-owned custom query as a separate analysis. The output never combines official and custom query coverage.

The fixture map in `fixtures.json` records each source hash and classifies each case as:

- `native`: an enabled official query addresses the same broad defect or safe behavior
- `custom`: a benchmark-owned query detects one narrow syntax shape, without claiming semantic equivalence
- `unsupported`: CodeQL is not designed to detect the Scruple policy represented by the fixture

A native or custom case is `matched` when every measured repetition agrees with the fixture's expected finding. It is a `miss` when an applicable enabled query disagrees. A process failure is `error`, not a miss, and is also excluded from the accuracy denominator. Unsupported cases are reported with IDs and reasons but are excluded from native and custom accuracy denominators.

## Prerequisites

Install the [CodeQL CLI bundle](https://docs.github.com/en/code-security/codeql-cli/getting-started-with-the-codeql-cli/setting-up-the-codeql-cli) and put `codeql` on `PATH`, or pass its path with `--codeql`. The checked-in mapping pins `codeql/javascript-queries@2.4.5`, the query pack shipped for CodeQL CLI 2.27.0. Install it before an offline run:

```sh
codeql pack download codeql/javascript-queries@2.4.5
codeql pack install benchmarks/codeql/custom
```

The runner follows the official [`database create`](https://docs.github.com/en/code-security/codeql-cli/codeql-cli-manual/database-create) and [`database analyze`](https://docs.github.com/en/code-security/codeql-cli/codeql-cli-manual/database-analyze) commands. It uses build mode `none`, which is supported for JavaScript and TypeScript.

## Run

```sh
pnpm benchmark-codeql --codeql /path/to/codeql \
  --warmups 1 --repetitions 3 > codeql-benchmark.json
```

The runner creates one database and reports that duration separately. It then runs one unmeasured warmup and three measured analyses by default for each of these groups:

1. The official `javascript-security-and-quality.qls` suite
2. `custom/TautologicalAssertEqual.ql`

Each process records wall time, exit code, stderr, and any execution error. Every SARIF result is retained with its rule ID, fixture ID, message, path, and line. The report also records CodeQL, query pack, Node.js, operating system, architecture, and CPU information. Temporary source, database, and SARIF files are deleted after the JSON report is emitted.

Do not compare the custom query's result with full `tests/no-vacuous-tests` behavior. It only detects the exact `assert.equal(true, true)` fixture shape. Likewise, the user-controlled authorization fixture is only a closest official mapping. CodeQL may need framework and sensitive-action context that the bounded fixture intentionally omits.

The representative CodeQL CLI 2.27.0 run from 2026-09-20 is saved at `results/codeql-2.27.0/2026-09-20.json`. It uses one warmup and one measured repetition so both phases remain directly inspectable.
