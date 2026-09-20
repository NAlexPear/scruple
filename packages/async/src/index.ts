import type {
  CallCapture,
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

export interface AsyncRuleOptions {
  threshold?: number;
  minConfidence?: number;
  /** Functions larger than this are skipped rather than evaluated with incomplete source. */
  maxFunctionCharacters?: number;
  /** Maximum total import-source characters included in model evidence. */
  maxImportCharacters?: number;
  /** Maximum call sites included in model evidence. Selection still examines every call. */
  maxCallSites?: number;
}

export type AsyncPlugin = ScruplePlugin<{
  "no-unbounded-concurrency": RuleFactory<AsyncRuleOptions>;
  "no-serial-independent-work": RuleFactory<AsyncRuleOptions>;
  "require-cancellation-propagation": RuleFactory<AsyncRuleOptions>;
  "require-race-loser-cleanup": RuleFactory<AsyncRuleOptions>;
  "require-abort-listener-cleanup": RuleFactory<AsyncRuleOptions>;
}>;

const promiseFanOutCallees = new Set(["Promise.all", "Promise.allSettled", "Promise.any"]);
const promiseRaceCallees = new Set(["Promise.any", "Promise.race"]);
const cancellablePlatformCallees = new Set(["fetch", "globalThis.fetch", "window.fetch"]);

export const asyncRules = (): AsyncPlugin => {
  return definePlugin({
    rules: {
      "no-unbounded-concurrency": noUnboundedConcurrency,
      "no-serial-independent-work": noSerialIndependentWork,
      "require-cancellation-propagation": requireCancellationPropagation,
      "require-race-loser-cleanup": requireRaceLoserCleanup,
      "require-abort-listener-cleanup": requireAbortListenerCleanup,
    },
  });
};

const noUnboundedConcurrency = (options: AsyncRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, 0.9, 0.7);
  return choiceRule(resolved, {
    description: "Concurrent work should have a bound when its input size is not bounded.",
    select: (document) =>
      selectFunctions(document, resolved, (fn) =>
        nativePromiseCalls(fn, document, promiseFanOutCallees),
      ),
    question: {
      instructions:
        "Does this function visibly create and start one asynchronous operation per element of a collection whose cardinality this function or its visible contract leaves unbounded? Use only the supplied function-local evidence. Do not treat a collection as unbounded merely because its bound may exist in a hidden caller. An exported unconstrained collection parameter can establish that this boundary itself permits arbitrary cardinality; a private parameter with unknown provenance cannot. Do not object to fixed-size tuples, explicit slices or batches, concurrency limiters, small intentional fan-out, or arrays of promises created elsewhere. Choose `insufficient_context` when operation creation, provenance, or the effective bound is hidden.",
      criteria: {
        unbounded_concurrency:
          "The function visibly creates one operation per element and its visible producer or public contract admits arbitrary cardinality without a limit.",
        bounded_or_intentional:
          "The fan-out has a visible fixed bound, uses batching or a limiter, is a small deliberate set of operations, or only observes promises already created elsewhere.",
        insufficient_context:
          "The evidence does not establish operation creation, collection provenance, or whether a hidden caller or abstraction enforces a bound.",
      },
    },
    finding: "unbounded_concurrency",
    message: "This function appears to start an unbounded number of concurrent operations.",
  });
};

const noSerialIndependentWork = (options: AsyncRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, 0.9, 0.7);
  return choiceRule(resolved, {
    description: "Independent asynchronous work should not wait in series.",
    select: (document) =>
      selectFunctions(document, resolved, (fn) =>
        fn.async && directlyAwaitedCalls(fn).length >= 2 ? directlyAwaitedCalls(fn) : [],
      ),
    question: {
      instructions:
        "Does this function unnecessarily await independent operations in series? Require clear local evidence that starting at least two directly awaited operations together preserves results, side effects, failure ordering, whether later work runs after an earlier failure, resource limits, transactions, locks, rate limits, and required ordering. Locally normalized failures or known non-failing operations can establish compatible failure behavior. A later call using an earlier result is dependent. Choose `insufficient_context` rather than infer effects or failure contracts hidden behind callees.",
      criteria: {
        serial_independent_work:
          "At least two directly awaited operations are visibly independent and starting them together preserves observable success, failure, and side-effect behavior.",
        ordering_required:
          "Data dependency, side effects, error semantics, a transaction, resource control, or an explicit constraint requires or reasonably justifies the sequence.",
        insufficient_context:
          "The function does not establish enough about callee effects or failure behavior to prove that concurrent execution preserves behavior.",
      },
    },
    finding: "serial_independent_work",
    message: "These independent asynchronous operations appear to wait in series.",
  });
};

const requireCancellationPropagation = (options: AsyncRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, 0.9, 0.7);
  return choiceRule(resolved, {
    description: "Functions accepting cancellation should propagate it to cancellable work.",
    select: (document) =>
      selectFunctions(document, resolved, (fn) =>
        /\bAbortSignal\b/u.test(fn.source)
          ? fn.calls.filter((call) => isCancellablePlatformCall(call.callee, fn, document))
          : [],
      ),
    question: {
      instructions:
        "Does this function accept an AbortSignal but fail to pass caller cancellation to a recognized cancellable platform operation? Treat direct or options-object forwarding as propagation. A composed signal is safe only when it visibly includes the caller signal, such as AbortSignal.any([signal, AbortSignal.timeout(...)]); replacing the caller signal with a new controller or timeout drops caller cancellation. Do not diagnose APIs without a visible cancellation contract, purely synchronous work, or legitimate local-only handling. Choose `insufficient_context` when signal identity or forwarding is hidden.",
      criteria: {
        cancellation_not_propagated:
          "A recognized cancellable operation is called without the accepted signal or a visible composition containing it.",
        cancellation_propagated_or_unavailable:
          "Caller cancellation is forwarded directly or through visible composition, or cancellation is legitimately consumed only by local work.",
        insufficient_context:
          "The available evidence does not establish signal identity or whether an abstraction forwards cancellation.",
      },
    },
    finding: "cancellation_not_propagated",
    message: "This function accepts cancellation but does not propagate it to cancellable work.",
  });
};

const requireRaceLoserCleanup = (options: AsyncRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, 0.9, 0.7);
  return choiceRule(resolved, {
    description:
      "Locally started race losers should be canceled or cleaned up when they retain work.",
    select: (document) =>
      selectFunctions(document, resolved, (fn) =>
        nativePromiseCalls(fn, document, promiseRaceCallees),
      ),
    question: {
      instructions:
        "Does this Promise.race or Promise.any visibly start competing operations locally and abandon a losing operation that continues resourceful or externally observable work after the winner settles? These combinators do not cancel losers. Diagnose only when local evidence establishes both loser ownership and retained work, and no abort, clear, dispose, close, or finally cleanup covers it. Treat caller-owned or already-started promises, harmless finite computations, shared work intentionally allowed to continue, and visible cancellation/cleanup as safe. Choose `insufficient_context` whenever contender ownership, lifetime, effects, or helper cleanup is hidden.",
      criteria: {
        race_loser_abandoned:
          "The function locally starts a contender whose resourceful or side-effectful work can outlive winner settlement without visible cancellation or cleanup.",
        loser_cleanup_present:
          "Visible cancellation, cleanup, or disposal prevents locally owned losing work from being abandoned.",
        harmless_or_externally_owned:
          "Losers are harmless finite work, intentionally continue, or were created and remain owned outside this function.",
        insufficient_context:
          "The evidence does not establish contender ownership, post-settlement lifetime, effects, or cleanup behavior.",
      },
    },
    finding: "race_loser_abandoned",
    message: "Cancel or clean up locally owned work that loses this promise race.",
  });
};

const requireAbortListenerCleanup = (options: AsyncRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, 0.9, 0.7);
  return choiceRule(resolved, {
    description: "Abort listeners should not outlive the operation that registered them.",
    select: (document) =>
      selectFunctions(document, resolved, (fn) =>
        /\bAbortSignal\b/u.test(fn.source) ? fn.calls.filter(isAbortListenerCall) : [],
      ),
    question: {
      instructions:
        "Can an abort listener registered by this function remain attached after the operation that owns the listener finishes? Diagnose only when the signal is visibly caller-owned or longer-lived and there is no `{ once: true }`, explicit remove/dispose, finally cleanup, or other visible lifetime bound. `{ once: true }` removes the listener when abort fires; explicit settled-path cleanup is stronger when the operation may finish without abort. Do not infer leaks for operation-owned signals or hidden ownership. Choose `insufficient_context` when signal lifetime, listener identity, operation completion, or cleanup is outside this function.",
      criteria: {
        abort_listener_may_leak:
          "A listener is attached to a visibly longer-lived signal without once-only registration or cleanup tied to operation completion.",
        listener_cleanup_present:
          "The listener is once-only, explicitly removed or disposed, or cleanup is visibly guaranteed when the operation finishes.",
        bounded_or_operation_owned:
          "The signal and listener share a visibly bounded operation lifetime, so the listener cannot outlive its owner.",
        insufficient_context:
          "The evidence does not establish signal ownership, listener lifetime, or cleanup behavior.",
      },
    },
    finding: "abort_listener_may_leak",
    message: "Ensure this abort listener is removed when its operation finishes.",
  });
};

interface ChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): SelectedFunction[];
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
  finding: string;
  message: string;
}

interface ResolvedOptions {
  threshold: number;
  minConfidence: number;
  maxFunctionCharacters: number;
  maxImportCharacters: number;
  maxCallSites: number;
}

interface SelectedFunction {
  target: FunctionTarget;
  evidenceCalls: CallCapture[];
}

interface BoundedImports {
  values: string[];
  truncated: boolean;
}

const choiceRule = (options: ResolvedOptions, definition: ChoiceRuleDefinition): SemanticRule => {
  return {
    description: definition.description,
    collect(document) {
      return definition.select(document).map(({ target, evidenceCalls }) => {
        const imports = boundedImports(document.imports, options.maxImportCharacters);
        const calls = target.calls
          .toSorted((left, right) => left.range.start - right.range.start)
          .slice(0, options.maxCallSites);
        return {
          target,
          state: functionState(target, document, imports, calls),
          data: {
            selected_callees: evidenceCalls.map((call) => call.callee),
            function_characters: target.source.length,
            total_imports: document.imports.length,
            total_calls: target.calls.length,
            imports_truncated: imports.truncated,
            calls_truncated: calls.length < target.calls.length,
          },
          question: {
            type: "choice" as const,
            instructions: definition.question.instructions,
            criteria: definition.question.criteria,
          },
        };
      });
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, options.threshold, options.minConfidence)) {
        return null;
      }
      return diagnostic(candidate, definition.message, {
        probability: answer.probabilities[definition.finding] ?? 0,
        confidence: answer.confidence,
      });
    },
  };
};

const functionState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  imports: BoundedImports,
  calls: readonly CallCapture[],
): JsonValue => {
  return {
    language: document.language,
    imports: imports.values,
    imports_truncated: imports.truncated,
    function: fn.source,
    calls: calls.map((call) => ({ callee: call.callee, source: call.source })),
    calls_truncated: calls.length < fn.calls.length,
    evidence_scope:
      "Bounded function-local source, imports, and calls only; unknown caller, callee, ownership, lifetime, and runtime behavior is not evidence.",
  };
};

const selectFunctions = (
  document: ParsedDocument,
  options: ResolvedOptions,
  selectCalls: (fn: FunctionTarget) => CallCapture[],
): SelectedFunction[] => {
  return document.functions
    .filter(
      (fn) =>
        fn.kind === "function" &&
        fn.source.length > 0 &&
        fn.source.length <= options.maxFunctionCharacters,
    )
    .toSorted((left, right) => left.range.start - right.range.start)
    .flatMap((target) => {
      const evidenceCalls = selectCalls(target).toSorted(
        (left, right) => left.range.start - right.range.start,
      );
      return evidenceCalls.length === 0 ? [] : [{ target, evidenceCalls }];
    });
};

const directlyAwaitedCalls = (fn: FunctionTarget): CallCapture[] => {
  return fn.calls.filter((call) => {
    const relativeStart = call.range.start - fn.range.start;
    return /\bawait\s*$/u.test(fn.source.slice(0, relativeStart));
  });
};

const nativePromiseCalls = (
  fn: FunctionTarget,
  document: ParsedDocument,
  callees: ReadonlySet<string>,
): CallCapture[] => {
  if (
    shadowsIdentifier(fn.source, "Promise") ||
    importsIdentifier(document.imports, "Promise") ||
    hasTopLevelDeclaration(document.source, "Promise")
  ) {
    return [];
  }
  return fn.calls.filter((call) => callees.has(call.callee));
};

const isCancellablePlatformCall = (
  callee: string,
  fn: FunctionTarget,
  document: ParsedDocument,
): boolean => {
  if (!cancellablePlatformCallees.has(callee)) {
    return false;
  }
  return (
    callee !== "fetch" ||
    (!shadowsIdentifier(fn.source, "fetch") &&
      !importsIdentifier(document.imports, "fetch") &&
      !hasTopLevelDeclaration(document.source, "fetch"))
  );
};

const isAbortListenerCall = (call: CallCapture): boolean => {
  if (!/(?:^|\.)(?:signal|abortSignal)\.addEventListener$/iu.test(call.callee)) {
    return false;
  }
  return /\.addEventListener\s*\(\s*["']abort["']/u.test(call.source);
};

const shadowsIdentifier = (source: string, identifier: string): boolean => {
  const escaped = escapeRegExp(identifier);
  const signatureEnd = source.search(/(?:=>|\{)/u);
  const signature = signatureEnd < 0 ? source : source.slice(0, signatureEnd);
  return (
    new RegExp(`\\b(?:const|let|var|class|function)\\s+${escaped}\\b`, "u").test(source) ||
    new RegExp(`(?:^|[,({]\\s*)(?:\\.\\.\\.)?${escaped}\\s*(?:[?:=,)}]|$)`, "u").test(signature)
  );
};

const hasTopLevelDeclaration = (source: string, identifier: string): boolean => {
  const escaped = escapeRegExp(identifier);
  return new RegExp(`^(?:export\\s+)?(?:const|let|var|class|function)\\s+${escaped}\\b`, "mu").test(
    source,
  );
};

const importsIdentifier = (imports: readonly string[], identifier: string): boolean => {
  const escaped = escapeRegExp(identifier);
  return imports.some((statement) => {
    return new RegExp(`^\\s*import\\s+[\\s\\S]*\\b${escaped}\\b[\\s\\S]*\\bfrom\\b`, "u").test(
      statement,
    );
  });
};

const boundedImports = (imports: readonly string[], maximum: number): BoundedImports => {
  const values: string[] = [];
  let characters = 0;
  for (const statement of imports) {
    const nextCharacters = characters + (values.length === 0 ? 0 : 1) + statement.length;
    if (nextCharacters > maximum) {
      return { values, truncated: true };
    }
    values.push(statement);
    characters = nextCharacters;
  }
  return { values, truncated: false };
};

const resolveOptions = (
  options: AsyncRuleOptions,
  defaultThreshold: number,
  defaultMinConfidence: number,
): ResolvedOptions => {
  const threshold = probabilityOption("threshold", options.threshold, defaultThreshold);
  const minConfidence = probabilityOption(
    "minConfidence",
    options.minConfidence,
    defaultMinConfidence,
  );
  const maxFunctionCharacters = integerOption(
    "maxFunctionCharacters",
    options.maxFunctionCharacters,
    8_000,
    1,
  );
  const maxImportCharacters = integerOption(
    "maxImportCharacters",
    options.maxImportCharacters,
    2_000,
    0,
  );
  const maxCallSites = integerOption("maxCallSites", options.maxCallSites, 50, 0);
  return {
    threshold,
    minConfidence,
    maxFunctionCharacters,
    maxImportCharacters,
    maxCallSites,
  };
};

const probabilityOption = (name: string, value: number | undefined, fallback: number): number => {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new RangeError(`${name} must be a finite number between 0 and 1`);
  }
  return resolved;
};

const integerOption = (
  name: string,
  value: number | undefined,
  fallback: number,
  minimum: number,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
  return resolved;
};

const escapeRegExp = (value: string): string => {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
  scores: { probability: number; confidence: number },
) => {
  return {
    message,
    filename: candidate.target.filename,
    location: candidate.target.location,
    ...scores,
  };
};
