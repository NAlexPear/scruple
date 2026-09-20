# SonarQube Community Build benchmark

This benchmark runs SonarQube against the closest matching cases in Scruple's fixed benchmark workload. It does not claim that SonarQube can catch the same kind of issue when Community Build has no matching rule.

## Fixture scope

`fixture-map.json` records every ID in `benchmarks/fixtures.json` as:

- `native`: an out-of-box SonarQube rule tests the same defect in this exact fixture
- `custom`: a benchmark-owned custom rule tests the defect
- `unsupported`: SonarQube is not designed to reason about the case, or the case is a safe fixture for an unsupported rule

All ten fixtures are scanned so the workload has the same size as the other benchmark runs. The mapping currently has one native case, no custom cases, and nine unsupported cases. Unsupported cases remain excluded from accuracy and recall. Native coverage is `swallowed-empty-catch` with `javascript:S2486`, which targets ignored exceptions. S2486 intentionally exempts a catch when its try block has one statement, as this fixture does, so an absent issue is reported as a native-rule miss. `javascript:S108` is not used because its default configuration allows empty catches. `javascript:S5863` is not used because it handles Chai assertions with nonliteral duplicate arguments, not this fixture's Node `assert.equal(true, true)`. Findings from other SonarQube rules are retained as tool-reported findings but are not counted as matched findings.

Every sample reports the count and IDs for native and custom coverage, plus the count, IDs, and reasons for unsupported cases. Recall excludes unsupported cases. A `miss` is reserved for an applicable native or custom case whose enabled mapped rule did not report the expected issue.

## Run

Requirements are Docker Engine and network access to Docker Hub. SonarQube did not fit on the 4 GB machine used for the first attempt. The saved ten-file result was collected on a host with 32 GB of memory.

```sh
pnpm benchmark-sonarqube > sonarqube-benchmark.json
```

Options:

```sh
pnpm benchmark-sonarqube --warmups 1 --repetitions 2
```

The runner uses immutable image digests for SonarQube Community Build 26.9.0.129388 and the SonarScanner image containing CLI 8.1. It creates an isolated Docker network, an ephemeral H2-backed server intended only for this benchmark, and an ephemeral scanner cache. It changes the default administrator password and generates a temporary token. All containers, volumes, credentials, generated fixture files, and the network are removed afterward.

## Timing and reports

Image pull time, server startup and authentication setup, scanner version discovery, and warmup scans are setup costs. They are reported separately and excluded from measured samples. Warmup scans populate the scanner cache and perform initial project indexing.

Each measured sample reports:

- End-to-end wall time for scanner invocation plus report retrieval
- Scanner process wall time, exit code, signal, and errors
- Web API report retrieval time
- Every open issue returned by `/api/issues/search`
- Total findings and matched-rule findings per fixture

The scanner uses `sonar.qualitygate.wait=true`, so scanner time includes source analysis, upload, server Compute Engine processing, and quality gate polling. Container startup and Java startup for each scanner invocation are unavoidable parts of this reproducible Docker CLI workflow. Report retrieval is timed separately but included in end-to-end wall time.

The report also records server, scanner, Node.js, Docker, operating system, CPU, and memory versions. A fresh ephemeral server prevents findings from earlier runs from affecting results.

## Methodology sources

- [Install SonarQube Community Build from Docker](https://docs.sonarsource.com/sonarqube-community-build/server-installation/from-docker-image/set-up-and-start-container/)
- [SonarScanner CLI](https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/scanners/sonarscanner/)
- [SonarQube Web API](https://docs.sonarsource.com/sonarqube-community-build/extension-guide/web-api/)

The official Docker installation documentation permits embedded H2 for test purposes. The scanner documentation identifies the generic CLI as appropriate when there is no build-system-specific scanner, which applies to these standalone TypeScript fixtures.
