import type {
  CallCapture,
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
  StructuredCallFact,
} from "@scruple/core";
import { definePlugin, resolveDecisionOptions } from "@scruple/core";

export interface AsyncRuleOptions extends DecisionRuleOptions {
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
  "no-unobserved-async-work": RuleFactory<AsyncRuleOptions>;
  "no-async-initialization": RuleFactory<AsyncRuleOptions>;
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
      "no-unobserved-async-work": noUnobservedAsyncWork,
      "no-async-initialization": noAsyncInitialization,
    },
  });
};

const asyncLookingCallee = /(?:^|\.)(?:fetch|readFile|writeFile)$|(?:Async|Promise)$/u;

const noUnobservedAsyncWork = (options: AsyncRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, 0.9, 0.7);
  return callChoiceRule(resolved, {
    description: "Asynchronous work should have its completion observed.",
    select: (document) =>
      document.facts?.calls.filter(
        (call) =>
          (call.usage === "expression" ||
            (call.usage === "assignment" && isDeadPromiseAssignment(call, document))) &&
          call.callee !== undefined &&
          asyncLookingCallee.test(call.callee),
      ) ?? [],
    instructions:
      "Does this call start asynchronous work whose completion or failure is not observed? The selected result is either discarded immediately or assigned to a local identifier with no later visible use. Diagnose only when the visible API contract or strong convention establishes that the call returns async work. Intentional detached work must visibly own error reporting and lifetime. Choose insufficient_context when return behavior or ownership is unknown.",
    criteria: {
      unobserved_async_work:
        "The call visibly starts asynchronous work, but its promise, completion, and failure are discarded.",
      intentional_detached_work:
        "The work is deliberately detached with visible failure handling and an appropriate owner for its lifetime.",
      not_async_work:
        "The call does not return or start asynchronous work that requires observation.",
      insufficient_context:
        "The available source does not establish the call's return contract, ownership, or failure handling.",
    },
    finding: "unobserved_async_work",
    message: "This async work appears to be started without observing its completion.",
  });
};

const noAsyncInitialization = (options: AsyncRuleOptions = {}): SemanticRule => {
  const resolved = resolveOptions(options, 0.9, 0.7);
  return choiceRule(resolved, {
    description: "Constructors should not hide asynchronous initialization.",
    select: (document) =>
      selectFunctions(document, resolved, (fn) =>
        fn.role === "constructor"
          ? fn.calls.filter((call) => asyncLookingCallee.test(call.callee))
          : [],
      ),
    question: {
      instructions:
        "Does this constructor start asynchronous initialization that can leave the new instance observable before it is ready, or lose initialization failure? Diagnose only when async startup is visible. Synchronous setup and explicitly deferred lifecycle work are safe. Choose insufficient_context when the callee contract or readiness ownership is hidden.",
      criteria: {
        async_initialization:
          "The constructor starts asynchronous setup without an explicit lifecycle boundary that observes readiness and failure.",
        synchronous_initialization: "The constructor performs only synchronous initialization.",
        deferred_or_explicit_lifecycle:
          "Initialization is deferred to or represented by an explicit, observable lifecycle contract.",
        insufficient_context:
          "The source does not establish whether setup is asynchronous or how readiness and failure are observed.",
      },
    },
    finding: "async_initialization",
    message: "This constructor appears to start asynchronous initialization.",
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
      selectFunctions(document, resolved, (fn) => {
        const calls = directlyAwaitedCalls(fn, document);
        return fn.async && calls.length >= 2 ? calls : [];
      }),
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
        fn.calls.filter((call) => isAbortListenerCall(call, abortSignalParameters(fn))),
      ),
    question: {
      instructions:
        "Can an abort listener registered on a visible AbortSignal parameter remain attached after the operation that owns the listener finishes? `{ once: true }` only removes the listener if abort occurs, so it is not operation-completion cleanup when the operation may finish normally. Explicit remove/dispose or finally cleanup tied to every settled path is sufficient. Do not infer leaks for visibly operation-owned signals or hidden ownership. Choose `insufficient_context` when signal lifetime, listener identity, operation completion, or cleanup is outside this function.",
      criteria: {
        abort_listener_may_leak:
          "A listener is attached to a caller-owned AbortSignal parameter without cleanup tied to operation completion; once-only registration alone does not cover normal completion.",
        listener_cleanup_present:
          "The listener is explicitly removed or disposed, or cleanup is visibly guaranteed whenever the operation finishes.",
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

interface CallChoiceRuleDefinition {
  description: string;
  select(document: ParsedDocument): StructuredCallFact[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
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
            ...(target.role === "constructor" ? { role: target.role } : {}),
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

const callChoiceRule = (
  options: ResolvedOptions,
  definition: CallChoiceRuleDefinition,
): SemanticRule => ({
  description: definition.description,
  collect(document) {
    const imports = boundedImports(document.imports, options.maxImportCharacters);
    return definition.select(document).flatMap((call) => {
      const enclosingFunction = smallestEnclosingFunction(call.range, document.functions);
      if (
        enclosingFunction !== undefined &&
        (enclosingFunction.source.length === 0 ||
          enclosingFunction.source.length > options.maxFunctionCharacters)
      ) {
        return [];
      }
      const calls = (enclosingFunction?.calls ?? [])
        .toSorted((left, right) => left.range.start - right.range.start)
        .slice(0, options.maxCallSites);
      return [
        {
          target: {
            kind: "expression" as const,
            filename: document.filename,
            language: document.language,
            range: call.range,
            location: sourceLocation(document.source, call.range),
            source: call.source,
          },
          state: {
            language: document.language,
            imports: imports.values,
            imports_truncated: imports.truncated,
            call: { callee: call.callee ?? null, source: call.source, usage: call.usage },
            surrounding_function: enclosingFunction?.source ?? null,
            calls: calls.map((entry) => ({ callee: entry.callee, source: entry.source })),
            calls_truncated: calls.length < (enclosingFunction?.calls.length ?? 0),
            evidence_scope:
              "The call expression, its syntactic usage, bounded imports, enclosing function, and bounded calls are shown; unresolved callee contracts are not evidence.",
          },
          data: {
            usage: call.usage,
            total_imports: document.imports.length,
            total_calls: enclosingFunction?.calls.length ?? 0,
            imports_truncated: imports.truncated,
            calls_truncated: calls.length < (enclosingFunction?.calls.length ?? 0),
          },
          question: {
            type: "choice" as const,
            instructions: definition.instructions,
            criteria: definition.criteria,
          },
        },
      ];
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
});

const sourceLocation = (source: string, range: { start: number; end: number }) => {
  const position = (offset: number) => {
    const prefix = source.slice(0, offset);
    const lines = prefix.split("\n");
    return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
  };
  return { start: position(range.start), end: position(range.end) };
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

const directlyAwaitedCalls = (fn: FunctionTarget, document: ParsedDocument): CallCapture[] => {
  return fn.calls.filter((call) => {
    const fact = structuredCallFact(call, document);
    if (fact !== undefined) {
      return fact.awaited;
    }
    const relativeStart = call.range.start - fn.range.start;
    return /\bawait\s*$/u.test(fn.source.slice(0, relativeStart));
  });
};

const structuredCallFact = (
  call: CallCapture,
  document: ParsedDocument,
): StructuredCallFact | undefined => {
  return document.facts?.calls.find(
    (fact) => fact.range.start === call.range.start && fact.range.end === call.range.end,
  );
};

const smallestEnclosingFunction = (
  range: { start: number; end: number },
  functions: readonly FunctionTarget[],
): FunctionTarget | undefined => {
  return functions
    .filter((fn) => fn.range.start <= range.start && fn.range.end >= range.end)
    .toSorted(
      (left, right) => left.range.end - left.range.start - (right.range.end - right.range.start),
    )[0];
};

const isDeadPromiseAssignment = (call: StructuredCallFact, document: ParsedDocument): boolean => {
  const fn = smallestEnclosingFunction(call.range, document.functions);
  if (fn === undefined) {
    return false;
  }
  const prefix = document.source.slice(fn.range.start, call.range.start);
  const binding = prefix.match(
    /(?:\b(?:const|let|var)\s+|(?:^|[;{}]\s*))([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*$/u,
  )?.[1];
  if (binding === undefined) {
    return false;
  }
  const suffix = document.source.slice(call.range.end, fn.range.end);
  return !new RegExp(`\\b${escapeRegExp(binding)}\\b`, "u").test(suffix);
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

const isAbortListenerCall = (call: CallCapture, signals: ReadonlySet<string>): boolean => {
  const receiver = call.callee.match(/^([A-Za-z_$][\w$]*)\.addEventListener$/u)?.[1];
  if (receiver === undefined || !signals.has(receiver)) {
    return false;
  }
  return /\.addEventListener\s*\(\s*["']abort["']/u.test(call.source);
};

const abortSignalParameters = (fn: FunctionTarget): ReadonlySet<string> => {
  const signatureEnd = fn.source.search(/(?:=>|\{)/u);
  const signature = signatureEnd < 0 ? fn.source : fn.source.slice(0, signatureEnd);
  return new Set(
    [...signature.matchAll(/\b([A-Za-z_$][\w$]*)\s*\??\s*:\s*AbortSignal\b/gu)].map(
      (match) => match[1]!,
    ),
  );
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
  const { threshold, minConfidence } = resolveDecisionOptions(options, {
    threshold: defaultThreshold,
    minConfidence: defaultMinConfidence,
  });
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
