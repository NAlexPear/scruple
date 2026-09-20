# Jev 1.13.0 benchmark from 2026-09-20

This directory preserves the data summarized in the Scruple benchmark documentation.

- Scruple commit: `02bd7b7eb055eb1b059b19961b767f37c767e0af`
- Base workload: the ten IDs in `benchmarks/fixtures.json`
- Sustained workload: 128 cases made by cycling the base workload in order
- Runs: two unmeasured warmups and twenty measured repetitions at each concurrency
- Client: Node.js 26.8.2 on Linux x64 with two logical Intel Xeon CPUs and 4,122,030,080 bytes of memory

`summary.json` contains the rounded values used by the docs. `raw/` contains the complete benchmark reports compressed with deterministic gzip settings.

## Raw report checksums

```text
aee5c6ca1a1114092edce99a2f745c6f502a6145257c27b087165f727082ab50  concurrency-10.json.gz
09136e64ebcb10713bf967e2476165fa00f9a26587f8b9c84fe5061a7347c498  concurrency-16.json.gz
d23169c9c3da2d374d17ad7804e5f720a3d8ed065ac98ea40447033cd1269afd  concurrency-32.json.gz
0c67e265d9d7e93698dadc65013fa05bb3a8c4e9fc714813490cc58166a65e03  concurrency-64.json.gz
5efa16b4a634f1ff0742ee2920f66c22a444f481edef2635b58376fac7743382  concurrency-128.json.gz
```
