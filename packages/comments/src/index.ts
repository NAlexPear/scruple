import type {
  AsyncSemanticRule,
  CollectionContext,
  CommentTarget,
  DecisionRuleOptions,
  DecisionThreshold,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions, resolveDiagnosticSeverity } from "@scruple/core";

export type ProbabilityRuleOptions = DecisionRuleOptions;

export type NoUselessCommentsOptions = ProbabilityRuleOptions;

const maxConcurrentTodoClassifications = 16;

export interface PreferConciseCommentsOptions extends ProbabilityRuleOptions {
  minCharacters?: number;
}

export type CommentsPlugin = ScruplePlugin<{
  "no-useless-comments": RuleFactory<NoUselessCommentsOptions>;
  "no-misleading-comments": RuleFactory<ProbabilityRuleOptions>;
  "no-commented-out-code": RuleFactory<ProbabilityRuleOptions>;
  "no-change-history-comments": RuleFactory<ProbabilityRuleOptions>;
  "prefer-concise-comments": RuleFactory<PreferConciseCommentsOptions>;
  "require-actionable-todos": RuleFactory<ProbabilityRuleOptions, AsyncSemanticRule>;
  "require-justified-suppressions": RuleFactory<ProbabilityRuleOptions>;
  "require-actionable-deprecations": RuleFactory<ProbabilityRuleOptions>;
}>;

export const comments = (): CommentsPlugin => {
  return definePlugin({
    rules: {
      "no-useless-comments": noUselessComments,
      "no-misleading-comments": noMisleadingComments,
      "no-commented-out-code": noCommentedOutCode,
      "no-change-history-comments": noChangeHistoryComments,
      "prefer-concise-comments": preferConciseComments,
      "require-actionable-todos": requireActionableTodos,
      "require-justified-suppressions": requireJustifiedSuppressions,
      "require-actionable-deprecations": requireActionableDeprecations,
    },
  });
};

const noUselessComments = (options: NoUselessCommentsOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.9, error: 0.97 },
    0.7,
  );
  return choiceRule({
    description: "Comments should add information that the code does not already express.",
    select: ordinaryComments,
    question: {
      instructions:
        "Does `comment` add no maintainability value because it merely restates obvious code, uses generic section-heading prose, narrates a straightforward next step, or contains AI-assistant meta commentary? Distinguish genuinely useful rationale from comments owned by another rule. Choose insufficient_context when the bounded evidence does not establish whether the comment adds information.",
      criteria: {
        redundant:
          "The comment adds no useful rationale, constraint, warning, domain knowledge, or non-obvious explanation.",
        useful:
          "The comment adds current rationale, a constraint, a warning, domain knowledge, or another non-obvious explanation.",
        belongs_to_other_rule:
          "The comment's primary issue is that it is misleading, disabled code, change history, a deprecation, or another concern owned by a more specific rule.",
        insufficient_context:
          "The bounded evidence does not establish whether the comment adds information beyond the code.",
      },
    },
    finding: "redundant",
    threshold,
    minConfidence,
    message: "This comment appears to add no useful information.",
  });
};

const noMisleadingComments = (options: ProbabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.85, error: 0.95 },
    0.7,
  );
  return choiceRule({
    description: "Comments should accurately describe the code they accompany.",
    select: reviewableComments,
    question: {
      instructions:
        "Does `comment` materially contradict the visible current code? Judge concrete claims about behavior, conditions, units, validation, side effects, and returned values. Do not call a clearly historical note misleading merely because it discusses prior code.",
      criteria: {
        accurate: "The comment is consistent with the visible code and its current behavior.",
        misleading:
          "The comment makes a concrete claim that the visible code contradicts or no longer implements.",
        insufficient_context:
          "The claim depends on behavior not established by the available context.",
      },
    },
    finding: "misleading",
    threshold,
    minConfidence,
    message: "This comment appears to contradict the code it describes.",
  });
};

const noCommentedOutCode = (options: ProbabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.95, error: 0.99 },
    0.7,
  );
  return choiceRule({
    description: "Comments should not preserve disabled implementation code.",
    select: reviewableComments,
    question: {
      instructions:
        "Is `comment` disabled executable implementation code that belongs in version control rather than the source file? Distinguish disabled code from documentation examples, pseudocode, grammars, regular expressions, and configuration snippets.",
      criteria: {
        disabled_code:
          "The comment is code that could plausibly be uncommented and executed as part of this implementation.",
        documentation_example: "The code-like text demonstrates an API, format, or expected usage.",
        pseudocode_or_data:
          "The text is explanatory pseudocode, a grammar, a pattern, or data/configuration.",
        prose: "The comment is ordinary prose rather than disabled code.",
        insufficient_context: "The available context does not establish the comment's purpose.",
      },
    },
    finding: "disabled_code",
    threshold,
    minConfidence,
    message: "Remove this commented-out code; version control already preserves it.",
  });
};

const noChangeHistoryComments = (options: ProbabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.95, error: 0.99 },
    0.7,
  );
  return choiceRule({
    description:
      "Comments should explain current constraints instead of narrating completed changes.",
    select: (document) =>
      ordinaryComments(document).filter((comment) => isChangeHistoryCandidate(comment)),
    question: {
      instructions:
        "Does `comment` primarily record what the implementation previously did or narrate a completed change? Version control owns completed change history. Preserve comments that explain a current constraint, active compatibility behavior, or a still-relevant reason not to restore an old approach.",
      criteria: {
        obsolete_history:
          "The comment is changelog narration about removed or replaced code and is not needed to understand current behavior.",
        current_rationale:
          "Historical context explains a constraint or decision that still governs the current code.",
        active_compatibility:
          "The comment documents compatibility or migration behavior that is still active.",
        not_history: "The comment does not describe a completed code change.",
        insufficient_context:
          "The available context does not show whether the history remains relevant.",
      },
    },
    finding: "obsolete_history",
    threshold,
    minConfidence,
    message: "Describe the current constraint instead of recording change history in this comment.",
  });
};

const preferConciseComments = (options: PreferConciseCommentsOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.9, error: 0.97 },
    0.65,
  );
  const minCharacters = options.minCharacters ?? 100;
  if (!Number.isSafeInteger(minCharacters) || minCharacters < 0) {
    throw new TypeError("minCharacters must be a non-negative integer");
  }
  return choiceRule({
    description: "Comments should express useful information without unnecessary prose.",
    select: (document) =>
      ordinaryComments(document).filter((comment) => comment.value.trim().length >= minCharacters),
    question: {
      instructions:
        "Could `comment` be substantially shorter while preserving all useful rationale, constraints, warnings, and domain information? Identify repetition, filler, excessive framing, hedging, and LLM-style summaries. Length alone is not a problem: allow detail required for complex invariants, procedures, public API documentation, security warnings, and legal text.",
      criteria: {
        concise: "The comment is already proportionate to the useful information it conveys.",
        unnecessarily_verbose:
          "The comment contains useful information but uses substantially more prose than needed to preserve it.",
        complexity_justified: "The detail is warranted by the complexity or risk of the subject.",
        insufficient_context: "The available context does not show which details are necessary.",
      },
    },
    finding: "unnecessarily_verbose",
    threshold,
    minConfidence,
    message: "Make this comment more concise while preserving its useful information.",
  });
};

const requireActionableTodos = (options: ProbabilityRuleOptions = {}): AsyncSemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.8, error: 0.95 },
    0.7,
  );
  return asyncChoiceRule({
    description: "TODO comments should give a maintainer enough context to act.",
    select: classifyTodoComments,
    question: {
      instructions:
        "Does this TODO, FIXME, or HACK give a future maintainer enough context to act? Useful context can state what remains, why it is deferred, the condition for removal, or a relevant issue. Do not require an owner, date, or ticket when the action is otherwise clear.",
      criteria: {
        actionable:
          "The comment identifies concrete future work or a clear condition and provides enough context to proceed.",
        unactionable:
          "The marker is vague, context-free, or does not identify meaningful follow-up work.",
        insufficient_context:
          "The surrounding code may make the intended action clear, but it cannot be determined.",
      },
    },
    finding: "unactionable",
    threshold,
    minConfidence,
    message: "Make this TODO actionable by stating the work, reason, or removal condition.",
  });
};

const requireJustifiedSuppressions = (options: ProbabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.85, error: 0.95 },
    0.7,
  );
  return choiceRule({
    description: "Suppression directives should state a concrete, code-specific reason.",
    select: (document) => document.comments.filter(isSuppressionCandidate),
    question: {
      instructions:
        "Does this suppression directive lack a concrete, code-specific justification or use broader scope than its stated reason supports? A justification should explain why suppression is necessary here, not merely say TODO, legacy, false positive, or repeat the directive. Do not require an issue link. Treat clearly generated code and deliberate negative type-test fixtures separately. Choose insufficient_context when the affected code or suppression scope is not visible in the bounded evidence.",
      criteria: {
        justified_suppression:
          "The comment gives a concrete reason specific to the affected code, and the visible scope is no broader than that reason supports.",
        unjustified_suppression:
          "The reason is missing, vague, tautological, or does not justify the visible breadth of the suppression.",
        generated_or_test_fixture:
          "The suppression is part of clearly generated code or a deliberate negative type-test fixture.",
        insufficient_context:
          "The bounded evidence does not show enough of the affected code, directive scope, or claimed constraint to judge the justification.",
      },
    },
    finding: "unjustified_suppression",
    threshold,
    minConfidence,
    message: "Explain why this suppression is necessary and keep its scope as narrow as possible.",
  });
};

const requireActionableDeprecations = (options: ProbabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(
    options,
    { warning: 0.85, error: 0.95 },
    0.7,
  );
  return choiceRule({
    description: "Deprecation comments should give consumers clear migration guidance.",
    select: (document) => document.comments.filter(isDeprecationCandidate),
    question: {
      instructions:
        "Does this `@deprecated` comment fail to tell consumers how to migrate? Accept a named replacement, concrete migration steps, or an explicit statement that no replacement exists with a useful reason or required action. Do not assume a referenced symbol exists when the bounded evidence cannot establish it; choose insufficient_context when association with the deprecated declaration or the guidance itself is unclear.",
      criteria: {
        actionable_replacement:
          "The deprecation gives a named alternative or concrete steps that a consumer can follow.",
        justified_no_replacement:
          "The deprecation clearly says no replacement exists and explains the reason or required consumer action.",
        unactionable_deprecation:
          "The comment only says deprecated, old, or do not use, without usable migration guidance.",
        insufficient_context:
          "The bounded evidence does not establish the associated declaration or whether the stated guidance is usable.",
      },
    },
    finding: "unactionable_deprecation",
    threshold,
    minConfidence,
    message: "Add a replacement, migration steps, or a clear reason that no replacement exists.",
  });
};

interface ChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): CommentTarget[];
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  finding: string;
  threshold: DecisionThreshold;
  minConfidence: number;
  message: string;
}

interface AsyncChoiceRuleDefinition extends Omit<ChoiceRuleDefinition, "select"> {
  select(document: ParsedDocument, context?: CollectionContext): Promise<CommentTarget[]>;
}

const choiceRule = (definition: ChoiceRuleDefinition): SemanticRule => {
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map((comment) => ({
        target: comment,
        state: commentState(comment, document),
        question: {
          type: "choice",
          instructions: definition.question.instructions,
          criteria: definition.question.criteria,
        },
      }));
    },
    diagnose(answer, candidate) {
      if (answer.type !== "choice" || answer.choice !== definition.finding) {
        return null;
      }
      const probability = answer.probabilities[definition.finding] ?? 0;
      const severity = resolveDiagnosticSeverity(probability, answer.confidence, definition);
      if (severity === null) {
        return null;
      }
      return diagnostic(candidate, definition.message, {
        probability,
        confidence: answer.confidence,
        severity,
      });
    },
  };
};

const asyncChoiceRule = (definition: AsyncChoiceRuleDefinition): AsyncSemanticRule => {
  return {
    description: definition.description,
    async collect(document, context) {
      const selectedComments = await definition.select(document, context);
      return selectedComments.map((comment) => commentCandidate(comment, document, definition));
    },
    diagnose(answer, candidate) {
      if (answer.type !== "choice" || answer.choice !== definition.finding) {
        return null;
      }
      const probability = answer.probabilities[definition.finding] ?? 0;
      const severity = resolveDiagnosticSeverity(probability, answer.confidence, definition);
      if (severity === null) {
        return null;
      }
      return diagnostic(candidate, definition.message, {
        probability,
        confidence: answer.confidence,
        severity,
      });
    },
  };
};

const commentCandidate = (
  comment: CommentTarget,
  document: ParsedDocument,
  definition: ChoiceRuleDefinition | AsyncChoiceRuleDefinition,
): RuleCandidate => ({
  target: comment,
  state: commentState(comment, document),
  question: {
    type: "choice",
    instructions: definition.question.instructions,
    criteria: definition.question.criteria,
  },
});

const classifyTodoComments = async (
  document: ParsedDocument,
  context?: CollectionContext,
): Promise<CommentTarget[]> => {
  if (context === undefined) {
    return document.comments.filter(isTodoCandidate);
  }
  const possible = document.comments.filter(
    (comment) => comment.value.trim().length > 0 && !isIgnoredComment(comment),
  );
  const classifications = await mapConcurrent(
    possible,
    maxConcurrentTodoClassifications,
    async (comment) => {
      const response = await context.provider.evaluate(
        comment,
        {
          state: {
            language: document.language,
            comment: boundedEvidence(comment.source, MAX_COMMENT_CHARACTERS).value,
          },
          questions: {
            candidate_kind: {
              type: "choice",
              instructions:
                "Is this comment an explicit TODO, FIXME, HACK, or equivalent action marker for future work? Classify the comment itself, not whether the future work is well explained.",
              criteria: {
                todo: "The comment explicitly marks future work or a condition to revisit.",
                other: "The comment documents current code without marking future work.",
              },
            },
          },
        },
        context.signal,
      );
      if (response === null) {
        return null;
      }
      const answer = response.answers["candidate_kind"];
      if (answer === undefined) {
        throw new Error(`Provider ${context.provider.id} omitted the TODO classification answer`);
      }
      return answer.type === "choice" && answer.choice === "todo" ? comment : null;
    },
  );
  return classifications.filter((comment): comment is CommentTarget => comment !== null);
};

const mapConcurrent = async <Input, Output>(
  values: readonly Input[],
  concurrency: number,
  run: (value: Input) => Promise<Output>,
): Promise<Output[]> => {
  let nextIndex = 0;
  const results: Output[] = [];
  const runWorker = async (): Promise<void> => {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= values.length) {
      return;
    }
    results[index] = await run(values[index]!);
    await runWorker();
  };
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
};

const commentState = (comment: CommentTarget, document: ParsedDocument): JsonValue => {
  const enclosingCode = comment.enclosingSource;
  const context =
    enclosingCode !== undefined && enclosingCode.length <= MAX_CONTEXT_CHARACTERS
      ? enclosingCode
      : nearbySource(document.source, comment.range.start, comment.range.end);
  const source = boundedEvidence(comment.source, MAX_COMMENT_CHARACTERS);
  const value = boundedEvidence(comment.value, MAX_COMMENT_CHARACTERS);
  const enclosing = boundedEvidence(context, MAX_CONTEXT_CHARACTERS);
  return {
    language: document.language,
    comment: {
      source: source.value,
      source_truncated: source.truncated,
      value: value.value,
      value_truncated: value.truncated,
      style: comment.style,
    },
    context: {
      enclosing_code: enclosing.value,
      enclosing_code_truncated: enclosing.truncated,
    },
  };
};

const ordinaryComments = (document: ParsedDocument): CommentTarget[] => {
  return document.comments.filter(
    (comment) =>
      isBaseCandidate(comment) && !isTodoCandidate(comment) && !isDeprecationCandidate(comment),
  );
};

const reviewableComments = (document: ParsedDocument): CommentTarget[] => {
  return document.comments.filter(
    (comment) =>
      comment.value.trim().length > 0 && !isIgnoredComment(comment) && !isTodoCandidate(comment),
  );
};

const isBaseCandidate = (comment: CommentTarget): boolean => {
  const value = comment.value.trim();
  if (value.length < 8) {
    return false;
  }
  return !isIgnoredComment(comment);
};

const isIgnoredComment = (comment: CommentTarget): boolean => {
  return /^(?:\*\s*)?(?:scruple-(?:disable|enable)\b|eslint|oxlint|prettier|istanbul|c8|tslint|@ts-|@vite-ignore\b|@license\b|@preserve\b|SPDX-|Copyright\b|Generated\b|Code generated\b|#__PURE__\b|#__NO_SIDE_EFFECTS__\b|\/\s*<reference\b|\/\s*<amd-)/iu.test(
    comment.value.trim(),
  );
};

const isTodoCandidate = (comment: CommentTarget): boolean => {
  return /^(?:\s*\*?\s*)(?:@todo|TODO|FIXME|HACK)\b/imu.test(comment.value);
};

const isSuppressionCandidate = (comment: CommentTarget): boolean => {
  return /^(?:\s*\*?\s*)(?:(?:eslint|oxlint|scruple)-disable(?:-next-line|-line)?\b|tslint:disable\b|@ts-(?:expect-error|ignore|nocheck)\b|(?:c8|istanbul)\s+ignore\b|prettier-ignore\b|nosemgrep\b)/imu.test(
    comment.value,
  );
};

const isDeprecationCandidate = (comment: CommentTarget): boolean => {
  return /@deprecated\b/iu.test(comment.value);
};

const isChangeHistoryCandidate = (comment: CommentTarget): boolean => {
  return (
    /\b(?:formerly|no longer|old implementation|previous implementation|previously|used to|was using|were using)\b/iu.test(
      comment.value,
    ) ||
    /^(?:\s*\*?\s*)(?:changed|migrated|moved|switched|updated)\s+from\b/imu.test(comment.value) ||
    /^(?:\s*\*?\s*)(?:changed|renamed|updated)\b[^\r\n]{0,80}\bto\b/imu.test(comment.value) ||
    /^(?:\s*\*?\s*)replaced\b[^\r\n]{0,80}\bwith\b/imu.test(comment.value) ||
    /^(?:\s*\*?\s*)removed\b[^\r\n]{0,80}\b(?:because|in favor of)\b/imu.test(comment.value) ||
    /^(?:\s*\*?\s*)(?:added|introduced)\s+(?:for|in|to support)\b/imu.test(comment.value) ||
    /^(?:\s*\*?\s*)older\s+(?:browsers?|clients?|releases?|runtimes?|systems?|versions?)\b[^\r\n]{0,80}\b(?:expected|required|sent|supported|used)\b/imu.test(
      comment.value,
    )
  );
};

const MAX_COMMENT_CHARACTERS = 2_000;
const MAX_CONTEXT_CHARACTERS = 1_000;
const TRUNCATION_MARKER = "\n… evidence truncated …\n";

const boundedEvidence = (
  value: string,
  maximumCharacters: number,
): { value: string; truncated: boolean } => {
  if (value.length <= maximumCharacters) {
    return { value, truncated: false };
  }
  const available = maximumCharacters - TRUNCATION_MARKER.length;
  const headLength = Math.ceil(available / 2);
  const tailLength = Math.floor(available / 2);
  return {
    value: `${value.slice(0, headLength)}${TRUNCATION_MARKER}${value.slice(-tailLength)}`,
    truncated: true,
  };
};

const nearbySource = (source: string, start: number, end: number): string => {
  const radius = 500;
  return source.slice(Math.max(0, start - radius), Math.min(source.length, end + radius));
};

const probabilityOptions = (
  options: ProbabilityRuleOptions,
  defaultThreshold: DecisionThreshold,
  defaultMinConfidence: number,
): { threshold: DecisionThreshold; minConfidence: number } => {
  return resolveDecisionOptions(options, {
    threshold: defaultThreshold,
    minConfidence: defaultMinConfidence,
  });
};

const diagnostic = (
  candidate: RuleCandidate,
  message: string,
  scores: { probability: number; confidence: number; severity: "warning" | "error" },
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    ...scores,
  };
};
