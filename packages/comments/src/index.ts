import type {
  ChoiceAnswer,
  CommentTarget,
  DecisionAnswer,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface ProbabilityRuleOptions {
  threshold?: number;
  minConfidence?: number;
}

export interface NoUselessCommentsOptions {
  threshold?: number;
}

export interface PreferConciseCommentsOptions extends ProbabilityRuleOptions {
  minCharacters?: number;
}

export type CommentsPlugin = ScruplePlugin<{
  "no-useless-comments": RuleFactory<NoUselessCommentsOptions>;
  "no-misleading-comments": RuleFactory<ProbabilityRuleOptions>;
  "no-commented-out-code": RuleFactory<ProbabilityRuleOptions>;
  "no-change-history-comments": RuleFactory<ProbabilityRuleOptions>;
  "prefer-concise-comments": RuleFactory<PreferConciseCommentsOptions>;
  "require-actionable-todos": RuleFactory<ProbabilityRuleOptions>;
}>;

export function comments(): CommentsPlugin {
  return definePlugin({
    rules: {
      "no-useless-comments": noUselessComments,
      "no-misleading-comments": noMisleadingComments,
      "no-commented-out-code": noCommentedOutCode,
      "no-change-history-comments": noChangeHistoryComments,
      "prefer-concise-comments": preferConciseComments,
      "require-actionable-todos": requireActionableTodos,
    },
  });
}

function noUselessComments(options: NoUselessCommentsOptions = {}): SemanticRule {
  const threshold = options.threshold ?? 0.9;
  return {
    description: "Comments should add information that the code does not already express.",
    collect(document) {
      return ordinaryComments(document).map((comment) => ({
        target: comment,
        state: commentState(comment, document),
        question: {
          type: "noul",
          instructions:
            "Does `comment` add no maintainability value because it merely restates obvious code, uses generic section-heading prose, narrates a straightforward next step, or contains AI-assistant meta commentary? A misleading claim, disabled code, change-history note, or TODO belongs to a different rule and is not useless for this question.",
          criteria: {
            true: "The comment adds no useful rationale, constraint, warning, domain knowledge, or non-obvious explanation.",
            false:
              "The comment adds useful current information, or it has a distinct problem owned by another comments rule.",
          },
        },
      }));
    },
    diagnose(answer, candidate) {
      if (answer.type !== "noul" || answer.noul < threshold) {
        return null;
      }
      return diagnostic(candidate, "This comment appears to add no useful information.", {
        probability: answer.noul,
      });
    },
  };
}

function noMisleadingComments(options: ProbabilityRuleOptions = {}): SemanticRule {
  const { threshold, minConfidence } = probabilityOptions(options, 0.85, 0.7);
  return choiceRule({
    description: "Comments should accurately describe the code they accompany.",
    select: ordinaryComments,
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
}

function noCommentedOutCode(options: ProbabilityRuleOptions = {}): SemanticRule {
  const { threshold, minConfidence } = probabilityOptions(options, 0.95, 0.7);
  return choiceRule({
    description: "Comments should not preserve disabled implementation code.",
    select: ordinaryComments,
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
}

function noChangeHistoryComments(options: ProbabilityRuleOptions = {}): SemanticRule {
  const { threshold, minConfidence } = probabilityOptions(options, 0.95, 0.7);
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
}

function preferConciseComments(options: PreferConciseCommentsOptions = {}): SemanticRule {
  const { threshold, minConfidence } = probabilityOptions(options, 0.9, 0.65);
  const minCharacters = options.minCharacters ?? 100;
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
}

function requireActionableTodos(options: ProbabilityRuleOptions = {}): SemanticRule {
  const { threshold, minConfidence } = probabilityOptions(options, 0.8, 0.7);
  return choiceRule({
    description: "TODO comments should give a maintainer enough context to act.",
    select: (document) => document.comments.filter(isTodoCandidate),
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
}

interface ChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): CommentTarget[];
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  finding: string;
  threshold: number;
  minConfidence: number;
  message: string;
}

function choiceRule(definition: ChoiceRuleDefinition): SemanticRule {
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
      if (!isFinding(answer, definition.finding, definition.threshold, definition.minConfidence)) {
        return null;
      }
      return diagnostic(candidate, definition.message, {
        probability: answer.probabilities[definition.finding] ?? 0,
        confidence: answer.confidence,
      });
    },
  };
}

function commentState(comment: CommentTarget, document: ParsedDocument): JsonValue {
  return {
    language: document.language,
    comment: {
      source: comment.source,
      value: comment.value,
      style: comment.style,
    },
    context: {
      enclosing_code:
        comment.enclosingSource ??
        nearbySource(document.source, comment.range.start, comment.range.end),
    },
  };
}

function ordinaryComments(document: ParsedDocument): CommentTarget[] {
  return document.comments.filter(
    (comment) => isBaseCandidate(comment) && !isTodoCandidate(comment),
  );
}

function isBaseCandidate(comment: CommentTarget): boolean {
  const value = comment.value.trim();
  if (value.length < 8) {
    return false;
  }
  return !/^(?:eslint|oxlint|prettier|istanbul|c8|tslint|@ts-|SPDX-|Copyright\b|Generated\b|Code generated\b)/iu.test(
    value,
  );
}

function isTodoCandidate(comment: CommentTarget): boolean {
  return /^(?:TODO|FIXME|HACK)\b/iu.test(comment.value.trim());
}

function isChangeHistoryCandidate(comment: CommentTarget): boolean {
  return /\b(?:before|changed|formerly|no longer|old implementation|older|previously|removed|replaced|used to|was using|were using)\b/iu.test(
    comment.value,
  );
}

function nearbySource(source: string, start: number, end: number): string {
  const radius = 500;
  return source.slice(Math.max(0, start - radius), Math.min(source.length, end + radius));
}

function probabilityOptions(
  options: ProbabilityRuleOptions,
  defaultThreshold: number,
  defaultMinConfidence: number,
): { threshold: number; minConfidence: number } {
  return {
    threshold: options.threshold ?? defaultThreshold,
    minConfidence: options.minConfidence ?? defaultMinConfidence,
  };
}

function isFinding(
  answer: DecisionAnswer,
  finding: string,
  threshold: number,
  minConfidence: number,
): answer is ChoiceAnswer {
  return (
    answer.type === "choice" &&
    answer.choice === finding &&
    (answer.probabilities[finding] ?? 0) >= threshold &&
    answer.confidence >= minConfidence
  );
}

function diagnostic(
  candidate: RuleCandidate,
  message: string,
  scores: { probability?: number; confidence?: number },
) {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    ...scores,
  };
}
