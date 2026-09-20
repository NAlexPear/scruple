# Write a plugin

This tutorial builds one small plugin from start to finish. Its rule finds comments that mean
“future work,” then reports the ones that do not say what work remains.

- `// TODO: fix later` → `todo` → `vague` → **warning**
- `// to-do: remove after the v1 API is retired` → `todo` → `specific` → no warning
- `// Return the user's to-do list.` → `other` → no final question

::: info Two questions, two jobs
The collection question asks whether a comment is a TODO. The final question asks whether that TODO
is actionable. Keeping those questions separate prevents ordinary prose from becoming a warning.
:::

The built-in comments plugin already provides a production TODO rule. This tutorial uses the same
shape so you can see how a semantic collector is assembled.

## 1. Create the package

Start with one source file and one test file:

```text
scruple-todos/
├── src/
│   └── index.ts
└── tests/
    └── index.test.ts
```

Install the rule API. Install the OXC parser only for the test:

```sh
pnpm add @scruple/core
pnpm add --save-dev @scruple/parser-oxc
```

::: tip Checkpoint
The plugin owns rules. The application that runs Scruple owns the parser and decision provider.
:::

## 2. Define the plugin's public shape

Create `src/index.ts` with the imports, options, and plugin type:

```ts{12-20} [src/index.ts]
import type {
  AsyncSemanticRule,
  ChoiceQuestion,
  CollectionContext,
  CommentTarget,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export interface RequireSpecificTodoOptions {
  threshold?: number;
  minConfidence?: number;
}

type TodoPlugin = ScruplePlugin<{
  "require-specific-todo": RuleFactory<RequireSpecificTodoOptions, AsyncSemanticRule>;
}>;
```

::: info Why these types?
`RuleFactory` accepts user options and creates one rule. `AsyncSemanticRule` allows collection to ask
the provider a classification question.
:::

## 3. Bound the evidence

Every provider request should have a predictable maximum size. Add this helper below the types:

```ts{1-7} [src/index.ts]
const boundedText = (value: string | undefined, maxCharacters: number) => {
  const text = value ?? "";
  return {
    text: text.slice(0, maxCharacters),
    truncated: text.length > maxCharacters,
  };
};
```

::: info Why include `truncated`?
The provider can distinguish complete evidence from a clipped excerpt instead of assuming nothing was
omitted.
:::

## 4. Define the collection question

Give the provider two named answers. Add this constant below `boundedText`:

```ts{1-9} [src/index.ts]
const todoClassification: ChoiceQuestion = {
  type: "choice",
  instructions: "Does this comment mark future work?",
  criteria: {
    todo: "A future task or revisit condition.",
    other: "Current behavior, not future work.",
  },
};
```

::: info Why only two answers?
Collection has one job: keep or discard the possible target. Whether the TODO is actionable belongs to
the final question.
:::

## 5. Classify one possible TODO

The parser has already found the comment. Send its bounded text with the collection question:

```ts{6-18,22-30} [src/index.ts]
const isTodo = async (
  document: ParsedDocument,
  comment: CommentTarget,
  context: CollectionContext,
): Promise<boolean> => {
  const response = await context.provider.evaluate(
    comment,
    {
      state: {
        language: document.language,
        comment: boundedText(comment.source, 2_000),
      },
      questions: {
        candidate_kind: todoClassification,
      },
    },
    context.signal,
  );

  if (response === null) return false;

  const answer = response.answers["candidate_kind"];
  if (
    answer?.type !== "choice" ||
    (answer.choice !== "todo" && answer.choice !== "other")
  ) {
    throw new Error(`Provider ${context.provider.id} returned an invalid TODO classification`);
  }
  return answer.choice === "todo";
};
```

::: info What the engine still controls
`context.provider` is target-aware. Scruple skips suppressed targets and still applies cancellation,
concurrency limits, request counting, and token accounting.
:::

## 6. Build the final candidate

A comment classified as `todo` becomes a candidate. Add a helper that supplies the bounded evidence
and the final question:

```ts{7-28} [src/index.ts]
const todoCandidate = (
  document: ParsedDocument,
  comment: CommentTarget,
): RuleCandidate => ({
  target: comment,
  state: {
    language: document.language,
    comment: boundedText(comment.source, 2_000),
    enclosing_source: boundedText(comment.enclosingSource, 1_000),
  },
  question: {
    type: "choice",
    instructions: "Is the remaining work or removal condition clear?",
    criteria: {
      specific: "The work or removal condition is clear.",
      vague: "No meaningful work or removal condition is identified.",
      insufficient_context: "The intended work cannot be determined from this evidence.",
    },
  },
});
```

::: info Candidate anatomy
`target` sets the warning location. `state` is provider evidence. `question` fixes the only answers the
provider may return.
:::

## 7. Collect the candidates

Now connect the two helpers. Add this function below `todoCandidate`:

```ts{5-20} [src/index.ts]
const collectTodos = async (
  document: ParsedDocument,
  context?: CollectionContext,
): Promise<RuleCandidate[]> => {
  if (context === undefined) {
    throw new Error("require-specific-todo must be collected through the Scruple engine");
  }

  const possible = document.comments.filter((comment) => comment.value.trim().length > 0);
  const classified = await Promise.all(
    possible.map(async (comment) =>
      (await isTodo(document, comment, context)) ? comment : null,
    ),
  );

  return classified
    .filter((comment): comment is CommentTarget => comment !== null)
    .map((comment) => todoCandidate(document, comment));
};
```

::: info Why start from all non-empty comments?
That bounded set includes `TODO`, `todo`, `to-do`, and project-specific wording. The classifier—not a
spelling list—decides which ones mean future work.
:::

## 8. Decide when to report

The rule factory sets its thresholds and owns the warning text. Add it below `collectTodos`:

```ts{5-10,14-39} [src/index.ts]
const requireSpecificTodo: RuleFactory<RequireSpecificTodoOptions, AsyncSemanticRule> = (
  options = {},
) => {
  const { threshold, minConfidence } = resolveDecisionOptions(options, {
    threshold: 0.85,
    minConfidence: 0.7,
  });

  return {
    description: "TODO comments should identify concrete follow-up work.",
    collect: collectTodos,

    diagnose(answer, candidate) {
      if (answer.type !== "choice" || answer.choice !== "vague") {
        return null;
      }

      const probability = answer.probabilities["vague"] ?? 0;
      if (probability < threshold || answer.confidence < minConfidence) {
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
```

::: info Reporting belongs to the rule
The provider selects a named answer. Only `diagnose` decides whether that answer is strong enough to
become a warning, and only the rule writes the message.
:::

`specific`, `insufficient_context`, low probability, and low confidence all return `null`. A rule that
cannot support a warning should stay quiet.

## 9. Export the plugin

Finish `src/index.ts` by registering the factory under a stable rule name:

```ts{1-7} [src/index.ts]
export const todoPolicy = (): TodoPlugin =>
  definePlugin({
    rules: {
      "require-specific-todo": requireSpecificTodo,
    },
  });
```

::: info Plugin name versus rule ID
The plugin owns `require-specific-todo`. The consuming project chooses the namespace that turns it into
a full rule ID such as `todos/require-specific-todo`.
:::

## 10. Enable the rule

Register the plugin in the consuming project's `scruple.config.ts`:

```ts{7-10} [scruple.config.ts]
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

::: tip Checkpoint
Changing the key `todos` changes the namespace. The plugin itself does not hard-code a consumer's
namespace or severity.
:::

## 11. Test collection and reporting separately

Create `tests/index.test.ts`. The fake collection provider returns recorded labels, so this unit test
does not make network requests:

```ts [tests/index.test.ts]
import assert from "node:assert/strict";
import test from "node:test";

import type { CollectionContext } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

import { todoPolicy } from "../src/index.js";

const rule = todoPolicy().rules["require-specific-todo"]();

const collectFixture = async () => {
  const document = oxcParser().parse(
    "work.ts",
    "// to-do: fix later\n// Return the to-do list sorted by name.\nexport const ready = false;\n",
  );
  const choices = ["todo", "other"] as const;
  let nextChoice = 0;
  const context: CollectionContext = {
    provider: {
      id: "fixture",
      async evaluate() {
        const choice = choices[nextChoice++];
        assert.ok(choice);
        return {
          model: "fixture",
          answers: {
            candidate_kind: {
              type: "choice",
              choice,
              confidence: 1,
              probabilities: { [choice]: 1 },
            },
          },
        };
      },
    },
  };
  return rule.collect(document, context);
};

test("keeps only comments classified as TODOs", async () => {
  const candidates = await collectFixture();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.target.location.start.line, 1);
});

test("reports only a calibrated vague answer", async () => {
  const [candidate] = await collectFixture();
  assert.ok(candidate);

  const vague = {
    type: "choice" as const,
    choice: "vague",
    confidence: 0.7,
    probabilities: { vague: 0.85 },
  };
  assert.equal(
    rule.diagnose(vague, candidate)?.message,
    "Make this TODO identify the work or removal condition.",
  );

  assert.equal(rule.diagnose({ ...vague, probabilities: { vague: 0.849 } }, candidate), null);
  assert.equal(
    rule.diagnose(
      {
        type: "choice",
        choice: "insufficient_context",
        confidence: 1,
        probabilities: { insufficient_context: 1 },
      },
      candidate,
    ),
    null,
  );
});
```

::: info What these tests prove
The first test protects candidate selection. The second protects the reporting threshold and the
abstention path. A provider can change without changing either contract.
:::

Also add an integration test that runs Scruple and checks the final rule ID, severity, location, and
message. That catches registration and configuration mistakes that unit tests cannot see.

## 12. Add evaluation cases

Evaluation cases record the expected collection label separately from the expected final answer:

```json [eval-fixtures.json]
{
  "id": "todo-is-vague",
  "filename": "work.ts",
  "source": "// to-do: fix later\nexport const ready = false;\n",
  "rule_id": "todos/require-specific-todo",
  "collection_choices": ["todo"],
  "expected_finding": true,
  "expected_choice": "vague",
  "rationale": "The marker identifies neither work nor a removal condition.",
  "tags": ["positive", "todo", "vague"]
}
```

::: info Read the fixture in order
`collection_choices` keeps the comment as a candidate. `expected_choice` then checks the separate
actionability decision.
:::

Pair that finding with:

- a specific TODO that expects `specific`;
- ordinary “to-do list” prose that expects collection choice `other` and zero candidates;
- a TODO whose intent is hidden that expects `insufficient_context`.

For a plugin in this repository, put those cases in `tests/eval-fixtures.json` and register the plugin
in the evaluation plugin map.

## Before publishing

- Keep possible targets bounded and preserve source order.
- Include truncation metadata with clipped evidence.
- Use named safe and `insufficient_context` answers.
- Keep warning text and thresholds in the rule.
- Test selection, reporting, integration, and realistic evaluation cases.
