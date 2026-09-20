# Write a plugin

We will build a rule that checks TODO comments.

- `// TODO: fix later` is an obvious TODO and should warn.
- `// Revisit this later` is less obvious, but should also warn.
- `// to-do: remove after the v1 API is retired` should not warn.
- `// Return the user's to-do list` is not a TODO.

::: info The plan
Match obvious `TODO` comments first. Ask the model about the comments that do not match. Then check
whether each TODO says what to change or when to remove it.
:::

## 1. Set up two files

```text
scruple-todos/
├── src/index.ts
└── tests/index.test.ts
```

Install the package used to define the rule. Install the code reader used by the test:

```sh
pnpm add @scruple/core
pnpm add --save-dev @scruple/parser-oxc
```

::: tip At this point
The plugin will live in `src/index.ts`. Nothing else is needed to start the rule.
:::

## 2. Add the imports and settings

Create `src/index.ts`:

```ts{10-13} [src/index.ts]
import type {
  AsyncSemanticRule,
  ChoiceQuestion,
  CollectionContext,
  CommentTarget,
  ParsedDocument,
  RuleCandidate,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export interface RequireSpecificTodoOptions {
  threshold?: { warning: number; error: number };
  minConfidence?: number;
}
```

::: info What the settings mean
`threshold.warning` is the minimum probability for a warning, and `threshold.error` is the minimum
for an error. Both fields are required, the numeric form is not accepted, and `warning` cannot exceed
`error`. `minConfidence` must be met before either tier applies.
:::

## 3. Limit the text sent to the model

Add this helper:

```ts [src/index.ts]
const boundedText = (value: string | undefined, maxCharacters: number) => {
  if (value === undefined) {
    return { text: null, truncated: false };
  }
  return {
    text: value.slice(0, maxCharacters),
    truncated: value.length > maxCharacters,
  };
};
```

::: info Why keep `truncated`?
It tells the model when part of the text is missing.
:::

## 4. Match obvious TODOs

Start with the case that code can answer exactly:

```ts [src/index.ts]
const hasTodoMarker = (comment: CommentTarget): boolean =>
  /^(?:\s*\*?\s*)TODO\b/iu.test(comment.value);
```

::: info Why start with a regular expression?
`TODO` is an exact marker. Matching it in code is faster and avoids an unnecessary model request.
:::

This also matches lowercase `todo`. It deliberately does not guess whether `to-do` or “revisit this”
means future work.

## 5. Ask about the comments that remain

Give the model two possible answers:

```ts [src/index.ts]
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
This question only decides whether the comment should move to the next step.
:::

Now send one comment with that question:

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
      questions: { candidate_kind: todoClassification },
    },
    context.signal,
  );

  if (response === null) return false;

  const answer = response.answers["candidate_kind"];
  if (
    answer?.type !== "choice" ||
    (answer.choice !== "todo" && answer.choice !== "other")
  ) {
    throw new Error(`Provider ${context.provider.id} returned an invalid TODO answer`);
  }
  return answer.choice === "todo";
};
```

::: info What `null` means
Scruple returns `null` without sending a suppressed comment to the model.
:::

## 6. Ask whether the TODO is clear

The next helper builds the check that can produce a warning:

```ts{6-20} [src/index.ts]
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
      insufficient_context: "The answer is not clear from the available code.",
    },
  },
});
```

::: info What these fields do
`target` sets the warning location. `state` is the text sent to the model. `question` lists the allowed
answers.
:::

## 7. Combine the two filters

Add this function below `todoCandidate`:

```ts{9-22} [src/index.ts]
const collectTodos = async (
  document: ParsedDocument,
  context?: CollectionContext,
): Promise<RuleCandidate[]> => {
  if (context === undefined) {
    throw new Error("require-specific-todo must run through Scruple");
  }

  const comments = document.comments.filter((comment) => /\S/u.test(comment.value));
  const results = await Promise.all(
    comments.map(async (comment) => {
      if (hasTodoMarker(comment)) return comment;
      return (await isTodo(document, comment, context)) ? comment : null;
    }),
  );

  return results
    .filter((comment): comment is CommentTarget => comment !== null)
    .map((comment) => todoCandidate(document, comment));
};
```

::: info How the two filters work together
An obvious `TODO` skips the model. Comments such as `Revisit this later` and `to-do: remove this` reach
the model because their meaning depends on the words around them.
:::

## 8. Decide when to warn

Add the rule below `collectTodos`:

```ts{4-7,14-31} [src/index.ts]
const requireSpecificTodo = (
  options: RequireSpecificTodoOptions = {},
): AsyncSemanticRule => {
  const { threshold, minConfidence } = resolveDecisionOptions(options, {
    threshold: { warning: 0.85, error: 0.95 },
    minConfidence: 0.7,
  });

  return {
    description: "TODO comments should identify concrete follow-up work.",
    collect: collectTodos,

    diagnose(answer, candidate) {
      if (answer.type !== "choice" || answer.choice !== "vague") return null;

      const probability = answer.probabilities["vague"];
      if (
        probability === undefined ||
        !Number.isFinite(probability) ||
        probability < threshold.warning ||
        answer.confidence < minConfidence
      ) {
        return null;
      }

      return {
        message: "Make this TODO identify the work or removal condition.",
        severity: probability >= threshold.error ? "error" : "warning",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  };
};
```

::: info When the rule stays quiet
It returns `null` for clear TODOs, missing information, and weak answers. The provider must choose
`vague` and meet `minConfidence` before probability selects warning or error. The model never writes
the diagnostic.
:::

## 9. Export the plugin

Finish `src/index.ts`:

```ts [src/index.ts]
export const todoPolicy = () =>
  definePlugin({
    rules: {
      "require-specific-todo": requireSpecificTodo,
    },
  });
```

::: info Where the full rule name comes from
The plugin supplies `require-specific-todo`. The project adds `todos/` when it registers the plugin.
:::

## 10. Enable the rule

Add the plugin to `scruple.config.ts`:

```ts{7-10} [scruple.config.ts]
import { defineConfig } from "@scruple/core";
import { todoPolicy } from "@acme/scruple-todos";

export default defineConfig({
  parser,
  provider,
  plugins: { todos: todoPolicy() },
  rules: {
    "todos/require-specific-todo": [
      "warn",
      { threshold: { warning: 0.9, error: 0.97 } },
    ],
  },
});
```

::: tip At this point
Scruple can run the rule. `"warn"` caps its output at warning. `"error"` permits both probability tiers.
:::

## 11. Test both paths

Create `tests/index.test.ts`. The test supplies fixed answers, so it does not call a live model service:

```ts [tests/index.test.ts]
import assert from "node:assert/strict";
import test from "node:test";

import type { CollectionContext } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

import { todoPolicy } from "../src/index.js";

const rule = todoPolicy().rules["require-specific-todo"]();

const collectExample = async () => {
  const document = oxcParser().parse(
    "work.ts",
    "// TODO: fix later\n// Revisit this later.\n// Return the to-do list.\nexport const ready = false;\n",
  );
  const choices = ["todo", "other"][Symbol.iterator]();
  const commentsSentToModel: string[] = [];
  const context: CollectionContext = {
    provider: {
      id: "test",
      async evaluate(target) {
        commentsSentToModel.push(target.source);
        const next = choices.next();
        if (next.done) throw new Error("The test needs another recorded answer");
        const choice = next.value;
        return {
          model: "test",
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
  return {
    candidates: await rule.collect(document, context),
    commentsSentToModel,
  };
};

test("sends only unmatched comments to the model", async () => {
  const { commentsSentToModel } = await collectExample();
  assert.deepEqual(commentsSentToModel, ["// Revisit this later.", "// Return the to-do list."]);
});

test("keeps TODOs found by either filter", async () => {
  const { candidates } = await collectExample();
  const [obviousTodo, vagueTodo, ...rest] = candidates;
  assert.ok(obviousTodo);
  assert.ok(vagueTodo);
  assert.deepEqual(rest, []);
  assert.equal(obviousTodo.target.location.start.line, 1);
  assert.equal(vagueTodo.target.location.start.line, 2);
});

test("warns only for a strong vague answer", async () => {
  const { candidates } = await collectExample();
  const [candidate] = candidates;
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
  assert.equal(rule.diagnose({ ...vague, probabilities: { vague: 0.84 } }, candidate), null);
});
```

::: info What the tests cover
The first test checks what reaches the model. The second checks what becomes a TODO. The third checks
exactly when a warning appears.
:::

Before publishing, also test a clear TODO, a suppressed comment, and an
`insufficient_context` answer.

## Conclusion

The finished rule takes the cheapest reliable path first:

1. Match the exact `TODO` spelling in code.
2. Ask the model about comments the exact match missed.
3. Ask a separate question about whether the remaining work is clear.
4. Warn only when the answer is both `vague` and strong enough.

Use the same order for other rules: handle exact cases in code, use the model only when meaning matters,
and keep the warning decision in the rule.
