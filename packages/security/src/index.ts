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
  "no-untrusted-command-execution": RuleFactory<SecurityRuleOptions>;
  "no-untrusted-mass-assignment": RuleFactory<SecurityRuleOptions>;
  "no-unsafe-redirect": RuleFactory<SecurityRuleOptions>;
}>;

const authorityTerms =
  /(?:access|admin|authori[sz]|entitlement|owner|permission|privilege|role|scope|tenant)/iu;
const authorizationCalls = [
  /(?:^|\.)(?:allow|authori[sz]e\w*|can|checkAccess|hasPermission|isAllowed|requirePermission)$/iu,
  /(?:^|\.)(?:grant|setRole|setScope|updatePermission)$/iu,
];
const responseSinks = [/(?:^|\.)(?:json|send|sendFile|end|render|redirect)$/u];
const commandExecutionSinks = [
  /(?:^|\.)(?:exec|execFile|execFileSync|execSync|spawn|spawnSync)$/u,
  /^(?:eval|Function)$/u,
  /(?:^|\.)vm\.(?:compileFunction|runInContext|runInNewContext|runInThisContext|Script)$/u,
];
const massAssignmentSinks = [
  /(?:^|\.)(?:assign|create|findOneAndUpdate|merge|replaceOne|update|updateMany|updateOne|upsert)$/u,
];
const redirectSinks = [/(?:^|\.)(?:redirect)$/u];
const requestBoundaryPatterns = [
  /\b(?:req(?:uest)?|ctx)\s*\.\s*(?:body|cookies?|headers?|params|query)\b/iu,
  /\bctx\s*\.\s*request\s*\.\s*(?:body|cookies?|headers?|params|query)\b/iu,
];

export const security = (): SecurityPlugin => {
  return definePlugin({
    rules: {
      "no-user-controlled-authorization": noUserControlledAuthorization,
      "no-sensitive-data-exposure": noSensitiveDataExposure,
      "no-untrusted-command-execution": noUntrustedCommandExecution,
      "no-untrusted-mass-assignment": noUntrustedMassAssignment,
      "no-unsafe-redirect": noUnsafeRedirect,
    },
  });
};

const noUserControlledAuthorization = (options: SecurityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  return choiceRule({
    description: "Authorization decisions should not trust attacker-controlled authority claims.",
    select: (document) =>
      implementationFunctions(document).filter(
        (fn) =>
          authorityTerms.test(fn.source) &&
          (matchesAny(fn.source, requestBoundaryPatterns) ||
            fn.calls.some((call) => matchesAny(call.callee, authorizationCalls))),
      ),
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
    description: "Responses and rendered output should not expose sensitive data.",
    select: (document) =>
      implementationFunctions(document).filter((fn) =>
        fn.calls.some((call) => matchesAny(call.callee, responseSinks)),
      ),
    question: {
      instructions:
        "Does this function visibly disclose sensitive data through a response, rendered output, redirect, or file transfer? Sensitive data includes credentials, authentication/session tokens, private keys, password material, and confidential personal or tenant data whose confidentiality is evident from the supplied file. Logging is owned by the observability/no-sensitive-logs rule and is outside this rule. Trace visible projection, redaction, masking, and sanitization before the response sink. Do not assume a helper sanitizes or leaks data when its implementation or contract is not supplied. If sensitivity, data shape, helper behavior, or access boundary is not established by this file, choose `insufficient_context`.",
      criteria: {
        sensitive_data_exposure:
          "Visible data flow sends sensitive fields or values to a response or output sink without effective removal, masking, or another visible protection.",
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
    message: "This function appears to expose sensitive data in a response or rendered output.",
  });
};

const noUntrustedCommandExecution = (options: SecurityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  return choiceRule({
    description: "Untrusted input should not control command or dynamic code execution.",
    select: (document) => directBoundaryFunctions(document, commandExecutionSinks),
    includeSurroundingSource: false,
    question: {
      instructions:
        "Does this function visibly allow request-controlled input to determine an operating-system command, executable, shell-interpreted argument, or dynamically executed code? Judge only the current function. A fixed executable with shell execution disabled and visibly allowlisted structured arguments can be constrained, but account for arguments that the target program itself interprets as options or code. Static commands unrelated to request input are not selected. If safety depends on an unseen validator, command builder, or wrapper, choose `insufficient_context`.",
      criteria: {
        untrusted_command_execution:
          "Request-controlled data visibly reaches a command, executable, shell, or dynamic-code sink without an effective visible constraint.",
        constrained_execution:
          "The executable or code is fixed and request-controlled choices are visibly restricted to safe structured arguments without shell interpretation.",
        no_direct_flow:
          "The request data and execution sink are both present but the visible function establishes that the request data does not control execution.",
        insufficient_context:
          "An unseen validator, builder, wrapper, or program-specific argument contract is required to decide whether execution is constrained.",
      },
    },
    finding: "untrusted_command_execution",
    threshold,
    minConfidence,
    message: "This function appears to pass untrusted input to command or code execution.",
  });
};

const noUntrustedMassAssignment = (options: SecurityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  return choiceRule({
    description: "Client objects should not be bound wholesale to persisted models.",
    select: (document) => directBoundaryFunctions(document, massAssignmentSinks),
    includeSurroundingSource: false,
    question: {
      instructions:
        "Does this function visibly pass a request-controlled object or object spread wholesale into a model, repository, ORM, or object-assignment operation, allowing the client to choose fields that are persisted or trusted? Judge only the current function. Explicit projection or a visible schema that allowlists the mutable fields is safe. Type annotations and validation that merely accepts the full object do not establish field authorization. If field selection depends on an unseen DTO, schema, mapper, or repository contract, choose `insufficient_context`.",
      criteria: {
        untrusted_mass_assignment:
          "A request-controlled object is visibly spread or passed wholesale to an assignment or persistence sink without a visible field allowlist.",
        allowlisted_assignment:
          "The function visibly constructs the assigned object from an explicit allowlist of client-mutable fields.",
        no_direct_flow:
          "The request object and assignment sink are both present but the visible function establishes that request-controlled fields do not reach the sink.",
        insufficient_context:
          "An unseen DTO, schema, mapper, or persistence contract is required to determine which fields can be assigned.",
      },
    },
    finding: "untrusted_mass_assignment",
    threshold,
    minConfidence,
    message: "This function appears to bind an untrusted object wholesale to persisted state.",
  });
};

const noUnsafeRedirect = (options: SecurityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = decisionOptions(options);
  return choiceRule({
    description: "Redirect targets should not be controlled by untrusted request data.",
    select: (document) => directBoundaryFunctions(document, redirectSinks),
    includeSurroundingSource: false,
    question: {
      instructions:
        "Does this function visibly redirect to a request-controlled target without restricting it to an intended local path or an exact allowlisted origin? Judge only the current function. Protocol-relative targets are external targets. A fixed local path is safe, as is a parsed URL whose origin is compared exactly against a visible allowlist and whose failure path rejects the redirect. Prefix, substring, and naive suffix checks do not establish origin safety. If validation or normalization depends on an unseen helper, choose `insufficient_context`.",
      criteria: {
        unsafe_redirect:
          "Request-controlled data visibly determines the redirect target without an effective visible local-path or exact-origin restriction.",
        validated_redirect:
          "The redirect is visibly restricted to an intended local path or a parsed exact allowlisted origin with rejection on failure.",
        no_direct_flow:
          "The request data and redirect sink are both present but the visible function establishes that request data does not determine the target.",
        insufficient_context:
          "An unseen redirect validator, normalizer, or route policy is required to determine target safety.",
      },
    },
    finding: "unsafe_redirect",
    threshold,
    minConfidence,
    message: "This function appears to redirect to an untrusted target.",
  });
};

interface ChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): FunctionTarget[];
  includeSurroundingSource?: boolean;
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
        state: functionState(fn, document, definition.includeSurroundingSource ?? true),
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

const functionState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  includeSurroundingSource: boolean,
): JsonValue => {
  const context: { [key: string]: JsonValue } = {
    evidence_boundary: includeSurroundingSource ? "current_file" : "current_function",
  };
  if (includeSurroundingSource) {
    context["surrounding_source"] = nearbySource(document.source, fn.range.start, fn.range.end);
  }
  return {
    language: document.language,
    imports: document.imports,
    function: {
      name: fn.name ?? null,
      source: fn.source,
      calls: fn.calls.map((call) => ({ callee: call.callee, source: call.source })),
    },
    context,
  };
};

const implementationFunctions = (document: ParsedDocument): FunctionTarget[] => {
  return document.functions.filter((fn) => fn.kind === "function" && fn.source.length > 0);
};

const directBoundaryFunctions = (
  document: ParsedDocument,
  sinkPatterns: readonly RegExp[],
): FunctionTarget[] => {
  return implementationFunctions(document).filter(
    (fn) =>
      matchesAny(fn.source, requestBoundaryPatterns) &&
      fn.calls.some((call) => matchesAny(call.callee, sinkPatterns)),
  );
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
