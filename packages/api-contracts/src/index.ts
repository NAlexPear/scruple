import type {
  ApiBoundaryTarget,
  ChoiceAnswer,
  DecisionAnswer,
  DecisionRuleOptions,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export type ApiContractRuleOptions = DecisionRuleOptions;

export type ApiContractsPlugin = ScruplePlugin<{
  "no-misleading-function-names": RuleFactory<ApiContractRuleOptions>;
  "no-ambiguous-failure-contracts": RuleFactory<ApiContractRuleOptions>;
  "require-input-validation": RuleFactory<ApiContractRuleOptions>;
  "no-side-effects-in-safe-http-methods": RuleFactory<ApiContractRuleOptions>;
  "no-misleading-http-status": RuleFactory<ApiContractRuleOptions>;
}>;

const maxFunctionCharacters = 12_000;
const contextCharacters = 600;

export const apiContracts = (): ApiContractsPlugin => {
  return definePlugin({
    rules: {
      "no-misleading-function-names": noMisleadingFunctionNames,
      "no-ambiguous-failure-contracts": noAmbiguousFailureContracts,
      "require-input-validation": requireInputValidation,
      "no-side-effects-in-safe-http-methods": noSideEffectsInSafeHttpMethods,
      "no-misleading-http-status": noMisleadingHttpStatus,
    },
  });
};

const noMisleadingFunctionNames = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return choiceRule({
    description: "Function names should accurately describe behavior visible in their bodies.",
    options,
    defaults: { threshold: 0.9, minConfidence: 0.7 },
    select: namedFunctions,
    question: {
      instructions:
        "Does the function name make a concrete behavioral promise that its visible implementation contradicts? Judge direct effects, returned values, predicates, units, and clear operation verbs. Treat unfamiliar domain terminology, overloaded business verbs, thin delegation, and behavior hidden behind calls as ambiguous rather than misleading. Do not infer caller expectations or callee behavior that the evidence does not show.",
      criteria: {
        accurate_name:
          "The visible implementation is consistent with the concrete promise in the name.",
        misleading_name:
          "The visible implementation clearly performs or returns something contrary to a concrete promise in the name.",
        domain_specific_or_ambiguous:
          "The name uses domain language or has multiple reasonable meanings, so the visible code does not prove a contradiction.",
        insufficient_context:
          "The implementation delegates behavior or otherwise lacks enough visible evidence to judge the name.",
      },
    },
    finding: "misleading_name",
    message: "This function name appears to contradict its visible behavior.",
  });
};

const noAmbiguousFailureContracts = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return choiceRule({
    description: "Public functions should expose a coherent, distinguishable failure contract.",
    options,
    defaults: { threshold: 0.8, minConfidence: 0.7 },
    select: directlyExportedFunctions,
    question: {
      instructions:
        "Does this directly exported function visibly expose multiple overlapping or indistinguishable failure representations, such as nullable or sentinel returns mixed with Result/error values or thrown errors? Judge only its signature and implementation. Different channels are acceptable when their roles are visibly distinct (for example, a thrown programmer invariant and a Result for domain failure). Do not infer how callers interpret the contract.",
      criteria: {
        coherent_failure_contract:
          "The function has one failure representation, or visibly separates multiple representations by distinct roles.",
        ambiguous_failure_contract:
          "The function visibly represents overlapping failures through multiple channels without a clear distinction.",
        insufficient_context:
          "The visible signature and body do not establish the function's failure behavior or the roles of its channels.",
      },
    },
    finding: "ambiguous_failure_contract",
    message: "This exported function appears to expose an ambiguous failure contract.",
  });
};

const requireInputValidation = (options: ApiContractRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = resolveDecisionOptions(options, {
    threshold: 0.85,
    minConfidence: 0.7,
  });
  const question = {
    type: "choice" as const,
    instructions:
      "Does this visible API boundary use untrusted request or raw payload data without runtime validation? Treat the normalized request sources as untrusted. An attached inline framework schema is validation evidence only for the request parts it visibly covers. Captured middleware or referenced schemas whose behavior is not shown do not prove validation. Schema parsing, explicit guards, and validated domain types are counter-evidence. Type annotations and type assertions alone are not runtime validation. Choose insufficient_context when validation behavior or coverage is hidden.",
    criteria: {
      validation_present:
        "The visible handler validates or parses each used untrusted input before consequential use.",
      framework_validation_present:
        "An attached framework schema or middleware visibly validates every used request source before the handler uses it.",
      validation_required:
        "The boundary visibly uses untrusted request or raw payload data without visible runtime validation.",
      trusted_input:
        "The fallback function explicitly receives a validated or trusted domain value rather than raw boundary data.",
      insufficient_context:
        "Referenced schema, middleware, caller, or helper behavior is needed to establish validation or input trust.",
    },
  };
  return {
    description: "Untrusted API inputs should be validated before they are used.",
    collect(document) {
      const boundaries = (document.apiBoundaries ?? []).filter(
        (boundary) => boundary.requestSources.length > 0,
      );
      const representedHandlers = new Set(
        boundaries.map((boundary) => `${boundary.handlerRange.start}:${boundary.handlerRange.end}`),
      );
      const routeCandidates: RuleCandidate[] = boundaries.map((boundary) => ({
        target: boundary,
        state: boundaryState(boundary, document),
        question,
        data: { evidenceKind: "normalized_api_boundary" },
      }));
      const fallbackCandidates: RuleCandidate[] = explicitRawBoundaryFunctions(document)
        .filter(({ fn }) => !representedHandlers.has(`${fn.range.start}:${fn.range.end}`))
        .map(({ fn, exportEvidence }) => ({
          target: fn,
          state: functionState(fn, document, exportEvidence),
          question,
          data: { evidenceKind: "explicit_raw_export", exportEvidence: exportEvidence ?? "" },
        }));
      return [...routeCandidates, ...fallbackCandidates];
    },
    diagnose(answer, candidate) {
      return findingDiagnostic(
        answer,
        candidate,
        "validation_required",
        threshold,
        minConfidence,
        "This API boundary appears to use untrusted input without runtime validation.",
      );
    },
  };
};

const noSideEffectsInSafeHttpMethods = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return boundaryChoiceRule({
    description: "Safe HTTP methods should not implement requested state-changing behavior.",
    options,
    defaults: { threshold: 0.9, minConfidence: 0.75 },
    select: (document) =>
      (document.apiBoundaries ?? []).filter(
        (boundary) => safeHttpMethods.has(boundary.method) && hasPossibleStateChange(boundary),
      ),
    instructions:
      "Does this GET, HEAD, OPTIONS, or TRACE operation visibly perform a state change requested by the client? Distinguish the operation's intended effect from incidental logging, metrics, tracing, cache population, or audit recording. Do not infer effects hidden inside unfamiliar callees. Choose insufficient_context when a call name or incomplete handler evidence does not establish the effect.",
    criteria: {
      requested_side_effect:
        "The safe-method operation visibly creates, changes, deletes, charges, dispatches, publishes, or enqueues domain state as an intended request effect.",
      incidental_side_effect:
        "Visible writes are incidental logging, metrics, tracing, auditing, or cache maintenance rather than requested resource changes.",
      read_only: "The operation only reads or computes a response.",
      insufficient_context:
        "The supplied handler and call evidence does not establish whether the operation changes domain state.",
    },
    finding: "requested_side_effect",
    message: "This safe-method route appears to perform a requested state change.",
  });
};

const noMisleadingHttpStatus = (options: ApiContractRuleOptions = {}): SemanticRule => {
  return boundaryChoiceRule({
    description: "Explicit HTTP status codes should match the visible operation outcome.",
    options,
    defaults: { threshold: 0.9, minConfidence: 0.75 },
    select: (document) =>
      (document.apiBoundaries ?? []).filter((boundary) =>
        boundary.responseExits.some((exit) => exit.status !== undefined),
      ),
    instructions:
      "Does an explicitly emitted HTTP status code contradict the visible outcome on that response path? Judge standard status semantics together with the operation method, path, body, and visible control flow. 202 for accepted asynchronous work, 204 without content, and deliberate privacy-preserving 404 responses can be coherent. Do not invent framework defaults or outcomes hidden in callees, global error handlers, or middleware.",
    criteria: {
      aligned_status:
        "Each explicit status is consistent with the visible outcome and response body on its path.",
      misleading_status:
        "An explicit status clearly represents failure as success, success as the wrong outcome, or otherwise contradicts the visible response path.",
      deliberate_policy:
        "The unusual status is visibly explained by asynchronous processing, privacy policy, or another deliberate contract.",
      insufficient_context:
        "Hidden callee, middleware, framework, or error-handler behavior is needed to determine the outcome.",
    },
    finding: "misleading_status",
    message: "This route appears to emit an HTTP status that contradicts its visible outcome.",
  });
};

interface ChoiceRuleDefinition {
  description: string;
  options: ApiContractRuleOptions;
  defaults: { threshold: number; minConfidence: number };
  select(document: ParsedDocument): SelectedFunction[];
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  finding: string;
  message: string;
}

interface BoundaryChoiceRuleDefinition {
  description: string;
  options: ApiContractRuleOptions;
  defaults: { threshold: number; minConfidence: number };
  select(document: ParsedDocument): ApiBoundaryTarget[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  message: string;
}

interface SelectedFunction {
  fn: FunctionTarget;
  exportEvidence?: string;
}

const choiceRule = (definition: ChoiceRuleDefinition): SemanticRule => {
  const { threshold, minConfidence } = resolveDecisionOptions(
    definition.options,
    definition.defaults,
  );
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map(({ fn, exportEvidence }) => {
        const candidate: RuleCandidate = {
          target: fn,
          state: functionState(fn, document, exportEvidence),
          question: {
            type: "choice",
            instructions: definition.question.instructions,
            criteria: definition.question.criteria,
          },
        };
        if (exportEvidence !== undefined) {
          candidate.data = { exportEvidence };
        }
        return candidate;
      });
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, threshold, minConfidence)) {
        return null;
      }
      return diagnostic(
        candidate,
        definition.message,
        answer.probabilities[definition.finding] ?? 0,
        answer.confidence,
      );
    },
  };
};

const boundaryChoiceRule = (definition: BoundaryChoiceRuleDefinition): SemanticRule => {
  const { threshold, minConfidence } = resolveDecisionOptions(
    definition.options,
    definition.defaults,
  );
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map((boundary) => ({
        target: boundary,
        state: boundaryState(boundary, document),
        question: {
          type: "choice" as const,
          instructions: definition.instructions,
          criteria: definition.criteria,
        },
        data: { evidenceKind: "normalized_api_boundary" },
      }));
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, threshold, minConfidence)) {
        return null;
      }
      return diagnostic(
        candidate,
        definition.message,
        answer.probabilities[definition.finding] ?? 0,
        answer.confidence,
      );
    },
  };
};

const findingDiagnostic = (
  answer: DecisionAnswer,
  candidate: RuleCandidate,
  finding: string,
  threshold: number,
  minConfidence: number,
  message: string,
) => {
  if (!isFinding(answer, finding, threshold, minConfidence)) {
    return null;
  }
  return diagnostic(candidate, message, answer.probabilities[finding] ?? 0, answer.confidence);
};

const safeHttpMethods = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
const possibleStateChangePattern =
  /(?:^|\.)(?:add|append|charge|create|delete|destroy|dispatch|enqueue|insert|mutate|publish|remove|save|set|update|write)(?:$|[A-Z_])/u;
const incidentalCallRootPattern = /^(?:console|log|logger|metrics|reply|res|response)(?:\.|$)/u;

const hasPossibleStateChange = (boundary: ApiBoundaryTarget): boolean => {
  return boundary.calls.some(
    (call) =>
      possibleStateChangePattern.test(call.callee) && !incidentalCallRootPattern.test(call.callee),
  );
};

const explicitRawBoundaryFunctions = (document: ParsedDocument): SelectedFunction[] => {
  return directlyExportedFunctions(document).filter(({ fn }) => {
    const evidence = fn.source;
    return (
      /\bunknown\b/u.test(evidence) ||
      /\b(?:raw|payload|webhook)\b/iu.test(evidence) ||
      /\b(?:req|request)\s*\.\s*(?:body|cookies|headers|params|query|raw)\b/u.test(evidence)
    );
  });
};

const boundaryState = (boundary: ApiBoundaryTarget, document: ParsedDocument): JsonValue => ({
  language: document.language,
  imports: document.imports,
  apiBoundary: {
    framework: boundary.framework,
    method: boundary.method,
    path: boundary.path,
    registration: boundary.source,
    handler: boundary.handlerSource,
    requestSources: boundary.requestSources.map((source) => ({
      kind: source.kind,
      source: source.source,
    })),
    attachments: boundary.attachments.map((attachment) => ({
      kind: attachment.kind,
      source: attachment.source,
    })),
    responseExits: boundary.responseExits.map((exit) => ({
      kind: exit.kind,
      status: exit.status ?? null,
      body: exit.bodySource ?? null,
      headers: exit.headerSources,
      source: exit.source,
    })),
    calls: boundary.calls.map((call) => ({
      callee: call.callee,
      source: call.source,
    })),
    completeness: {
      handler: boundary.completeness.handler,
      requestSources: boundary.completeness.requestSources,
      attachments: boundary.completeness.attachments,
      responseExits: boundary.completeness.responseExits,
      reasons: boundary.completeness.reasons,
    },
  },
  evidenceLimitations: [
    "Only this route registration and a locally resolvable handler are shown.",
    "Attached middleware and referenced schemas are captured but their behavior is not resolved.",
    "Callee effects, mounted routers, plugins, global hooks, and global error handling are not established.",
  ],
});

const namedFunctions = (document: ParsedDocument): SelectedFunction[] => {
  return document.functions.flatMap((fn) => {
    if (!isBoundedImplementation(fn) || fn.name === undefined || fn.name.length === 0) {
      return [];
    }
    const exportEvidence = directExportEvidence(fn, document);
    return [{ fn, ...(exportEvidence === undefined ? {} : { exportEvidence }) }];
  });
};

const directlyExportedFunctions = (document: ParsedDocument): SelectedFunction[] => {
  return document.functions.flatMap((fn) => {
    if (!isBoundedImplementation(fn)) {
      return [];
    }
    const exportEvidence = directExportEvidence(fn, document);
    return exportEvidence === undefined ? [] : [{ fn, exportEvidence }];
  });
};

const isBoundedImplementation = (fn: FunctionTarget): boolean => {
  return (
    fn.kind === "function" && fn.source.length > 0 && fn.source.length <= maxFunctionCharacters
  );
};

const directExportEvidence = (fn: FunctionTarget, document: ParsedDocument): string | undefined => {
  const prefixStart = Math.max(0, fn.range.start - 300);
  const prefix = document.source.slice(prefixStart, fn.range.start);
  const declaration = prefix.match(/(?:^|[;}\n])\s*(export\s+(?:default\s+)?)$/u)?.[1];
  if (declaration !== undefined) {
    return declaration.trim();
  }
  const variable = prefix.match(/(?:^|[;}\n])\s*(export\s+(?:const|let|var)\s+[^;\n]*=\s*)$/u)?.[1];
  return variable?.trim();
};

const functionState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  exportEvidence: string | undefined,
): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    function: {
      name: fn.name ?? null,
      async: fn.async,
      source: fn.source,
      calls: fn.calls.map((call) => call.callee),
    },
    public_contract: {
      directly_exported: exportEvidence !== undefined,
      evidence: exportEvidence ?? null,
      limitation:
        "This file does not establish all callers, call-site validation, middleware, or behavior inside callees.",
    },
    surrounding_code: document.source.slice(
      Math.max(0, fn.range.start - contextCharacters),
      Math.min(document.source.length, fn.range.end + contextCharacters),
    ),
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
  probability: number,
  confidence: number,
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    probability,
    confidence,
  };
};
