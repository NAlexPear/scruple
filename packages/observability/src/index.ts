import type {
  CallCapture,
  ChoiceAnswer,
  CodeTarget,
  DecisionAnswer,
  DecisionRuleOptions,
  ErrorHandlerTarget,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
  SourceLocation,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export interface ObservabilityRuleOptions extends DecisionRuleOptions {
  loggingCallPatterns?: RegExp[];
  telemetryCallPatterns?: RegExp[];
  telemetryNameCallPatterns?: RegExp[];
}

export type ObservabilityPlugin = ScruplePlugin<{
  "no-sensitive-logs": RuleFactory<ObservabilityRuleOptions>;
  "no-unactionable-errors": RuleFactory<ObservabilityRuleOptions>;
  "require-operation-context": RuleFactory<ObservabilityRuleOptions>;
  "require-stable-telemetry-names": RuleFactory<ObservabilityRuleOptions>;
  "no-duplicate-error-reporting": RuleFactory<ObservabilityRuleOptions>;
}>;

type CallKind =
  | "log"
  | "diagnostic_log"
  | "error_log"
  | "telemetry"
  | "telemetry_name"
  | "exception_telemetry";

interface SelectedCall {
  call: CallCapture;
  fn: FunctionTarget;
  kind: CallKind;
}

interface ChoiceRuleDefinition {
  description: string;
  select(calls: SelectedCall[]): SelectedCall[];
  instructions: string;
  criteria: Record<string, JsonValue>;
  finding: string;
  message: string;
  defaultThreshold: number;
}

const defaultLoggingCallPatterns = [
  /^console\.(?:debug|error|info|log|trace|warn)$/u,
  /(?:^|\.)(?:log|[a-zA-Z]*Logger)\.(?:debug|error|fatal|info|log|trace|warn)$/iu,
];
const defaultTelemetryCallPatterns = [
  /(?:^|\.)(?:addEvent|captureException|captureMessage|recordException|trackEvent)$/u,
  /(?:^|\.)(?:setAttribute|setAttributes)$/u,
];
const defaultTelemetryNameCallPatterns = [
  /(?:^|\.)(?:addEvent|startActiveSpan|startSpan|trackEvent)$/u,
  /(?:^|\.)(?:createCounter|createGauge|createHistogram|createObservableCounter|createObservableGauge|createObservableUpDownCounter|createUpDownCounter)$/u,
];
const diagnosticLogPattern = /(?:^|\.)(?:debug|trace)$/iu;
const errorLogPattern = /(?:^|\.)(?:error|fatal)$/iu;
const exceptionTelemetryPattern = /(?:^|\.)(?:captureException|recordException)$/u;
const errorReportingPattern =
  /(?:^|\.)(?:captureException|error|fatal|recordException|reportException)$/iu;
const operationalCallPattern =
  /\b(?:action|event|operation|outcome|result|status)\s*[:=]|\b(?:cancel(?:led)?|complet(?:e|ed)|den(?:y|ied)|fail(?:ed|ure)?|retri(?:ed|es|ed)|start(?:ed)?|succeed(?:ed)?)\b/iu;

export const observability = (): ObservabilityPlugin => {
  return definePlugin({
    rules: {
      "no-sensitive-logs": noSensitiveLogs,
      "no-unactionable-errors": noUnactionableErrors,
      "require-operation-context": requireOperationContext,
      "require-stable-telemetry-names": requireStableTelemetryNames,
      "no-duplicate-error-reporting": noDuplicateErrorReporting,
    },
  });
};

const noSensitiveLogs = (options: ObservabilityRuleOptions = {}): SemanticRule => {
  return makeChoiceRule(options, {
    description: "Observability emissions should not expose sensitive values.",
    select: (calls) => calls,
    instructions:
      "Does this selected log, event, span, metric, or attribute call directly emit a visibly sensitive value without effective redaction? Judge only evidence visible in `call` and `context`. Sensitive values include credentials, authentication/session material, private keys, financial account data, sensitive URL or header contents, and personal data whose disclosure is clearly inappropriate here. A field name alone does not prove its runtime value is sensitive, and structured telemetry is not automatically safe. Treat explicit masking, allowlisting, or a visibly redacted value as safe. Hashing or pseudonymization is safe only when the visible evidence establishes that the representation is suitable for disclosure; low-entropy values and policy-dependent personal data otherwise require insufficient_context. If safety depends on an unseen helper, logger/exporter redaction, or runtime configuration, choose insufficient_context.",
    criteria: {
      exposed_sensitive_value:
        "The call visibly emits sensitive data or a secret-bearing object/value without effective redaction.",
      safe_or_redacted:
        "The emitted values are non-sensitive, explicitly redacted or allowlisted, or visibly represented safely for this use.",
      insufficient_context:
        "The available source does not establish what is emitted or whether an unseen boundary redacts it.",
    },
    finding: "exposed_sensitive_value",
    message: "This observability call appears to expose a sensitive value without redaction.",
    defaultThreshold: 0.9,
  });
};

const noUnactionableErrors = (options: ObservabilityRuleOptions = {}): SemanticRule => {
  return makeChoiceRule(options, {
    description: "Error events should contain enough visible evidence to support investigation.",
    select: (calls) =>
      calls.filter((entry) => entry.kind === "error_log" || entry.kind === "exception_telemetry"),
    instructions:
      "Is this error-level log or exception telemetry event unactionable from the visible call and local context? A nonstandard error event is actionable when it identifies the failed operation and preserves useful failure evidence such as the error/cause, stack-bearing exception, reason, or relevant structured dimensions. A standardized exception API that visibly receives the exception already preserves useful failure evidence; do not call it unactionable merely because it does not repeat an operation name in prose. If its operation identity depends on an active span, event name, logger scope, framework enrichment, helper, formatter, or runtime configuration not established by the bounded evidence, choose insufficient_context rather than unactionable. Do not require sensitive payloads, every possible identifier, or a remediation instruction.",
    criteria: {
      actionable:
        "The event visibly identifies the failure and preserves useful evidence, including a standardized exception API with adequate visible operation context.",
      unactionable:
        "The event is visibly generic or a nonstandard event omits the failed operation or useful failure evidence needed to investigate it.",
      insufficient_context:
        "The event's operation identity or evidence may come from an unseen span, scope, helper, formatter, or runtime enrichment.",
    },
    finding: "unactionable",
    message: "This error event lacks actionable operation or failure context.",
    defaultThreshold: 0.85,
  });
};

const requireOperationContext = (options: ObservabilityRuleOptions = {}): SemanticRule => {
  return makeChoiceRule(options, {
    description: "Operational, outcome, audit, and error events should identify their operation.",
    select: (calls) => calls.filter((entry) => isOperationContextCandidate(entry)),
    instructions:
      "Does this selected operational, outcome, audit, or error event omit a stable, meaningful operation identity? Operation context may be an event/action/operation field or a specific message naming what started, completed, or failed. Request, trace, and entity identifiers are useful dimensions but do not by themselves identify the operation. Ordinary diagnostic prose does not need to repeat an operation name and is outside this rule's intent. Do not infer emitted context solely from the enclosing function name. Choose insufficient_context when a scope, active span, logger enrichment, visible wrapper argument, local event constant, or runtime configuration may supply operation identity but the bounded evidence does not establish it.",
    criteria: {
      operation_present:
        "The emitted event directly names the operation in a specific message or structured field.",
      operation_missing:
        "The emitted event is generic or contains only identifiers/status without naming the operation.",
      insufficient_context:
        "The bounded evidence does not show whether a scope, span, enrichment layer, argument, or wrapper supplies operation identity.",
    },
    finding: "operation_missing",
    message: "This observability event does not identify the operation it describes.",
    defaultThreshold: 0.8,
  });
};

const requireStableTelemetryNames = (options: ObservabilityRuleOptions = {}): SemanticRule => {
  return makeChoiceRule(options, {
    description: "Event, span, and metric names should be stable and low-cardinality.",
    select: (calls) => calls.filter((entry) => entry.kind === "telemetry_name"),
    instructions:
      "Does this event, span, or metric call use an occurrence-specific or unbounded telemetry name? Names should identify a stable event structure, operation, or instrument. Dynamic identifiers, timestamps, random values, raw URL paths, and error messages belong in attributes rather than names. A route template, bounded enum, or finite documented category can be stable even when assembled dynamically. Judge only the visible call and local context. Choose insufficient_context when a constant, helper, route value, or enum domain is not visible enough to establish cardinality.",
    criteria: {
      stable_low_cardinality:
        "The telemetry name is a stable literal, route template, or visibly bounded category.",
      dynamic_unbounded:
        "The telemetry name visibly includes an occurrence-specific identifier or other unbounded value.",
      insufficient_context:
        "The bounded evidence does not establish whether the name source has a finite stable domain.",
    },
    finding: "dynamic_unbounded",
    message: "This telemetry name appears to contain an unbounded dynamic value.",
    defaultThreshold: 0.9,
  });
};

const noDuplicateErrorReporting = (options: ObservabilityRuleOptions = {}): SemanticRule => {
  const { threshold, minConfidence } = resolveDecisionOptions(options, {
    threshold: 0.9,
    minConfidence: 0.7,
  });
  return {
    description: "The same exception should not be reported repeatedly in one error boundary.",
    collect(document) {
      return document.errorHandlers.flatMap((handler) => {
        const duplicateCalls = selectedDuplicateReportingCalls(handler);
        const targetCall = duplicateCalls.at(-1);
        if (targetCall === undefined) {
          return [];
        }
        return [
          {
            target: callTarget(targetCall, document),
            state: duplicateErrorState(handler, duplicateCalls, document),
            data: {
              binding: handler.binding ?? null,
              reporting_calls: duplicateCalls.map((call) => call.callee),
            },
            question: {
              type: "choice" as const,
              instructions:
                "Do these calls report the same exception more than once within this error boundary? Treat direct logging plus exception capture, or repeated capture, of the same visible catch binding as duplicate unless the calls clearly represent distinct failures. A rethrow by itself is not another report. Choose insufficient_context when aliases obscure exception identity, a wrapper's behavior is unseen, or compatibility/migration dual emission may be intentional but its policy is not visible. Do not infer that an upstream layer records a rethrown exception unless that reporting behavior is present in the bounded evidence.",
              criteria: {
                duplicate_same_exception:
                  "Multiple visible sinks report the same exception without a visible distinct purpose or policy.",
                single_or_distinct:
                  "The exception is reported once, or the calls visibly report distinct failures or non-duplicative summaries.",
                insufficient_context:
                  "Exception identity, wrapper behavior, or an intentional dual-emission policy is not established by the bounded evidence.",
              },
            },
          },
        ];
      });
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, "duplicate_same_exception", threshold, minConfidence)) {
        return null;
      }
      return diagnostic(
        candidate,
        "This exception appears to be reported more than once in the same error boundary.",
        answer,
        "duplicate_same_exception",
      );
    },
  };
};

const makeChoiceRule = (
  options: ObservabilityRuleOptions,
  definition: ChoiceRuleDefinition,
): SemanticRule => {
  const { threshold, minConfidence } = resolveDecisionOptions(options, {
    threshold: definition.defaultThreshold,
    minConfidence: 0.7,
  });
  return {
    description: definition.description,
    collect(document) {
      return definition.select(selectCalls(document, options)).map((entry) => ({
        target: callTarget(entry.call, document),
        state: callState(entry, document),
        data: { callee: entry.call.callee, kind: entry.kind },
        question: {
          type: "choice" as const,
          instructions: definition.instructions,
          criteria: definition.criteria,
        },
      }));
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, threshold, minConfidence)) {
        return null;
      }
      return diagnostic(candidate, definition.message, answer, definition.finding);
    },
  };
};

const selectCalls = (
  document: ParsedDocument,
  options: ObservabilityRuleOptions,
): SelectedCall[] => {
  const loggingPatterns = options.loggingCallPatterns ?? defaultLoggingCallPatterns;
  const telemetryPatterns = options.telemetryCallPatterns ?? defaultTelemetryCallPatterns;
  const telemetryNamePatterns =
    options.telemetryNameCallPatterns ?? defaultTelemetryNameCallPatterns;
  return document.functions.flatMap((fn) =>
    fn.calls.flatMap((call): SelectedCall[] => {
      if (matchesAny(call.callee, loggingPatterns)) {
        const kind = errorLogPattern.test(call.callee)
          ? "error_log"
          : diagnosticLogPattern.test(call.callee)
            ? "diagnostic_log"
            : "log";
        return [{ call, fn, kind }];
      }
      if (matchesAny(call.callee, telemetryNamePatterns)) {
        return [{ call, fn, kind: "telemetry_name" }];
      }
      if (matchesAny(call.callee, telemetryPatterns)) {
        return [
          {
            call,
            fn,
            kind: exceptionTelemetryPattern.test(call.callee) ? "exception_telemetry" : "telemetry",
          },
        ];
      }
      return [];
    }),
  );
};

const isOperationContextCandidate = (entry: SelectedCall): boolean => {
  if (isAttributeCall(entry.call.callee) || entry.kind === "diagnostic_log") {
    return false;
  }
  if (
    entry.kind === "error_log" ||
    entry.kind === "exception_telemetry" ||
    entry.kind === "telemetry_name"
  ) {
    return true;
  }
  return operationalCallPattern.test(entry.call.source);
};

const selectedDuplicateReportingCalls = (handler: ErrorHandlerTarget): CallCapture[] => {
  if (handler.binding === undefined) {
    return [];
  }
  const bindingPattern = new RegExp(`\\b${escapeRegExp(handler.binding)}\\b`, "u");
  const calls = handler.calls.filter((call) => {
    errorReportingPattern.lastIndex = 0;
    return errorReportingPattern.test(call.callee) && bindingPattern.test(call.source);
  });
  return calls.length >= 2 ? calls : [];
};

const duplicateErrorState = (
  handler: ErrorHandlerTarget,
  calls: CallCapture[],
  document: ParsedDocument,
): JsonValue => {
  return {
    language: document.language,
    imports: document.imports.slice(0, 10).map((source) => boundedExcerpt(source, 200)),
    catch_binding: handler.binding ?? null,
    try_block: boundedExcerpt(handler.trySource, 1_500),
    catch_body: boundedExcerpt(handler.bodySource, 2_000),
    reporting_calls: calls.map((call) => ({
      callee: boundedExcerpt(call.callee, 300),
      source: boundedExcerpt(call.source, 1_000),
    })),
    exits: handler.exits.map((exit) => ({
      kind: exit.kind,
      source: boundedExcerpt(exit.source, 500),
    })),
    enclosing_context:
      handler.enclosingSource === undefined ? null : boundedExcerpt(handler.enclosingSource, 2_000),
  };
};

const escapeRegExp = (value: string): string => {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
};

const callState = (entry: SelectedCall, document: ParsedDocument): JsonValue => {
  return {
    language: document.language,
    imports: document.imports.slice(0, 10).map((source) => boundedExcerpt(source, 200)),
    sink: { callee: boundedExcerpt(entry.call.callee, 300), kind: entry.kind },
    call: boundedExcerpt(entry.call.source, 2_000),
    context: boundedContext(document.source, entry.call.range.start, entry.call.range.end),
    enclosing_function: entry.fn.name === undefined ? null : boundedExcerpt(entry.fn.name, 200),
  };
};

const boundedContext = (source: string, start: number, end: number): string => {
  const radius = 750;
  const before = source.slice(Math.max(0, start - radius), start);
  const after = source.slice(end, Math.min(source.length, end + radius));
  return `${before}\n… selected call …\n${after}`;
};

const boundedExcerpt = (source: string, maxCharacters: number): string => {
  if (source.length <= maxCharacters) {
    return source;
  }
  const marker = "\n… excerpt truncated …\n";
  const retained = maxCharacters - marker.length;
  const prefix = Math.ceil(retained / 2);
  return `${source.slice(0, prefix)}${marker}${source.slice(source.length - (retained - prefix))}`;
};

const callTarget = (call: CallCapture, document: ParsedDocument): CodeTarget => {
  return {
    kind: "expression",
    filename: document.filename,
    language: document.language,
    range: call.range,
    location: locate(document.source, call.range.start, call.range.end),
    source: call.source,
  };
};

const locate = (source: string, start: number, end: number): SourceLocation => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return { start: positionAt(starts, start), end: positionAt(starts, end) };
};

const positionAt = (starts: number[], offset: number): { line: number; column: number } => {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle]! <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const line = Math.max(0, high);
  return { line: line + 1, column: offset - starts[line]! + 1 };
};

const matchesAny = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
};

const isAttributeCall = (callee: string): boolean => {
  return /(?:^|\.)(?:setAttribute|setAttributes)$/u.test(callee);
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
