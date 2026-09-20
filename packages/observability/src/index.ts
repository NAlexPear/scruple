import type {
  CallCapture,
  ChoiceAnswer,
  CodeTarget,
  DecisionAnswer,
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleCandidate,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
  SourceLocation,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export interface ObservabilityRuleOptions {
  threshold?: number;
  minConfidence?: number;
  loggingCallPatterns?: RegExp[];
  telemetryCallPatterns?: RegExp[];
}

export type ObservabilityPlugin = ScruplePlugin<{
  "no-sensitive-logs": RuleFactory<ObservabilityRuleOptions>;
  "no-unactionable-errors": RuleFactory<ObservabilityRuleOptions>;
  "require-operation-context": RuleFactory<ObservabilityRuleOptions>;
}>;

type CallKind = "log" | "error_log" | "telemetry" | "exception_telemetry";

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
const errorLogPattern = /(?:^|\.)(?:error|fatal)$/iu;
const exceptionTelemetryPattern = /(?:^|\.)(?:captureException|recordException)$/u;

export const observability = (): ObservabilityPlugin => {
  return definePlugin({
    rules: {
      "no-sensitive-logs": noSensitiveLogs,
      "no-unactionable-errors": noUnactionableErrors,
      "require-operation-context": requireOperationContext,
    },
  });
};

const noSensitiveLogs = (options: ObservabilityRuleOptions = {}): SemanticRule => {
  return makeChoiceRule(options, {
    description: "Logs and telemetry should not expose sensitive values.",
    select: (calls) => calls,
    instructions:
      "Does this selected logging or telemetry call directly emit a visibly sensitive value without effective redaction? Judge only evidence visible in `call` and `context`. Sensitive values include credentials, authentication/session material, private keys, financial account data, and personal data whose disclosure is clearly inappropriate here. A field name alone does not prove its runtime value is sensitive. Structured logging is not automatically safe. Treat explicit masking, allowlisting, hashing intended for disclosure control, or a visibly redacted value as safe. If safety depends on an unseen helper or runtime logger configuration, choose insufficient_context.",
    criteria: {
      exposed_sensitive_value:
        "The call visibly emits sensitive data or a secret-bearing object/value without effective redaction.",
      safe_or_redacted:
        "The emitted values are non-sensitive, explicitly redacted or allowlisted, or safely represented for this use.",
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
      "Is this error-level log or exception telemetry event unactionable from the visible call and local context? An actionable event identifies the failed operation and preserves useful failure evidence such as the error/cause, stack-bearing exception, reason, or relevant structured dimensions. Do not require sensitive payloads, every possible identifier, or a remediation instruction. A wrapper is actionable only when its visible arguments establish that it receives the needed context. Choose insufficient_context when an unseen helper, formatter, or logger enrichment is essential to decide.",
    criteria: {
      actionable:
        "The event identifies the failed operation and includes useful failure evidence or clearly passes both to a visible wrapper.",
      unactionable:
        "The event is generic or omits either the failed operation or useful failure evidence needed to investigate it.",
      insufficient_context:
        "The event may be enriched or formatted by code not present in the bounded evidence.",
    },
    finding: "unactionable",
    message: "This error event lacks actionable operation or failure context.",
    defaultThreshold: 0.85,
  });
};

const requireOperationContext = (options: ObservabilityRuleOptions = {}): SemanticRule => {
  return makeChoiceRule(options, {
    description: "Log and telemetry events should identify the operation they describe.",
    select: (calls) => calls.filter((entry) => !isAttributeCall(entry.call.callee)),
    instructions:
      "Does this log or telemetry event omit a stable, meaningful operation identity? Operation context may be an event/action/operation field or a specific message naming what started, completed, or failed. Request, trace, and entity identifiers are useful dimensions but do not by themselves identify the operation. Do not infer operation context solely from the enclosing function name because that context may not survive in emitted data. Choose insufficient_context when a visible wrapper argument or local event constant may supply the operation but its value is not shown.",
    criteria: {
      operation_present:
        "The emitted event directly names the operation in a specific message or structured field.",
      operation_missing:
        "The emitted event is generic or contains only identifiers/status without naming the operation.",
      insufficient_context:
        "The bounded evidence does not show whether an argument or wrapper supplies operation identity.",
    },
    finding: "operation_missing",
    message: "This observability event does not identify the operation it describes.",
    defaultThreshold: 0.8,
  });
};

const makeChoiceRule = (
  options: ObservabilityRuleOptions,
  definition: ChoiceRuleDefinition,
): SemanticRule => {
  const threshold = options.threshold ?? definition.defaultThreshold;
  const minConfidence = options.minConfidence ?? 0.7;
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
  return document.functions.flatMap((fn) =>
    fn.calls.flatMap((call): SelectedCall[] => {
      if (matchesAny(call.callee, loggingPatterns)) {
        return [{ call, fn, kind: errorLogPattern.test(call.callee) ? "error_log" : "log" }];
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
