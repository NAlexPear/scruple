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
  kind: "comment" | "function" | "test" | "expression" | "file";
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

export interface FunctionTarget extends CodeTarget {
  kind: "function" | "test";
  name?: string;
  testName?: string;
  async: boolean;
  calls: CallCapture[];
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
  evaluate(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse>;
  close?(): Promise<void> | void;
}

export interface RuleCandidate {
  target: CodeTarget;
  state: JsonValue;
  question: DecisionQuestion;
  data?: Record<string, JsonValue>;
}

export type DiagnosticSeverity = "warning" | "error";

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

export interface SemanticRule {
  readonly id: string;
  readonly description: string;
  collect(document: ParsedDocument): RuleCandidate[];
  diagnose(
    answer: DecisionAnswer,
    candidate: RuleCandidate,
  ): Omit<Diagnostic, "ruleId" | "model"> | null;
}

export interface ScrupleConfig {
  parser: SourceParser;
  provider: DecisionProvider;
  rules: SemanticRule[];
  concurrency?: number;
  include?: string[];
  ignore?: string[];
}

export function defineConfig(config: ScrupleConfig): ScrupleConfig {
  return config;
}

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

export interface RunResult {
  diagnostics: Diagnostic[];
  errors: OperationalError[];
  stats: RunStats;
}

interface PendingCandidate {
  rule: SemanticRule;
  candidate: RuleCandidate;
}

interface EvaluationBatch {
  state: JsonValue;
  pending: PendingCandidate[];
}

export async function runScruple(
  config: ScrupleConfig,
  files: SourceFile[],
  signal?: AbortSignal,
): Promise<RunResult> {
  const errors: OperationalError[] = [];
  const allPending: PendingCandidate[] = [];
  let parsedFiles = 0;

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

    for (const rule of config.rules) {
      try {
        for (const candidate of rule.collect(document)) {
          allPending.push({ rule, candidate });
        }
      } catch (cause) {
        errors.push({
          filename: file.filename,
          message: `Rule ${rule.id} failed while collecting candidates: ${errorMessage(cause)}`,
          cause,
        });
      }
    }
  }

  const batches = groupByState(allPending);
  const diagnostics: Diagnostic[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  await runConcurrent(batches, config.concurrency ?? 4, async (batch) => {
    if (signal?.aborted === true) {
      return;
    }

    const questions = Object.fromEntries(
      batch.pending.map(({ rule, candidate }, index) => [
        `${sanitizeId(rule.id)}_${index}`,
        candidate.question,
      ]),
    );

    try {
      const response = await config.provider.evaluate({ state: batch.state, questions }, signal);
      inputTokens += response.usage?.inputTokens ?? 0;
      outputTokens += response.usage?.outputTokens ?? 0;

      batch.pending.forEach(({ rule, candidate }, index) => {
        const answer = response.answers[`${sanitizeId(rule.id)}_${index}`];
        if (!answer) {
          errors.push({
            filename: candidate.target.filename,
            message: `Provider ${config.provider.id} omitted an answer for rule ${rule.id}`,
          });
          return;
        }

        const diagnostic = rule.diagnose(answer, candidate);
        if (diagnostic) {
          diagnostics.push({ ...diagnostic, ruleId: rule.id, model: response.model });
        }
      });
    } catch (cause) {
      errors.push({
        message: `Provider ${config.provider.id} failed: ${errorMessage(cause)}`,
        cause,
      });
    }
  });

  return {
    diagnostics: diagnostics.toSorted(compareDiagnostics),
    errors,
    stats: {
      files: parsedFiles,
      candidates: allPending.length,
      requests: batches.length,
      inputTokens,
      outputTokens,
    },
  };
}

function groupByState(pending: PendingCandidate[]): EvaluationBatch[] {
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
}

function stableStringify(value: JsonValue): string {
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
}

async function runConcurrent<T>(
  values: T[],
  concurrency: number,
  work: (value: T) => Promise<void>,
): Promise<void> {
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
}

function sanitizeId(id: string): string {
  return id.replaceAll(/[^a-zA-Z0-9_-]/gu, "_");
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return (
    left.filename.localeCompare(right.filename) ||
    left.location.start.line - right.location.start.line ||
    left.location.start.column - right.location.start.column ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
