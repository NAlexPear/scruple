# OpenAI gpt-6-luna full provider evaluation

This directory preserves one full 187-fixture Scruple evaluation using OpenAI's public-beta
Decisions API. The run used one repetition, concurrency 16, and the provider implementation already
on `origin/main`. No fixture was used for training, calibration, or tuning.

## Results

| Model      |  Label agreement | Diagnostic agreement | Strict agreement | TP / FP / TN / FN | Precision | Recall |     F1 |
| ---------- | ---------------: | -------------------: | ---------------: | ----------------: | --------: | -----: | -----: |
| gpt-6-luna | 145/187 (77.54%) |     151/187 (80.75%) | 123/187 (65.78%) | 51 / 6 / 100 / 30 |    89.47% | 62.96% | 73.91% |

The run recorded 15 expected abstentions, 26 actual abstentions, 9 correct abstentions, and 17
unexpected abstentions. All 187 fixture executions were valid. There were zero refusals, API errors,
malformed responses, or other case-level operational errors. Exit code 1 records quality mismatches,
not an operational failure.

OpenAI resolved every request-bearing case to `gpt-6-luna`. Seven fixtures produced no final
candidate and therefore made no request; their raw case records retain the provider fallback ID
`openai:gpt-6-luna`. Nine collection-sensitive fixtures made two calls each, producing 189 total
model calls across 180 request-bearing cases.

|  Mean / p50 / p95 case latency | Command wall time |     Throughput | Input / output tokens | Exact API cost |
| -----------------------------: | ----------------: | -------------: | --------------------: | -------------: |
| 195.362 / 155.891 / 427.761 ms |            2.80 s | 66.786 cases/s |            81,836 / 0 |     $0.0081836 |

Case latency is the harness's per-case elapsed time and overlaps at concurrency 16. Throughput is
187 fixtures divided by the measured command wall time and includes local harness overhead. The
Decisions API reported zero output tokens. At the documented standard Decisions price of $0.10 per
million input tokens and no output-token charge, cost is exactly
`81,836 × $0.10 / 1,000,000 = $0.0081836`. No regional-processing option or long-context request was
used.

## Reproduction and identity

- Scruple base: `2fc48be1f99fb17680cf0bd87f643d83539b50db`, plus the eval-only patch in
  `provenance/eval-harness.patch` (SHA-256
  `867035d54431213d5fd51f9c171738d46df4b0b8c3567ea73cbef4b30a72d993`).
- Fixture corpus SHA-256:
  `71e174d510cf3bf4ab92005a1f8ec493bce5697548380126f8331bdec5e3bf24`.
- Runtime: Linux 6.1.158+ x86_64, Node v26.10.0, pnpm 12.0.0, TypeScript 7.0.2.
- Exact command: `node packages/eval/dist/cli.js --provider openai --model gpt-6-luna
--repetitions 1 --concurrency 16 --format json`.

`summary.json` contains the exact machine-readable metrics and methodology. The deterministic
gzip-compressed full report is under `raw/`. `provenance/` preserves the command, timing, exit code,
empty stderr, source and fixture checksums, pricing basis, base commit, and eval harness patch.
`SHA256SUMS` covers every preserved file.
