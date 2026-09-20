/// <reference lib="webworker" />

import type { DecisionAnswer, ParsedDocument, RuleCandidate, SemanticRule } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import ts from "typescript";

interface AnalyzeRequest {
  id: number;
  action: "analyze";
  filename: string;
  source: string;
  ruleSource: string;
}

interface DiagnoseRequest {
  id: number;
  action: "diagnose";
  answer: DecisionAnswer;
  candidateIndex: number;
}

type PlaygroundRequest = AnalyzeRequest | DiagnoseRequest;
type PlaygroundRequestInput = Omit<AnalyzeRequest, "id"> | Omit<DiagnoseRequest, "id">;

interface PlaygroundResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface PlaygroundReady {
  ready: true;
}

let activeRule: SemanticRule | undefined;
let activeCandidates: RuleCandidate[] = [];

const parser = oxcParser();

self.addEventListener("message", (event: MessageEvent<PlaygroundRequest>) => {
  const request = event.data;
  try {
    if (request.action === "analyze") {
      const document = parser.parse(request.filename, request.source);
      const rule = compileRule(request.ruleSource);
      const candidates = rule.collect(document);
      validateCandidates(candidates);
      activeRule = rule;
      activeCandidates = candidates;
      respond({
        id: request.id,
        ok: true,
        result: {
          description: rule.description,
          candidates,
          document: summarizeDocument(document),
        },
      });
      return;
    }

    if (activeRule === undefined) {
      throw new Error("Run the rule before testing a decision.");
    }
    const candidate = activeCandidates[request.candidateIndex];
    if (candidate === undefined) {
      throw new Error("The selected candidate is no longer available.");
    }
    const diagnostic = activeRule.diagnose(request.answer, candidate);
    respond({ id: request.id, ok: true, result: { diagnostic } });
  } catch (error) {
    respond({ id: request.id, ok: false, error: errorMessage(error) });
  }
});

Object.defineProperty(self, "fetch", {
  configurable: false,
  writable: false,
  value: () => Promise.reject(new Error("Network access is disabled inside playground rules.")),
});

// oxlint-disable-next-line unicorn/require-post-message-target-origin -- DedicatedWorkerGlobalScope does not accept a target origin.
self.postMessage({ ready: true } satisfies PlaygroundReady);

const compileRule = (source: string): SemanticRule => {
  const transpiled = ts.transpileModule(`const __rule = (${source});`, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2023,
      strict: true,
    },
    reportDiagnostics: true,
  });
  const errors = transpiled.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors !== undefined && errors.length > 0) {
    throw new Error(
      errors
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
        .join("\n"),
    );
  }

  // oxlint-disable-next-line typescript/no-implied-eval -- Runtime rule authoring in a disposable worker is the playground's purpose.
  const evaluate = new Function(`"use strict"; ${transpiled.outputText}; return __rule;`);
  // oxlint-disable-next-line typescript/no-unsafe-call -- The generated function has no parameters and its result is validated below.
  const value: unknown = evaluate();
  if (!isRecord(value) || typeof value["description"] !== "string") {
    throw new TypeError("The rule expression must return an object with a description.");
  }
  if (typeof value["collect"] !== "function" || typeof value["diagnose"] !== "function") {
    throw new TypeError("The rule must define collect(document) and diagnose(answer, candidate).");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Runtime shape validation establishes the SemanticRule contract.
  return value as unknown as SemanticRule;
};

const validateCandidates: (value: unknown) => asserts value is RuleCandidate[] = (value) => {
  if (!Array.isArray(value)) {
    throw new TypeError("collect(document) must return an array.");
  }
  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || !isRecord(candidate["target"])) {
      throw new TypeError(`Candidate ${index + 1} must include a normalized target.`);
    }
    if (!("state" in candidate) || !isRecord(candidate["question"])) {
      throw new TypeError(`Candidate ${index + 1} must include state and a typed question.`);
    }
    JSON.stringify(candidate);
  });
};

const summarizeDocument = (document: ParsedDocument): Record<string, unknown> => ({
  filename: document.filename,
  language: document.language,
  imports: document.imports,
  issues: document.issues,
  comments: document.comments,
  functions: document.functions,
  errorHandlers: document.errorHandlers,
  apiBoundaries: document.apiBoundaries ?? [],
  facts: document.facts ?? null,
});

const respond = (response: PlaygroundResponse): void => {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- DedicatedWorkerGlobalScope does not accept a target origin.
  self.postMessage(response);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export type {
  AnalyzeRequest,
  DiagnoseRequest,
  PlaygroundRequest,
  PlaygroundRequestInput,
  PlaygroundReady,
  PlaygroundResponse,
};
