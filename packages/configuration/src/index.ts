import type {
  ChoiceAnswer,
  CodeTarget,
  DecisionAnswer,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
  SourcePosition,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface ProbabilityRuleOptions {
  threshold?: number;
  minConfidence?: number;
}

export type ConfigurationPlugin = ScruplePlugin<{
  "no-insecure-production-defaults": RuleFactory<ProbabilityRuleOptions>;
  "require-environment-validation": RuleFactory<ProbabilityRuleOptions>;
}>;

const evidenceRadius = 4_000;
const environmentRead =
  /\b(?:process\.env(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])?|import\.meta\.env(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])?|Deno\.env\.get\([^\n)]*\)|Bun\.env(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])?)/gu;

export const configuration = (): ConfigurationPlugin => {
  return definePlugin({
    rules: {
      "no-insecure-production-defaults": noInsecureProductionDefaults,
      "require-environment-validation": requireEnvironmentValidation,
    },
  });
};

const noInsecureProductionDefaults = (options: ProbabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(options, 0.9, 0.7);
  return configurationRule({
    description: "Production configuration should not fall back to insecure values.",
    instructions:
      "Does the visible code allow a security-sensitive environment setting to fall back to an insecure value on a production path? Require evidence for both the insecure security effect and production reachability. A harmless operational default is not insecure. A weak value confined by a clear development or test guard is allowed. Treat schema defaults as defaults, not validation, when they can supply an insecure production value. If either reachability or the effective fallback is outside the evidence, choose insufficient_context.",
    criteria: {
      secure:
        "The setting fails closed, has no security-sensitive fallback, or its production fallback is demonstrably safe.",
      insecure_production_default:
        "The evidence establishes that an insecure fallback can become effective in production.",
      development_only_default:
        "The insecure-looking fallback is demonstrably confined to development or test execution.",
      insufficient_context:
        "The bounded evidence does not establish the effective fallback, its security effect, or whether the path can run in production.",
    },
    finding: "insecure_production_default",
    threshold,
    minConfidence,
    message: "Remove this insecure default from the production configuration path.",
  });
};

const requireEnvironmentValidation = (options: ProbabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = probabilityOptions(options, 0.9, 0.7);
  return configurationRule({
    description: "Environment configuration should be validated before application use.",
    instructions:
      "Are environment values used on an application path without schema or framework validation? Validation must establish expected presence, type, format, range, or allowed values before use; TypeScript assertions, fallback values, and parsing alone are not sufficient. Recognize direct checks and established schema/framework validators. If the values may be validated in an imported module, startup boundary, or omitted part of the file, choose insufficient_context rather than unvalidated.",
    criteria: {
      validated:
        "The evidence shows direct checks or a schema/framework validation boundary before application use.",
      unvalidated:
        "The evidence establishes application use of environment values without a protecting validation boundary.",
      insufficient_context:
        "The bounded evidence cannot establish whether validation occurs elsewhere or before this use.",
    },
    finding: "unvalidated",
    threshold,
    minConfidence,
    message: "Validate environment configuration before using it in the application.",
  });
};

interface ConfigurationRuleDefinition {
  description: string;
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  threshold: number;
  minConfidence: number;
  message: string;
}

const configurationRule = (definition: ConfigurationRuleDefinition): SemanticRule => {
  return {
    description: definition.description,
    collect(document) {
      return environmentEvidence(document).map((evidence) => ({
        target: evidence.target,
        state: evidence.state,
        question: {
          type: "choice",
          instructions: definition.instructions,
          criteria: definition.criteria,
        },
      }));
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, definition.threshold, definition.minConfidence)) {
        return null;
      }
      return diagnostic(candidate, definition.message, answer, definition.finding);
    },
  };
};

const environmentEvidence = (
  document: ParsedDocument,
): { target: CodeTarget; state: JsonValue }[] => {
  return [...document.source.matchAll(environmentRead)].map((match) => {
    const start = match.index;
    const end = start + match[0].length;
    const excerptStart = Math.max(0, start - evidenceRadius);
    const excerptEnd = Math.min(document.source.length, end + evidenceRadius);
    return {
      target: {
        kind: "expression",
        filename: document.filename,
        language: document.language,
        range: { start, end },
        location: {
          start: positionAt(document.source, start),
          end: positionAt(document.source, end),
        },
        source: match[0],
        enclosingSource: document.source.slice(excerptStart, excerptEnd),
      },
      state: {
        language: document.language,
        imports: document.imports,
        environment: {
          read: match[0],
          source_excerpt: document.source.slice(excerptStart, excerptEnd),
          evidence_scope: "single_file_bounded_excerpt",
          truncated_before: excerptStart > 0,
          truncated_after: excerptEnd < document.source.length,
        },
      },
    };
  });
};

const positionAt = (source: string, offset: number): SourcePosition => {
  const prefix = source.slice(0, offset);
  const lastNewline = prefix.lastIndexOf("\n");
  return {
    line: prefix.split("\n").length,
    column: offset - lastNewline,
  };
};

const probabilityOptions = (
  options: ProbabilityRuleOptions,
  defaultThreshold: number,
  defaultMinConfidence: number,
): { threshold: number; minConfidence: number } => {
  return {
    threshold: options.threshold ?? defaultThreshold,
    minConfidence: options.minConfidence ?? defaultMinConfidence,
  };
};

const isFinding = (
  answer: DecisionAnswer,
  finding: string,
  threshold: number,
  minConfidence: number,
): answer is ChoiceAnswer => {
  return (
    answer.type === "choice" &&
    answer.choice === finding &&
    (answer.probabilities[finding] ?? 0) >= threshold &&
    answer.confidence >= minConfidence
  );
};

const diagnostic = (
  candidate: RuleCandidate,
  message: string,
  answer: ChoiceAnswer,
  finding: string,
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    probability: answer.probabilities[finding] ?? 0,
    confidence: answer.confidence,
  };
};
