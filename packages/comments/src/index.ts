import type {
  CommentTarget,
  DiagnosticSeverity,
  JsonValue,
  ParsedDocument,
  SemanticPlugin,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface NoUselessCommentsOptions {
  severity?: DiagnosticSeverity;
  threshold?: number;
}

export interface CommentsOptions {
  noUselessComments?: NoUselessCommentsOptions | false;
}

export function comments(options: CommentsOptions = {}): SemanticPlugin[] {
  const noUselessComments = options.noUselessComments ?? {};
  return noUselessComments === false ? [] : [noUselessCommentsPlugin(noUselessComments)];
}

export function noUselessCommentsPlugin(options: NoUselessCommentsOptions = {}): SemanticPlugin {
  const threshold = options.threshold ?? 0.95;
  const severity = options.severity ?? "warning";

  return definePlugin({
    id: "comments/no-useless-comments",
    description: "Comments should add useful information.",
    collect(document) {
      return document.comments.filter(isCommentCandidate).map((comment) => ({
        target: comment,
        state: commentState(comment, document),
        question: {
          type: "noul",
          instructions:
            "Is `comment` clearly unhelpful because it merely restates obvious code, uses generic section-heading prose, narrates a straightforward next step, or contains AI-assistant meta commentary? Judge only maintainability value, not writing style.",
          criteria: {
            true: "The comment adds no useful rationale, constraint, warning, domain knowledge, or non-obvious explanation.",
            false:
              "The comment explains why, documents a constraint or edge case, warns about a hazard, provides domain context, or otherwise helps a maintainer.",
          },
        },
      }));
    },
    diagnose(answer, candidate) {
      if (answer.type !== "noul" || answer.noul < threshold) {
        return null;
      }
      return {
        severity,
        message: "This comment appears to add no useful information.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability: answer.noul,
      };
    },
  });
}

function commentState(comment: CommentTarget, document: ParsedDocument): JsonValue {
  return {
    language: document.language,
    comment: comment.source,
    enclosing_code:
      comment.enclosingSource ??
      nearbySource(document.source, comment.range.start, comment.range.end),
  };
}

function isCommentCandidate(comment: CommentTarget): boolean {
  const value = comment.value.trim();
  if (value.length < 8) {
    return false;
  }
  return !/^(?:eslint|oxlint|prettier|istanbul|c8|tslint|@ts-|TODO\b|FIXME\b|HACK\b|NOTE\b)/iu.test(
    value,
  );
}

function nearbySource(source: string, start: number, end: number): string {
  const radius = 500;
  return source.slice(Math.max(0, start - radius), Math.min(source.length, end + radius));
}
