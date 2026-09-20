# Direct hosted LLM benchmark

This benchmark compares the pinned Scruple benchmark tasks with a general-purpose hosted LLM. It is not a Scruple provider benchmark and it is not a broad repository review.

The harness uses OpenAI `gpt-4.1-2025-04-14`. OpenAI documents this exact snapshot as a general-purpose GPT-4.1 model with Responses API and structured output support. OpenAI was selected because `OPENAI_API_KEY` was the only usable mainstream provider credential present in the run environment. The key value was not printed.

Official references:

- [GPT-4.1 model](https://developers.openai.com/api/docs/models/gpt-4.1)
- [Responses API create method](https://developers.openai.com/api/reference/resources/responses/methods/create)

## Method

The workload uses the same ten IDs as the Jev benchmark in `fixtures.json`. For each fixture, Scruple's parser and rule collector produce the bounded evidence and choice question. The direct harness sends only that evidence and question to OpenAI. It does not call Scruple's decision provider, diagnosis logic, or scan other repository files.

`llm-task-manifest.json` pins a SHA-256 hash of every task's fixture ID, rule ID, expected choice, expected finding status, bounded evidence, instructions, and criteria. The run stops if any task drifts.

The system prompt is versioned and included with its SHA-256 hash in every report. Requests use the pinned model snapshot, the Responses API, strict JSON Schema output, no storage, and temperature 0. The API does not offer a seed on this endpoint, so repetitions remain necessary. Each answer must contain one allowed choice and a nonempty rationale.

Reports use the owner's comparison taxonomy:

- `detected/correct`: the structured choice exactly matches the fixture expectation, including a correct safe choice or expected abstention.
- `applicable miss`: the model returns the wrong choice, or an API or parsing error prevents a correct answer.
- `unsupported capability`: a real provider API or modality limitation prevents evaluation. Every unsupported case must record a reason.

Unsupported cases are excluded from correctness and recall denominators. Bad answers are not unsupported. All current tasks are text and structured-choice tasks supported by this API, so no current fixture is marked unsupported.

The machine-readable report includes category counts, correctness, recall over expected findings, abstentions, latency mean/p50/p95, throughput, token usage, operational errors, runtime environment, and repetition settings. This ten-task workload is intentionally small. Its result measures these pinned cases, not general code-review ability.

## Run

```sh
OPENAI_API_KEY=your-key pnpm benchmark-llm \
  --repetitions 3 \
  --warmups 1 \
  --concurrency 1 \
  > openai-report.json
```

Progress goes to standard error. Standard output contains only JSON.
