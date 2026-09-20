import type {
  ChoiceAnswer,
  DecisionRuleOptions,
  DecisionThreshold,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions, resolveDiagnosticSeverity } from "@scruple/core";

export type SecurityRuleOptions = DecisionRuleOptions;

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
const sensitiveOutputSinks = [
  // HTTP and framework responses.
  /(?:^|\.)(?:download|end|json|jsonp|redirect|render|respondWith|send|sendFile|sendStatus|write)$/u,
  /(?:^|\.)Response\.json$/u,
  // Filesystem output.
  /^(?:appendFile|appendFileSync|writeFile|writeFileSync)$/u,
  /(?:^|\.)(?:fs|promises)\.(?:appendFile|writeFile)$/u,
  /^(?:Bun\.write|Deno\.(?:writeFile|writeTextFile))$/u,
  // Node-style stream transfer and pipeline helpers.
  /(?:^|\.)(?:pipe|pipeline)$/u,
];
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
const evidenceBudgets = {
  functionCharacters: 4_000,
  surroundingCharacters: 2_000,
  importCount: 10,
  importCharacters: 500,
  callCount: 20,
  callCharacters: 1_000,
} as const;

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
        "Does this function visibly grant access, assign authority, or make an authorization decision from attacker-controlled authority claims? Treat request bodies, query strings, route parameters, unverified headers/cookies, and raw client payloads as attacker-controlled. A resource ID is not itself an authority claim. Treat an authenticated principal, verified token claims, a server-side lookup, or an explicit policy/guard as trusted only when the bounded evidence establishes that provenance. Account for visible route middleware and guards in `surrounding_source`. If provenance, middleware behavior, or the actual authorization decision is outside the bounded evidence, choose `insufficient_context`; absence of a visible check is not enough for a finding.",
      criteria: {
        user_controlled_authorization:
          "Visible code uses an attacker-controlled role, permission, scope, ownership, tenant, admin, or equivalent authority claim to grant access or persist/issue authority without validating it against a trusted server-side source.",
        trusted_authorization:
          "Visible code derives authority from an authenticated principal, verified claims, a server-side policy or lookup, or an explicit guard rather than trusting client authority claims.",
        not_authorization:
          "The authority-related terms do not participate in granting access, assigning authority, or making an authorization decision.",
        insufficient_context:
          "The bounded evidence does not establish the value's trust boundary or whether an external guard or policy validates the decision.",
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
        fn.calls.some((call) => matchesAny(call.callee, sensitiveOutputSinks)),
      ),
    question: {
      instructions:
        "Does this function visibly disclose sensitive data through a selected HTTP response, rendered output, redirect, filesystem write, or stream sink? Sensitive data includes credentials, authentication/session tokens, private keys, password material, and confidential personal or tenant data whose confidentiality is evident from the bounded evidence. Logging is owned by the observability/no-sensitive-logs rule and is outside this rule. Trace visible projection, redaction, masking, and sanitization before the output sink. Do not assume a helper sanitizes or leaks data when its implementation or contract is not supplied. If sensitivity, data shape, helper behavior, or the destination boundary is not established by the bounded evidence, choose `insufficient_context`.",
      criteria: {
        sensitive_data_exposure:
          "Visible data flow sends sensitive fields or values to a response or output sink without effective removal, masking, or another visible protection.",
        protected_output:
          "Visible code removes, masks, projects away, or otherwise protects the sensitive data before the sink.",
        no_sensitive_data:
          "The visible value reaching the sink contains no data shown by the bounded evidence to be sensitive.",
        insufficient_context:
          "The bounded evidence does not establish the data's sensitivity, shape, sanitization, or destination boundary.",
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
  threshold: DecisionThreshold;
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
      if (answer.type !== "choice" || answer.choice !== definition.finding) {
        return null;
      }
      const probability = answer.probabilities[definition.finding] ?? 0;
      const severity = resolveDiagnosticSeverity(probability, answer.confidence, definition);
      return severity === null
        ? null
        : diagnostic(candidate, definition.message, answer, definition.finding, severity);
    },
  };
};

const functionState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  includeSurroundingSource: boolean,
): JsonValue => {
  const imports = document.imports.slice(0, evidenceBudgets.importCount);
  const calls = fn.calls.slice(0, evidenceBudgets.callCount);
  const boundedFunction = boundedExcerpt(fn.source, evidenceBudgets.functionCharacters);
  const context: { [key: string]: JsonValue } = {
    evidence_boundary: includeSurroundingSource
      ? "bounded_file_excerpt"
      : "bounded_current_function",
  };
  let surroundingTruncated = false;
  if (includeSurroundingSource) {
    const surrounding = nearbySource(document.source, fn.range.start, fn.range.end);
    context["surrounding_source"] = surrounding.source;
    context["surrounding_range"] = surrounding.range;
    surroundingTruncated = surrounding.truncated;
  }
  return {
    language: document.language,
    imports: imports.map((entry) => boundedExcerpt(entry, evidenceBudgets.importCharacters).source),
    function: {
      name: fn.name ?? null,
      source: boundedFunction.source,
      calls: calls.map((call) => ({
        callee: call.callee,
        source: boundedExcerpt(call.source, evidenceBudgets.callCharacters).source,
      })),
    },
    context,
    evidence: {
      scope:
        "Only the bounded function, imports, calls, and optional same-file excerpt shown are evidence; hidden helpers and runtime contracts are unknown.",
      budgets: {
        function_characters: evidenceBudgets.functionCharacters,
        surrounding_characters: includeSurroundingSource
          ? evidenceBudgets.surroundingCharacters
          : 0,
        import_count: evidenceBudgets.importCount,
        import_characters_each: evidenceBudgets.importCharacters,
        call_count: evidenceBudgets.callCount,
        call_characters_each: evidenceBudgets.callCharacters,
      },
      truncation: {
        function_source: boundedFunction.truncated,
        file_excerpt: surroundingTruncated,
        imports:
          document.imports.length > imports.length ||
          imports.some((entry) => entry.length > evidenceBudgets.importCharacters),
        calls:
          fn.calls.length > calls.length ||
          calls.some((call) => call.source.length > evidenceBudgets.callCharacters),
      },
      totals: {
        function_characters: fn.source.length,
        file_characters: document.source.length,
        imports: document.imports.length,
        calls: fn.calls.length,
      },
    },
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

const nearbySource = (
  source: string,
  start: number,
  end: number,
): { source: string; range: { start: number; end: number }; truncated: boolean } => {
  const center = Math.floor((start + end) / 2);
  const excerptStart = Math.max(0, center - Math.floor(evidenceBudgets.surroundingCharacters / 2));
  const excerptEnd = Math.min(source.length, excerptStart + evidenceBudgets.surroundingCharacters);
  const adjustedStart = Math.max(0, excerptEnd - evidenceBudgets.surroundingCharacters);
  return {
    source: source.slice(adjustedStart, excerptEnd),
    range: { start: adjustedStart, end: excerptEnd },
    truncated: adjustedStart > 0 || excerptEnd < source.length,
  };
};

const boundedExcerpt = (
  source: string,
  maxCharacters: number,
): { source: string; truncated: boolean } => {
  if (source.length <= maxCharacters) {
    return { source, truncated: false };
  }
  const marker = "\n… evidence truncated …\n";
  const retained = maxCharacters - marker.length;
  const prefix = Math.ceil(retained / 2);
  return {
    source: `${source.slice(0, prefix)}${marker}${source.slice(source.length - (retained - prefix))}`,
    truncated: true,
  };
};

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean => {
  return patterns.some((pattern) => pattern.test(value));
};

const decisionOptions = (
  options: SecurityRuleOptions,
): {
  threshold: DecisionThreshold;
  minConfidence: number;
} => {
  return resolveDecisionOptions(options, {
    threshold: { warning: 0.9, error: 0.97 },
    minConfidence: 0.75,
  });
};

const diagnostic = (
  candidate: RuleCandidate,
  message: string,
  answer: ChoiceAnswer,
  finding: string,
  severity: "warning" | "error",
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    probability: answer.probabilities[finding] ?? 0,
    confidence: answer.confidence,
    severity,
  };
};
