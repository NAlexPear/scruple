import { createSuppressionFilter } from "#suppressions";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SourceRange {
  start: number;
  end: number;
}

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceLocation {
  start: SourcePosition;
  end: SourcePosition;
}

export interface CodeTarget {
  kind: "api-boundary" | "comment" | "error-handler" | "function" | "test" | "expression" | "file";
  filename: string;
  language: string;
  range: SourceRange;
  location: SourceLocation;
  source: string;
  enclosingSource?: string;
}

export interface CallCapture {
  callee: string;
  range: SourceRange;
  source: string;
}

export type StructuredValueKind =
  | "array"
  | "call"
  | "function"
  | "identifier"
  | "literal"
  | "member"
  | "object"
  | "spread"
  | "template"
  | "other";

export interface StructuredArgumentFact {
  kind: StructuredValueKind;
  range: SourceRange;
  source: string;
  /** Identifier and static member paths referenced by this argument. */
  references: string[];
  /** Static top-level keys when this argument is an object literal. */
  properties?: string[];
  /** The value when this argument is a primitive literal. */
  value?: string | number | boolean | null;
  /** Bound names for each parameter when this argument is an inline function. */
  bindings?: string[][];
}

export type ControlRegionKind = "callback" | "catch" | "conditional" | "finally" | "loop";

export interface ControlRegionFact {
  kind: ControlRegionKind;
  range: SourceRange;
  /** Present for inline callbacks passed to a statically named call. */
  callee?: string;
  /** Present for loop regions so selectors can distinguish retry loops from collection iteration. */
  loop?: "do-while" | "for" | "for-in" | "for-of" | "while";
  /** Bound iteration names for for-in and for-of loops. */
  bindings?: string[];
  /** Present for for-of loops. */
  awaited?: boolean;
}

export interface StructuredDeclarationFact {
  kind: "await-using" | "using";
  range: SourceRange;
  source: string;
}

export interface StructuredCallFact {
  range: SourceRange;
  source: string;
  callee?: string;
  arguments: StructuredArgumentFact[];
  /** Identifier and static member paths referenced by all arguments. */
  references: string[];
  awaited: boolean;
  usage: "argument" | "assignment" | "await" | "condition" | "expression" | "other" | "return";
  control: ControlRegionFact[];
}

export interface StructuredConstructorFact {
  range: SourceRange;
  source: string;
  callee?: string;
  arguments: StructuredArgumentFact[];
  /** Identifier and static member paths referenced by all arguments. */
  references: string[];
  usage: StructuredCallFact["usage"];
  control: ControlRegionFact[];
}

export interface StructuredAliasFact {
  range: SourceRange;
  source: string;
  binding: string;
  /** A statically named identifier or member path assigned to the binding. */
  target: string;
}

export interface MemberAccessFact {
  path: string;
  range: SourceRange;
  source: string;
}

export interface StructuredFacts {
  aliases: StructuredAliasFact[];
  calls: StructuredCallFact[];
  constructors: StructuredConstructorFact[];
  controls: ControlRegionFact[];
  declarations: StructuredDeclarationFact[];
  members: MemberAccessFact[];
  completeness: {
    aliases: "complete";
    calls: "complete";
    constructors: "complete";
    control: "complete";
    declarations: "complete";
    members: "complete" | "partial";
    reasons: string[];
  };
}

export interface FunctionTarget extends CodeTarget {
  kind: "function" | "test";
  name?: string;
  testName?: string;
  role?: "constructor" | "function" | "method";
  async: boolean;
  calls: CallCapture[];
}

export interface ErrorHandlerExitCapture {
  kind: "return" | "throw";
  range: SourceRange;
  source: string;
}

export interface ErrorHandlerTarget extends CodeTarget {
  kind: "error-handler";
  binding?: string;
  bodySource: string;
  trySource: string;
  calls: CallCapture[];
  exits: ErrorHandlerExitCapture[];
}

export type ApiFramework = "express" | "fastify";

export type ApiRequestSourceKind = "body" | "cookies" | "headers" | "params" | "query" | "raw";

export interface ApiRequestSourceCapture {
  kind: ApiRequestSourceKind;
  range: SourceRange;
  source: string;
}

export interface ApiBoundaryAttachmentCapture {
  kind: "middleware" | "schema";
  range: SourceRange;
  source: string;
}

export interface ApiResponseExitCapture {
  kind: "return" | "send" | "throw";
  range: SourceRange;
  source: string;
  status?: number;
  bodySource?: string;
  headerSources: string[];
}

export type ApiEvidenceCompleteness = "complete" | "partial";

export interface ApiBoundaryCompleteness {
  handler: ApiEvidenceCompleteness;
  requestSources: ApiEvidenceCompleteness;
  attachments: ApiEvidenceCompleteness;
  responseExits: ApiEvidenceCompleteness;
  reasons: string[];
}

export interface ApiBoundaryTarget extends CodeTarget {
  kind: "api-boundary";
  framework: ApiFramework;
  method: string;
  path: string;
  handlerRange: SourceRange;
  handlerSource: string;
  requestSources: ApiRequestSourceCapture[];
  attachments: ApiBoundaryAttachmentCapture[];
  responseExits: ApiResponseExitCapture[];
  calls: CallCapture[];
  completeness: ApiBoundaryCompleteness;
}

export interface CommentTarget extends CodeTarget {
  kind: "comment";
  style: "line" | "block";
  value: string;
}

export interface ParseIssue {
  message: string;
  severity: "error" | "warning";
  range?: SourceRange;
}

export interface ParsedDocument {
  filename: string;
  language: string;
  source: string;
  imports: string[];
  comments: CommentTarget[];
  functions: FunctionTarget[];
  errorHandlers: ErrorHandlerTarget[];
  /** Present when the parser supports normalized server API boundary extraction. */
  apiBoundaries?: ApiBoundaryTarget[];
  /** Present when the parser supports deterministic expression and control-region facts. */
  facts?: StructuredFacts;
  issues: ParseIssue[];
}

export interface SourceParser {
  readonly id: string;
  supports(filename: string): boolean;
  parse(filename: string, source: string): ParsedDocument;
}

export interface NoulQuestion {
  type: "noul";
  instructions: JsonValue;
  criteria?: { true?: JsonValue; false?: JsonValue };
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: JsonValue;
  criteria: [JsonValue, JsonValue, ...JsonValue[]];
}

export type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend: Record<string, JsonValue>;
}

export type DecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface DecisionRequest {
  state: JsonValue;
  questions: Record<string, DecisionQuestion>;
}

export interface DecisionResponse {
  model: string;
  answers: Record<string, DecisionAnswer>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface DecisionProvider {
  readonly id: string;
  readonly concurrency?: number;
  evaluate(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse>;
  close?(): Promise<void> | void;
}

export interface CollectionProvider {
  readonly id: string;
  /** Returns null without evaluating when the target is suppressed for the active rule. */
  evaluate(
    target: CodeTarget,
    request: DecisionRequest,
    signal?: AbortSignal,
  ): Promise<DecisionResponse | null>;
}

export interface CollectionContext {
  /** Engine-managed provider access for classifying possible candidates before evaluation. */
  readonly provider: CollectionProvider;
  readonly signal?: AbortSignal;
}

export interface RuleCandidate {
  target: CodeTarget;
  state: JsonValue;
  question: DecisionQuestion;
  data?: Record<string, JsonValue>;
}

export type DiagnosticSeverity = "warning" | "error";
export type RuleSeverity = "off" | "warn" | "error";
export type RuleConfiguration = RuleSeverity | readonly [RuleSeverity, unknown];

export interface Diagnostic {
  ruleId: string;
  severity: DiagnosticSeverity;
  message: string;
  filename: string;
  location: SourceLocation;
  model: string;
  probability?: number;
  confidence?: number;
}

export type CollectionResult = RuleCandidate[] | Promise<RuleCandidate[]>;

export interface SemanticRule<Result extends CollectionResult = RuleCandidate[]> {
  readonly description: string;
  collect(document: ParsedDocument, context?: CollectionContext): Result;
  diagnose(
    answer: DecisionAnswer,
    candidate: RuleCandidate,
  ): Omit<Diagnostic, "ruleId" | "severity" | "model"> | null;
}

export type AnySemanticRule = SemanticRule<CollectionResult>;
export type AsyncSemanticRule = SemanticRule<Promise<RuleCandidate[]>>;

export type RuleFactory<Options = never, Result extends AnySemanticRule = SemanticRule> = (
  options?: Options,
) => Result;
export type RuleFactories = Record<string, RuleFactory<never, AnySemanticRule>>;

export interface DecisionRuleOptions {
  threshold?: number;
  minConfidence?: number;
}

export interface DecisionThresholds {
  threshold: number;
  minConfidence: number;
}

export const resolveDecisionOptions = (
  options: DecisionRuleOptions,
  defaults: DecisionThresholds,
): DecisionThresholds => {
  const threshold = options.threshold ?? defaults.threshold;
  const minConfidence = options.minConfidence ?? defaults.minConfidence;
  validateProbability("threshold", threshold);
  validateProbability("minConfidence", minConfidence);
  return { threshold, minConfidence };
};

const validateProbability = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number between 0 and 1`);
  }
};

export interface ScruplePlugin<Rules extends RuleFactories = RuleFactories> {
  readonly rules: Rules;
}

export type PluginMap = Record<string, ScruplePlugin>;

export interface ScrupleConfig {
  parser: SourceParser;
  provider: DecisionProvider;
  plugins: PluginMap;
  rules: Record<string, RuleConfiguration>;
  include?: string[];
  ignore?: string[];
}

type RuleOptions<Factory> = Factory extends RuleFactory<infer Options> ? Options : never;

type PluginRuleConfigurations<Namespace extends string, Plugin> =
  Plugin extends ScruplePlugin<infer Rules>
    ? {
        [RuleName in keyof Rules & string as `${Namespace}/${RuleName}`]?:
          | RuleSeverity
          | readonly [RuleSeverity, RuleOptions<Rules[RuleName]>];
      }
    : never;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

export type RulesForPlugins<Plugins extends PluginMap> = UnionToIntersection<
  {
    [Namespace in keyof Plugins & string]: PluginRuleConfigurations<Namespace, Plugins[Namespace]>;
  }[keyof Plugins & string]
>;

export type DefinedScrupleConfig<Plugins extends PluginMap> = Omit<
  ScrupleConfig,
  "plugins" | "rules"
> & {
  plugins: Plugins;
  rules: RulesForPlugins<Plugins>;
};

export const defineConfig = <const Plugins extends PluginMap>(
  config: DefinedScrupleConfig<Plugins>,
): DefinedScrupleConfig<Plugins> => {
  return config;
};

export const definePlugin = <const Plugin extends ScruplePlugin>(plugin: Plugin): Plugin => {
  return plugin;
};

export interface SourceFile {
  filename: string;
  source: string;
}

export interface OperationalError {
  filename?: string;
  message: string;
  cause?: unknown;
}

export interface RunStats {
  files: number;
  candidates: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DecisionRecord {
  ruleId: string;
  filename: string;
  location: SourceLocation;
  targetKind: CodeTarget["kind"];
  answer: DecisionAnswer;
  diagnostic: boolean;
  model: string;
}

export interface RunOptions {
  includeDecisions?: boolean;
}

export interface RunResult {
  diagnostics: Diagnostic[];
  errors: OperationalError[];
  stats: RunStats;
  /** Provider answers retained only when RunOptions.includeDecisions is enabled. */
  decisions?: DecisionRecord[];
}

interface ActiveRule {
  id: string;
  severity: DiagnosticSeverity;
  rule: AnySemanticRule;
}

interface PendingCandidate {
  activeRule: ActiveRule;
  candidate: RuleCandidate;
}

interface EvaluationBatch {
  state: JsonValue;
  pending: PendingCandidate[];
}

export const runScruple = async (
  config: ScrupleConfig,
  files: SourceFile[],
  signal?: AbortSignal,
  options: RunOptions = {},
): Promise<RunResult> => {
  const errors: OperationalError[] = [];
  const allPending: PendingCandidate[] = [];
  const activeRules = resolveRules(config, errors);
  let parsedFiles = 0;
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const provider = managedProvider(
    config.provider,
    () => {
      requests += 1;
    },
    (response) => {
      inputTokens += response.usage?.inputTokens ?? 0;
      outputTokens += response.usage?.outputTokens ?? 0;
    },
  );

  for (const file of files) {
    if (!config.parser.supports(file.filename)) {
      continue;
    }

    let document: ParsedDocument;
    try {
      document = config.parser.parse(file.filename, file.source);
      parsedFiles += 1;
    } catch (cause) {
      errors.push({ filename: file.filename, message: errorMessage(cause), cause });
      continue;
    }

    for (const issue of document.issues) {
      if (issue.severity === "error") {
        errors.push({ filename: file.filename, message: issue.message });
      }
    }

    const isSuppressed = createSuppressionFilter(document.filename, document.comments);
    // Collect files sequentially to bound parsed documents and possible candidates held in memory.
    // eslint-disable-next-line no-await-in-loop
    const collections = await Promise.all(
      activeRules.map(async (activeRule) => {
        const rule = activeRule.rule;
        try {
          const collectionProvider: CollectionProvider = {
            id: provider.id,
            evaluate(target, request, collectionSignal) {
              if (isSuppressed(activeRule.id, target)) {
                return Promise.resolve(null);
              }
              return provider.evaluate(request, collectionSignal);
            },
          };
          const context: CollectionContext = {
            provider: collectionProvider,
            ...(signal === undefined ? {} : { signal }),
          };
          const collected = await rule.collect(document, context);
          const candidates = collected.filter(
            (candidate) => !isSuppressed(activeRule.id, candidate.target),
          );
          return { activeRule, candidates };
        } catch (cause) {
          return { activeRule, cause };
        }
      }),
    );
    for (const collection of collections) {
      if ("cause" in collection) {
        errors.push({
          filename: file.filename,
          message: `Rule ${collection.activeRule.id} failed while collecting candidates: ${errorMessage(collection.cause)}`,
          cause: collection.cause,
        });
        continue;
      }
      for (const candidate of collection.candidates) {
        allPending.push({ activeRule: collection.activeRule, candidate });
      }
    }
  }

  const diagnostics: Diagnostic[] = [];
  const decisions: DecisionRecord[] = [];
  const batches = groupByState(allPending);

  await runConcurrent(batches, config.provider.concurrency ?? 1, async (batch) => {
    if (signal?.aborted === true) {
      return;
    }

    const questions = Object.fromEntries(
      batch.pending.map(({ activeRule, candidate }, index) => [
        `${sanitizeId(activeRule.id)}_${index}`,
        candidate.question,
      ]),
    );

    try {
      const response = await provider.evaluate({ state: batch.state, questions }, signal);

      batch.pending.forEach(({ activeRule, candidate }, index) => {
        const answer = response.answers[`${sanitizeId(activeRule.id)}_${index}`];
        if (!answer) {
          errors.push({
            filename: candidate.target.filename,
            message: `Provider ${config.provider.id} omitted an answer for rule ${activeRule.id}`,
          });
          return;
        }

        const diagnostic = activeRule.rule.diagnose(answer, candidate);
        if (options.includeDecisions === true) {
          decisions.push({
            ruleId: activeRule.id,
            filename: candidate.target.filename,
            location: candidate.target.location,
            targetKind: candidate.target.kind,
            answer,
            diagnostic: diagnostic !== null,
            model: response.model,
          });
        }
        if (diagnostic) {
          diagnostics.push({
            ...diagnostic,
            ruleId: activeRule.id,
            severity: activeRule.severity,
            model: response.model,
          });
        }
      });
    } catch (cause) {
      errors.push({
        message: `Provider ${config.provider.id} failed: ${errorMessage(cause)}`,
        cause,
      });
    }
  });

  const result: RunResult = {
    diagnostics: diagnostics.toSorted(compareDiagnostics),
    errors,
    stats: {
      files: parsedFiles,
      candidates: allPending.length,
      requests,
      inputTokens,
      outputTokens,
    },
  };
  if (options.includeDecisions === true) {
    result.decisions = decisions.toSorted(compareDecisions);
  }
  return result;
};

const resolveRules = (config: ScrupleConfig, errors: OperationalError[]): ActiveRule[] => {
  const activeRules: ActiveRule[] = [];

  for (const [namespace, plugin] of Object.entries(config.plugins)) {
    if (namespace.length === 0 || namespace.includes("/")) {
      errors.push({ message: `Invalid plugin namespace: ${namespace || "(empty)"}` });
    }
    if (!isRecord(plugin.rules)) {
      errors.push({ message: `Plugin ${namespace || "(empty)"} must define rules` });
    }
  }

  for (const [ruleId, configured] of Object.entries(config.rules)) {
    const separator = ruleId.indexOf("/");
    if (separator <= 0 || separator === ruleId.length - 1) {
      errors.push({ message: `Rule IDs must use plugin/rule-name syntax: ${ruleId}` });
      continue;
    }

    const namespace = ruleId.slice(0, separator);
    const ruleName = ruleId.slice(separator + 1);
    const plugin = config.plugins[namespace];
    if (!plugin) {
      errors.push({ message: `Rule ${ruleId} requires plugin ${namespace}` });
      continue;
    }
    const factory = plugin.rules[ruleName];
    if (!factory) {
      errors.push({ message: `Plugin ${namespace} does not provide rule ${ruleName}` });
      continue;
    }

    const parsed = parseRuleConfiguration(ruleId, configured, errors);
    if (!parsed || parsed.severity === "off") {
      continue;
    }

    try {
      activeRules.push({
        id: ruleId,
        severity: parsed.severity === "warn" ? "warning" : "error",
        // The public config type checks options against this factory before runtime erases the type.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        rule: factory(parsed.options as never),
      });
    } catch (cause) {
      errors.push({
        message: `Rule ${ruleId} has invalid options: ${errorMessage(cause)}`,
        cause,
      });
    }
  }

  return activeRules;
};

const parseRuleConfiguration = (
  ruleId: string,
  configured: RuleConfiguration,
  errors: OperationalError[],
): { severity: RuleSeverity; options: unknown } | undefined => {
  if (typeof configured === "string") {
    if (isRuleSeverity(configured)) {
      return { severity: configured, options: undefined };
    }
  } else if (
    Array.isArray(configured) &&
    configured.length === 2 &&
    isRuleSeverity(configured[0])
  ) {
    return { severity: configured[0], options: configured[1] };
  }

  errors.push({ message: `Invalid configuration for rule ${ruleId}` });
  return undefined;
};

const isRuleSeverity = (value: unknown): value is RuleSeverity => {
  return value === "off" || value === "warn" || value === "error";
};

const groupByState = (pending: PendingCandidate[]): EvaluationBatch[] => {
  const groups = new Map<string, EvaluationBatch>();
  for (const item of pending) {
    const key = stableStringify(item.candidate.state);
    const existing = groups.get(key);
    if (existing) {
      existing.pending.push(item);
    } else {
      groups.set(key, { state: item.candidate.state, pending: [item] });
    }
  }
  return [...groups.values()];
};

const stableStringify = (value: JsonValue): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] ?? null)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const runConcurrent = async <T>(
  values: T[],
  concurrency: number,
  work: (value: T) => Promise<void>,
): Promise<void> => {
  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const iterator = values.values();
  const runWorker = async (): Promise<void> => {
    const next = iterator.next();
    if (next.done !== true) {
      await work(next.value);
      await runWorker();
    }
  };
  const workers = Array.from({ length: Math.min(safeConcurrency, values.length) }, runWorker);
  await Promise.all(workers);
};

const managedProvider = (
  provider: DecisionProvider,
  willEvaluate: () => void,
  didEvaluate: (response: DecisionResponse) => void,
): Pick<DecisionProvider, "id" | "evaluate"> => {
  const concurrency = Math.max(1, Math.floor(provider.concurrency ?? 1));
  let active = 0;
  const waiting: (() => void)[] = [];

  const acquire = async (): Promise<void> => {
    if (active < concurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next === undefined) {
      active -= 1;
    } else {
      next();
    }
  };

  return {
    id: provider.id,
    async evaluate(request, signal) {
      await acquire();
      try {
        willEvaluate();
        const response = await provider.evaluate(request, signal);
        didEvaluate(response);
        return response;
      } finally {
        release();
      }
    },
  };
};

const sanitizeId = (id: string): string => {
  return id.replaceAll(/[^a-zA-Z0-9_-]/gu, "_");
};

const compareDiagnostics = (left: Diagnostic, right: Diagnostic): number => {
  return (
    left.filename.localeCompare(right.filename) ||
    left.location.start.line - right.location.start.line ||
    left.location.start.column - right.location.start.column ||
    left.ruleId.localeCompare(right.ruleId)
  );
};

const compareDecisions = (left: DecisionRecord, right: DecisionRecord): number => {
  return (
    left.filename.localeCompare(right.filename) ||
    left.location.start.line - right.location.start.line ||
    left.location.start.column - right.location.start.column ||
    left.ruleId.localeCompare(right.ruleId)
  );
};

const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};
