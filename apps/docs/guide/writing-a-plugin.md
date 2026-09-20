# Write a plugin

A plugin is a group of related rules. Each rule:

- chooses which parsed code might need checking
- can classify ambiguous possible candidates
- sends only the code needed for each question
- asks one fixed final question with named answers
- decides how strong an answer must be before reporting
- writes the warning shown to the user

The model answers the question and can classify bounded possible candidates during collection. It does
not search the source file or write the warning.

## Start with a narrow policy

Before writing code, write one sentence that separates a finding from a safe case. If the rule needs information the parser does not provide, add that information to the parser or report nothing. Do not guess by searching raw source text.

Choose something already available on `ParsedDocument`, such as a comment, function, test, error handler, or API boundary. If syntax or types alone can answer the question, use a normal linter or type checker instead.

## Define a rule factory

This rule checks TODO comments. It reports only when the answer is `vague` and both required scores are met:

```ts
import type { RuleFactory, SemanticRule } from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface RequireSpecificTodoOptions {
  threshold?: number;
  minConfidence?: number;
}

const boundedEvidence = (value: string | undefined): string | null =>
  value !== undefined && value.length <= 1_000 ? value : null;

const requireSpecificTodo: RuleFactory<RequireSpecificTodoOptions> = (
  options = {},
): SemanticRule => {
  const threshold = options.threshold ?? 0.85;
  const minConfidence = options.minConfidence ?? 0.7;

  for (const [name, value] of Object.entries({ threshold, minConfidence })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError(`${name} must be between 0 and 1 inclusive`);
    }
  }

  return {
    description: "TODO comments should identify concrete follow-up work.",

    collect(document) {
      return document.comments
        .filter((comment) => /\bTODO\b/iu.test(comment.value))
        .map((comment) => ({
          target: comment,
          state: {
            language: document.language,
            comment: boundedEvidence(comment.source),
            enclosingSource: boundedEvidence(comment.enclosingSource),
          },
          question: {
            type: "choice",
            instructions:
              "Does this TODO fail to identify concrete follow-up work or a removal condition? Choose insufficient_context when the bounded evidence does not establish the intended work.",
            criteria: {
              specific: "A maintainer can tell what must change or when this can be removed.",
              vague: "The TODO does not identify meaningful work or a removal condition.",
              insufficient_context: "The bounded evidence does not establish the intended work.",
            },
          },
        }));
    },

    diagnose(answer, candidate) {
      if (answer.type !== "choice" || answer.choice !== "vague") {
        return null;
      }

      const probability = answer.probabilities.vague ?? 0;
      if (
        !Number.isFinite(probability) ||
        !Number.isFinite(answer.confidence) ||
        probability < threshold ||
        answer.confidence < minConfidence
      ) {
        return null;
      }

      return {
        message: "Make this TODO identify the work or removal condition.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  };
};

export const todoPolicy = () =>
  definePlugin({
    rules: {
      "require-specific-todo": requireSpecificTodo,
    },
  });
```

### Choose possible candidates narrowly

`collect(document, context)` selects candidates from parsed facts. Keep source order, limit the amount
of code sent, and include only what the question needs. Use syntax and normalized parser facts when they
answer the classification exactly. When selecting a candidate requires a semantic judgment, collection
may use `context.provider.evaluate(target, request)` to classify a bounded list of possible targets
before returning the final candidates. The context exposes only the provider ID and evaluation method;
Scruple still enforces suppression and provider concurrency, and includes these requests and tokens in
run statistics. A suppressed target returns `null` without making a provider request.

Collection may therefore return either `RuleCandidate[]` or `Promise<RuleCandidate[]>`. The built-in
TODO rule, for example, asks the provider whether each non-directive comment marks future work rather
than relying on a regular expression. It then asks the separate, rule-specific question only for the
comments classified as TODOs.

A candidate contains:

- `target`: the parsed location where a warning may appear.
- `state`: JSON sent to the provider.
- `question`: one `noul`, `choice`, or `score` question.
- `data`: optional JSON kept locally for use when deciding whether to report.

### Allow “not enough information”

Add `insufficient_context` when the answer could depend on callers, helpers, middleware, types, configuration, or runtime behavior that the rule cannot see. Explain when to choose it in both the instructions and criteria. Reporting nothing is the correct result when the rule lacks enough information.

### Write the warning yourself

`diagnose(answer, candidate)` checks the answer and required scores. Return `null` when the code is safe, the answer is unclear or invalid, or a score is too low. The provider never writes warning text or fixes.

## Register the plugin

The `todoPolicy` factory groups related rules under stable kebab-case names. Do not put the consumer's namespace in the plugin.

The consumer chooses the namespace when registering the plugin. Register it inside `defineConfig` so TypeScript can check rule names and options:

```ts
import { defineConfig } from "@scruple/core";
import { todoPolicy } from "@acme/scruple-todos";

export default defineConfig({
  parser,
  provider,
  plugins: { todos: todoPolicy() },
  rules: {
    "todos/require-specific-todo": ["warn", { threshold: 0.9 }],
  },
});
```

Changing `todos` changes the namespace. The plugin does not hard-code it.

## Test the edge cases

Test candidate selection separately from reporting. Include cases near the line between safe and unsafe, not only cases where the rule obviously reports.

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { ChoiceAnswer } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

import { todoPolicy } from "../src/index.js";

const rule = todoPolicy().rules["require-specific-todo"]();
const document = oxcParser().parse("work.ts", "// TODO: fix later\nexport const ready = false;\n");
const candidate = rule.collect(document)[0];
assert.ok(candidate);

test("collects a bounded TODO candidate", () => {
  assert.equal(candidate.target.location.start.line, 1);
  assert.equal(JSON.stringify(candidate.state).length < 2_000, true);
});

test("reports only a calibrated vague decision", () => {
  const vague: ChoiceAnswer = {
    type: "choice",
    choice: "vague",
    confidence: 0.7,
    probabilities: { vague: 0.85 },
  };
  assert.equal(
    rule.diagnose(vague, candidate)?.message,
    "Make this TODO identify the work or removal condition.",
  );

  const belowThreshold: ChoiceAnswer = {
    ...vague,
    confidence: 0.99,
    probabilities: { vague: 0.849 },
  };
  assert.equal(rule.diagnose(belowThreshold, candidate), null);

  const insufficientContext: ChoiceAnswer = {
    type: "choice",
    choice: "insufficient_context",
    confidence: 0.99,
    probabilities: { insufficient_context: 0.99 },
  };
  assert.equal(rule.diagnose(insufficientContext, candidate), null);
});
```

Cover four parts:

1. **Selection tests** include relevant code, exclude unrelated code, preserve order, and limit request size.
2. **Decision tests** cover findings, safe answers, `insufficient_context`, exact score boundaries, and invalid answers.
3. **Integration tests** register the plugin and check the final rule ID, severity, location, and message.
4. **Evaluation fixtures** cover realistic findings, safe cases, and cases with too little information.

## Add evaluation fixtures

An evaluation fixture records what should happen without making live provider requests. For an
asynchronous collector, `collection_choices` replays the provider's collection answers in request order
so corpus validation exercises the same candidate path deterministically. These answers select
candidates; they are separate from `expected_choice`, which describes the final rule decision:

```json
{
  "collection_choices": ["todo"],
  "expected_choice": "vague"
}
```

This means the recorded collection answer keeps the possible target, then the recorded final answer
expects the selected TODO to be vague. Omit `collection_choices` for a synchronous collector. In a full
fixture, include a reason and tags so a failure explains more than a changed number:

```json
[
  {
    "id": "todo-is-vague",
    "filename": "work.ts",
    "source": "// TODO: fix later\nexport const ready = false;\n",
    "rule_id": "todos/require-specific-todo",
    "expected_finding": true,
    "expected_choice": "vague",
    "rationale": "The TODO identifies neither work nor a removal condition.",
    "tags": ["positive", "todo", "vague"]
  },
  {
    "id": "todo-has-removal-condition",
    "filename": "work.ts",
    "source": "// TODO: remove after the legacy v1 API is retired\nexport const adapter = legacyAdapter();\n",
    "rule_id": "todos/require-specific-todo",
    "expected_finding": false,
    "expected_choice": "specific",
    "rationale": "The TODO states a concrete removal condition.",
    "tags": ["negative", "todo", "specific"]
  },
  {
    "id": "todo-intent-is-hidden",
    "filename": "work.ts",
    "source": "// TODO: align this with the upstream lifecycle\nexport const ready = state();\n",
    "rule_id": "todos/require-specific-todo",
    "expected_finding": false,
    "expected_choice": "insufficient_context",
    "expected_abstention": true,
    "rationale": "The bounded file does not establish the upstream lifecycle or intended change.",
    "tags": ["negative", "todo", "insufficient-context"]
  }
]
```

For a plugin in this repository, add fixtures to `tests/eval-fixtures.json` and register the plugin in the evaluation plugin map. Other plugins can use the same fixture format in their own tests.

Pair each likely finding with a similar safe case and one with too little information. This catches a provider that reports every candidate.
