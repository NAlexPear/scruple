import type {
  ChoiceAnswer,
  DecisionAnswer,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface SecurityRuleOptions {
  threshold?: number;
  minConfidence?: number;
}

export type SecurityPlugin = ScruplePlugin<{
  "no-user-controlled-authorization": RuleFactory<SecurityRuleOptions>;
  "no-sensitive-data-exposure": RuleFactory<SecurityRuleOptions>;
}>;

const authorityTerms =
  /(?:access|admin|authori[sz]|entitlement|owner|permission|privilege|role|scope|tenant)/iu;
const exposureSinks = [
  /(?:^|\.)(?:json|send|sendFile|end|render|redirect)$/u,
  /^(?:console|logger|log)\.(?:debug|error|info|log|trace|warn)$/u,
];

export const security = (): SecurityPlugin => {
  return definePlugin({
    rules: {
      "no-user-controlled-authorization": noUserControlledAuthorization,
      "no-sensitive-data-exposure": noSensitiveDataExposure,
    },
  });
};

const noUserControlledAuthorization = (options: SecurityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  return choiceRule({
    description: "Authorization decisions should not trust attacker-controlled authority claims.",
    select: (document) =>
      implementationFunctions(document).filter((fn) => authorityTerms.test(fn.source)),
    question: {
      instructions:
        "Does this function visibly grant access, assign authority, or make an authorization decision from attacker-controlled authority claims? Treat request bodies, query strings, route parameters, unverified headers/cookies, and raw client payloads as attacker-controlled. A resource ID is not itself an authority claim. Treat an authenticated principal, verified token claims, a server-side lookup, or an explicit policy/guard as trusted only when the supplied file evidence establishes that provenance. Account for visible route middleware and guards in `surrounding_source`. If provenance, middleware behavior, or the actual authorization decision is outside the supplied file evidence, choose `insufficient_context`; absence of a visible check is not enough for a finding.",
      criteria: {
        user_controlled_authorization:
          "Visible code uses an attacker-controlled role, permission, scope, ownership, tenant, admin, or equivalent authority claim to grant access or persist/issue authority without validating it against a trusted server-side source.",
        trusted_authorization:
          "Visible code derives authority from an authenticated principal, verified claims, a server-side policy or lookup, or an explicit guard rather than trusting client authority claims.",
        not_authorization:
          "The authority-related terms do not participate in granting access, assigning authority, or making an authorization decision.",
        insufficient_context:
          "The supplied file does not establish the value's trust boundary or whether an external guard or policy validates the decision.",
      },
    },
    finding: "user_controlled_authorization",
    threshold,
    minConfidence,
    message: "This function appears to trust user-controlled data for an authorization decision.",
  });
};

const noSensitiveDataExposure = (options: SecurityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  return choiceRule({
    description: "Responses and logs should not expose sensitive data.",
    select: (document) =>
      implementationFunctions(document).filter((fn) =>
        fn.calls.some((call) => matchesAny(call.callee, exposureSinks)),
      ),
    question: {
      instructions:
        "Does this function visibly disclose sensitive data through a response, rendered output, redirect, file transfer, or log sink? Sensitive data includes credentials, authentication/session tokens, private keys, password material, and confidential personal or tenant data whose confidentiality is evident from the supplied file. Trace visible projection, redaction, masking, and sanitization before the sink. Do not assume a helper sanitizes or leaks data when its implementation or contract is not supplied. If sensitivity, data shape, helper behavior, or access boundary is not established by this file, choose `insufficient_context`.",
      criteria: {
        sensitive_data_exposure:
          "Visible data flow sends or logs sensitive fields or values without effective removal, masking, or another visible protection.",
        protected_output:
          "Visible code removes, masks, projects away, or otherwise protects the sensitive data before the sink.",
        no_sensitive_data:
          "The visible value reaching the sink contains no data shown by this file to be sensitive.",
        insufficient_context:
          "The supplied file does not establish the data's sensitivity, shape, sanitization, or destination boundary.",
      },
    },
    finding: "sensitive_data_exposure",
    threshold,
    minConfidence,
    message: "This function appears to expose sensitive data in a response or log.",
  });
};

interface ChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): FunctionTarget[];
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  finding: string;
  threshold: number;
  minConfidence: number;
  message: string;
}

const choiceRule = (definition: ChoiceRuleDefinition): SemanticRule => {
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map((fn) => ({
        target: fn,
        state: functionState(fn, document),
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
      return diagnostic(candidate, definition.message, answer, definition.finding);
    },
  };
};

const functionState = (fn: FunctionTarget, document: ParsedDocument): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    function: {
      name: fn.name ?? null,
      source: fn.source,
      calls: fn.calls.map((call) => call.callee),
    },
    context: {
      evidence_boundary: "current_file",
      surrounding_source: nearbySource(document.source, fn.range.start, fn.range.end),
    },
  };
};

const implementationFunctions = (document: ParsedDocument): FunctionTarget[] => {
  return document.functions.filter((fn) => fn.kind === "function" && fn.source.length > 0);
};

const nearbySource = (source: string, start: number, end: number): string => {
  const radius = 1_000;
  return source.slice(Math.max(0, start - radius), Math.min(source.length, end + radius));
};

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean => {
  return patterns.some((pattern) => pattern.test(value));
};

const decisionOptions = (
  options: SecurityRuleOptions,
): {
  threshold: number;
  minConfidence: number;
} => {
  return {
    threshold: options.threshold ?? 0.9,
    minConfidence: options.minConfidence ?? 0.75,
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
