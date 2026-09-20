# Write your own plugin

A plugin packages related semantic rules behind one factory. Each rule owns the full policy: which normalized targets to review, what bounded evidence to send, the typed decision criteria, confidence thresholds, and the diagnostic shown to users.

This separation keeps provider output constrained and makes rule behavior testable.

## Start with a narrow policy

Write one sentence that distinguishes a finding from a safe case. If that distinction needs facts Scruple does not expose, improve the normalized parser contract or make the rule abstain. Do not substitute source-text guesses for missing evidence.

Choose a target already present on `ParsedDocument`, such as comments, functions, tests, error handlers, or API boundaries. Deterministic syntax and type errors belong in ordinary lint or type tooling rather than a semantic rule.

## Define a rule factory

The following rule reviews TODO comments and emits a stable diagnostic only for a calibrated `vague` decision:

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

### Keep collection deterministic

`collect(document)` should select candidates using normalized facts, not model judgment. Preserve source order, cap evidence size, and include only facts needed for this decision. A candidate contains:

- `target`: the normalized location that owns a possible diagnostic.
- `state`: JSON evidence shared with the provider.
- `question`: one `noul`, `choice`, or `score` question.
- `data`: optional JSON retained locally for deterministic diagnosis.

### Make ambiguity explicit

Choice questions should include `insufficient_context` whenever hidden callers, callees, middleware, types, configuration, or runtime behavior could change the answer. Say when to choose it in the instructions as well as the criteria. Abstention is part of correctness, not a failure to classify.

### Own the diagnostic

`diagnose(answer, candidate)` validates the answer and applies thresholds. Return `null` for safe, ambiguous, malformed, or below-threshold answers. Providers never generate diagnostic text or fixes.

## Register the plugin

The `todoPolicy` factory groups related rules under stable kebab-case names. Keep the factory independent of the namespace a consumer will choose.

The consumer chooses the namespace used in rule IDs. Register the factory inside `defineConfig` so TypeScript can infer valid namespaced IDs and option shapes:

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

## Test the policy boundary

Test collection separately from diagnosis. The important cases are not merely examples where the rule obviously reports. They are inputs where a plausible wrong policy would produce a different result.

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

Cover four layers of behavior:

1. **Selector tests** prove relevant targets are included, unrelated targets are excluded, ordering is stable, and evidence stays bounded.
2. **Decision tests** cover the finding, safe alternatives, `insufficient_context`, exact threshold boundaries, and malformed or unexpected answers.
3. **Integration tests** register the plugin and verify the final rule ID, severity, location, and stable message.
4. **Evaluation fixtures** exercise representative provider behavior across positive, negative, and ambiguous examples.

## Add evaluation fixtures

An evaluation fixture records the expected policy outcome independently of the provider. Include a rationale and tags so failures are reviewable rather than just numerical:

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

For a plugin maintained in this repository, add fixtures to `tests/eval-fixtures.json` and register the plugin in the evaluation plugin map. External plugins can use the same fixture shape in their own provider-backed evaluation harness.

Pair each likely finding with a nearby safe or ambiguous case. This tests the policy boundary instead of rewarding a provider that always reports.

## Package and document it

Compile the package to JavaScript, export the plugin factory and option types, and declare the supported `@scruple/core` range. A minimal package manifest looks like this:

```json
{
  "name": "@acme/scruple-todos",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "dependencies": {
    "@scruple/core": "^0.0.2"
  }
}
```

Document every exported rule, its defaults, its evidence boundary, and the cases where it deliberately abstains. Use the retained packages in `packages/` as reference implementations.
