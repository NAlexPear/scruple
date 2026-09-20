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

export type HttpClientKind = "fetch" | "axios";

export interface HttpClientGuarantees {
  timeout?: boolean;
  responseValidation?: boolean;
  maxRetries?: number;
}

export interface RecognizedHttpClient {
  /** Exact identifier or member path used as the client call receiver. */
  name: string;
  kind: HttpClientKind;
  /** Guarantees supplied by a wrapper whose implementation is outside the analyzed file. */
  guarantees?: HttpClientGuarantees;
}

export interface HttpClientRuleOptions {
  threshold?: number;
  minConfidence?: number;
  recognizedClients?: readonly RecognizedHttpClient[];
  /** Functions larger than this are skipped rather than sent with incomplete evidence. */
  maxFunctionCharacters?: number;
  /** Maximum visible same-file configuration context included with a candidate. */
  maxContextCharacters?: number;
}

export type HttpClientsPlugin = ScruplePlugin<{
  "require-timeout": RuleFactory<HttpClientRuleOptions>;
  "require-response-validation": RuleFactory<HttpClientRuleOptions>;
  "no-unbounded-retries": RuleFactory<HttpClientRuleOptions>;
}>;

interface ResolvedOptions {
  threshold: number;
  minConfidence: number;
  recognizedClients: readonly RecognizedHttpClient[];
  maxFunctionCharacters: number;
  maxContextCharacters: number;
}

interface ClientDefinition {
  name: string;
  kind: HttpClientKind;
  source: "built-in" | "import" | "visible-instance" | "configured";
  guarantees: HttpClientGuarantees;
}

interface RequestEvidence {
  callee: string;
  source: string;
  client: ClientDefinition;
}

interface HttpCandidate {
  target: FunctionTarget;
  requests: RequestEvidence[];
  state: JsonValue;
}

interface ConfigurationContext {
  source: string;
  truncated: boolean;
}

interface ChoiceRuleDefinition {
  description: string;
  finding: string;
  message: string;
  retryOnly?: boolean;
  question: {
    instructions: JsonValue;
    criteria: Record<string, JsonValue>;
  };
}

const axiosMethods = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "request",
]);
const retryEvidencePattern = /\b(?:attempts?|backoff|retry|retries|while)\b|\bfor\s*\(/iu;

export const httpClients = (): HttpClientsPlugin => {
  return definePlugin({
    rules: {
      "require-timeout": (options) =>
        httpChoiceRule(options, {
          description: "HTTP requests should have a finite execution deadline.",
          finding: "missing_timeout",
          message: "This HTTP request appears to have no finite timeout.",
          question: {
            instructions:
              "Do all recognized HTTP requests in `function` have a visibly guaranteed finite timeout? Count a finite client default, a finite request timeout, `AbortSignal.timeout(...)`, or a composed signal that visibly contains a timeout. An arbitrary `AbortSignal` only permits cancellation and does not prove a deadline. Use `caller_or_wrapper_unknown` when a signal, wrapper, interceptor, or configuration outside the supplied evidence may impose the deadline; do not guess hidden behavior.",
            criteria: {
              bounded_timeout:
                "Every recognized request has a visible finite deadline or an explicit configured-client timeout guarantee.",
              missing_timeout:
                "At least one direct recognized request definitely has no timeout or deadline, and no hidden caller or wrapper could supply it.",
              caller_or_wrapper_unknown:
                "A caller-provided signal, unresolved wrapper, interceptor, or incomplete configuration could determine the deadline.",
              insufficient_context: "The supplied evidence cannot establish timeout behavior.",
            },
          },
        }),
      "require-response-validation": (options) =>
        httpChoiceRule(options, {
          description: "Deserialized HTTP responses should be validated at runtime before use.",
          finding: "unvalidated_response",
          message: "This HTTP response appears to be used without runtime validation.",
          question: {
            instructions:
              "Are values deserialized from the recognized HTTP requests validated at runtime before application use or return? Schema `parse`, `safeParse`, assertion, decoder, or an explicit configured-client validation guarantee count. TypeScript annotations, casts, and Axios generics do not validate runtime data. Do not demand schema validation when the function only forwards a raw Response, consumes text/binary/status without treating it as structured application data, or when a visible helper/trust boundary cannot be evaluated from this evidence. A comment or internal-looking URL alone proves neither trust nor validation: if it expresses a deliberate trust policy whose validity requires external context, choose `trust_or_helper_unknown` rather than accepting or condemning that policy.",
            criteria: {
              validated_response:
                "Every structured response used by the function has visible runtime validation or a configured-client validation guarantee.",
              unvalidated_response:
                "Structured response data is definitely used or returned without runtime validation.",
              no_structured_response:
                "The function does not consume a structured response as application data.",
              trust_or_helper_unknown:
                "Validation or a deliberate trust boundary may exist in a helper or abstraction not shown by the evidence.",
              insufficient_context: "The supplied evidence cannot establish response handling.",
            },
          },
        }),
      "no-unbounded-retries": (options) =>
        httpChoiceRule(options, {
          description: "HTTP retry behavior should have a finite attempt or elapsed-time bound.",
          finding: "unbounded_retries",
          message: "This HTTP request appears to retry without a finite bound.",
          retryOnly: true,
          question: {
            instructions:
              "Can the recognized HTTP requests retry indefinitely? Treat a finite loop, finite attempt count, elapsed-time deadline, bounded retry library option, or explicit configured-client retry guarantee as bounded. Inspect visible retry middleware and client configuration. Do not infer retry behavior from a client name, and use `retry_behavior_unknown` when an interceptor, wrapper, or middleware outside the supplied evidence controls retries.",
            criteria: {
              bounded_retries:
                "Visible retry behavior has a finite attempt or elapsed-time bound, including a zero-retry path.",
              unbounded_retries:
                "A visible loop, recursion, interceptor, or middleware can retry a recognized request indefinitely.",
              no_retry_behavior:
                "No retry behavior applies to the recognized requests in this evidence.",
              retry_behavior_unknown:
                "A wrapper, interceptor, or middleware outside the supplied evidence may control retry behavior.",
              insufficient_context: "The supplied evidence cannot establish the retry bound.",
            },
          },
        }),
    },
  });
};

const httpChoiceRule = (
  options: HttpClientRuleOptions | undefined,
  definition: ChoiceRuleDefinition,
): SemanticRule => {
  const resolved = resolveOptions(options);
  return {
    description: definition.description,
    collect(document) {
      return collectHttpCandidates(document, resolved, definition.retryOnly === true).map(
        ({ target, state, requests }) => ({
          target,
          state,
          data: {
            requestCallees: requests.map((request) => request.callee),
          },
          question: {
            type: "choice" as const,
            instructions: definition.question.instructions,
            criteria: definition.question.criteria,
          },
        }),
      );
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, resolved.threshold, resolved.minConfidence)) {
        return null;
      }
      return diagnostic(candidate, definition.message, answer, definition.finding);
    },
  };
};

const collectHttpCandidates = (
  document: ParsedDocument,
  options: ResolvedOptions,
  retryOnly: boolean,
): HttpCandidate[] => {
  const clients = discoverClients(document, options.recognizedClients);
  const context = configurationContext(
    sourceOutsideFunctions(document),
    clients,
    options.maxContextCharacters,
  );
  return document.functions.flatMap((target) => {
    if (target.source.length > options.maxFunctionCharacters) {
      return [];
    }
    const requests = target.calls.flatMap((call) => {
      if (call.callee === "fetch" && shadowsBareFetch(target.source)) {
        return [];
      }
      const client = clientForCall(call.callee, clients);
      return client === undefined ? [] : [{ callee: call.callee, source: call.source, client }];
    });
    if (
      requests.length === 0 ||
      (retryOnly && !hasRetryEvidence(target.source, context.source, requests))
    ) {
      return [];
    }
    return [
      {
        target,
        requests,
        state: functionState(target, document, requests, context),
      },
    ];
  });
};

const discoverClients = (
  document: ParsedDocument,
  configured: readonly RecognizedHttpClient[],
): ClientDefinition[] => {
  const clients = new Map<string, ClientDefinition>();
  addClient(clients, {
    name: "globalThis.fetch",
    kind: "fetch",
    source: "built-in",
    guarantees: {},
  });
  addClient(clients, { name: "window.fetch", kind: "fetch", source: "built-in", guarantees: {} });
  if (
    !hasImportedBinding(document.imports, "fetch") &&
    !hasDocumentDeclaration(document.source, "fetch")
  ) {
    addClient(clients, { name: "fetch", kind: "fetch", source: "built-in", guarantees: {} });
  }

  for (const statement of document.imports) {
    const source = importSource(statement);
    if (source === "axios") {
      for (const name of defaultOrNamespaceImports(statement)) {
        addClient(clients, { name, kind: "axios", source: "import", guarantees: {} });
      }
    }
    if (source === "node-fetch" || source === "undici") {
      for (const name of importedNames(statement, "fetch")) {
        addClient(clients, { name, kind: "fetch", source: "import", guarantees: {} });
      }
    }
  }

  const axiosNames = [...clients.values()]
    .filter((client) => client.kind === "axios")
    .map((client) => client.name);
  for (const axiosName of axiosNames) {
    const pattern = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRegExp(axiosName)}\\.create\\s*\\(`,
      "gu",
    );
    for (const match of document.source.matchAll(pattern)) {
      const name = match[1];
      if (name !== undefined) {
        addClient(clients, { name, kind: "axios", source: "visible-instance", guarantees: {} });
      }
    }
  }

  for (const client of configured) {
    addClient(clients, {
      name: client.name,
      kind: client.kind,
      source: "configured",
      guarantees: normalizeGuarantees(client.guarantees),
    });
  }
  return [...clients.values()].toSorted((left, right) => left.name.localeCompare(right.name));
};

const addClient = (clients: Map<string, ClientDefinition>, client: ClientDefinition): void => {
  if (client.name.length > 0) {
    clients.set(client.name, client);
  }
};

const normalizeGuarantees = (
  guarantees: HttpClientGuarantees | undefined,
): HttpClientGuarantees => {
  if (guarantees === undefined) {
    return {};
  }
  const maxRetries = guarantees.maxRetries;
  return {
    ...(guarantees.timeout === true ? { timeout: true } : {}),
    ...(guarantees.responseValidation === true ? { responseValidation: true } : {}),
    ...(maxRetries !== undefined && Number.isFinite(maxRetries) && maxRetries >= 0
      ? { maxRetries }
      : {}),
  };
};

const clientForCall = (
  callee: string,
  clients: readonly ClientDefinition[],
): ClientDefinition | undefined => {
  return clients.find((client) => {
    if (client.kind === "fetch") {
      return callee === client.name;
    }
    if (callee === client.name) {
      return true;
    }
    const prefix = `${client.name}.`;
    return callee.startsWith(prefix) && axiosMethods.has(callee.slice(prefix.length));
  });
};

const functionState = (
  target: FunctionTarget,
  document: ParsedDocument,
  requests: readonly RequestEvidence[],
  context: ConfigurationContext,
): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    function: target.source,
    recognized_requests: requests.map((request) => ({
      callee: request.callee,
      expression: request.source,
      client: {
        name: request.client.name,
        kind: request.client.kind,
        source: request.client.source,
        guarantees: guaranteesState(request.client.guarantees),
      },
    })),
    visible_client_configuration: context.source,
    configuration_context_truncated: context.truncated,
  };
};

const guaranteesState = (guarantees: HttpClientGuarantees): JsonValue => {
  return {
    timeout: guarantees.timeout ?? false,
    response_validation: guarantees.responseValidation ?? false,
    max_retries: guarantees.maxRetries ?? null,
  };
};

const configurationContext = (
  source: string,
  clients: readonly ClientDefinition[],
  maximum: number,
): ConfigurationContext => {
  if (maximum <= 0) {
    return { source: "", truncated: true };
  }
  const names = clients.map((client) => client.name).filter((name) => !name.includes("."));
  if (names.length === 0) {
    return { source: "", truncated: false };
  }
  const clientPattern = new RegExp(
    `\\b(?:${names.map((name) => escapeRegExp(name)).join("|")})\\b`,
    "u",
  );
  const lines = source.split("\n");
  const selected = new Set<number>();
  lines.forEach((line, index) => {
    if (
      clientPattern.test(line) &&
      /\b(?:axiosRetry|create|defaults|interceptors?|retry|retries|timeout)\b/iu.test(line)
    ) {
      for (let offset = -2; offset <= 2; offset += 1) {
        if (lines[index + offset] !== undefined) {
          selected.add(index + offset);
        }
      }
    }
  });
  const context = [...selected]
    .toSorted((left, right) => left - right)
    .map((index) => lines[index])
    .join("\n");
  return { source: context.slice(0, maximum), truncated: context.length > maximum };
};

const sourceOutsideFunctions = (document: ParsedDocument): string => {
  const ranges = document.functions
    .map((target) => target.range)
    .toSorted((left, right) => left.start - right.start);
  let cursor = 0;
  let source = "";
  for (const range of ranges) {
    if (range.end <= cursor) {
      continue;
    }
    source += document.source.slice(cursor, Math.max(cursor, range.start));
    source += document.source
      .slice(Math.max(cursor, range.start), range.end)
      .replaceAll(/[^\n]/gu, " ");
    cursor = range.end;
  }
  return source + document.source.slice(cursor);
};

const hasRetryEvidence = (
  functionSource: string,
  context: string,
  requests: readonly RequestEvidence[],
): boolean => {
  return (
    retryEvidencePattern.test(functionSource) ||
    retryEvidencePattern.test(context) ||
    requests.some((request) => request.client.guarantees.maxRetries !== undefined)
  );
};

const resolveOptions = (options: HttpClientRuleOptions = {}): ResolvedOptions => {
  return {
    threshold: options.threshold ?? 0.85,
    minConfidence: options.minConfidence ?? 0.7,
    recognizedClients: options.recognizedClients ?? [],
    maxFunctionCharacters: options.maxFunctionCharacters ?? 12_000,
    maxContextCharacters: options.maxContextCharacters ?? 4_000,
  };
};

const importSource = (statement: string): string | undefined => {
  return (
    /\bfrom\s+["']([^"']+)["']/u.exec(statement)?.[1] ??
    /^\s*import\s+["']([^"']+)["']/u.exec(statement)?.[1]
  );
};

const defaultOrNamespaceImports = (statement: string): string[] => {
  const clause = /^\s*import\s+(.+?)\s+from\s+["']/u.exec(statement)?.[1];
  if (clause === undefined) {
    return [];
  }
  const names: string[] = [];
  const defaultName = /^\s*([A-Za-z_$][\w$]*)/u.exec(clause)?.[1];
  if (defaultName !== undefined) {
    names.push(defaultName);
  }
  const namespaceName = /\*\s+as\s+([A-Za-z_$][\w$]*)/u.exec(clause)?.[1];
  if (namespaceName !== undefined) {
    names.push(namespaceName);
  }
  return names;
};

const importedNames = (statement: string, imported: string): string[] => {
  const names: string[] = [];
  const defaultName = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/u.exec(statement)?.[1];
  if (defaultName !== undefined && imported === "fetch") {
    names.push(defaultName);
  }
  const namedBlock = /\{([^}]*)\}/u.exec(statement)?.[1];
  if (namedBlock !== undefined) {
    for (const entry of namedBlock.split(",")) {
      const match = new RegExp(
        `^\\s*${escapeRegExp(imported)}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?\\s*$`,
        "u",
      ).exec(entry);
      if (match !== null) {
        names.push(match[1] ?? imported);
      }
    }
  }
  return names;
};

const hasImportedBinding = (imports: readonly string[], name: string): boolean => {
  return imports.some((statement) => {
    if (importSource(statement) === "node-fetch" || importSource(statement) === "undici") {
      return false;
    }
    return new RegExp(`\\b${escapeRegExp(name)}\\b`, "u").test(statement);
  });
};

const hasDocumentDeclaration = (source: string, name: string): boolean => {
  return new RegExp(`\\b(?:class|const|function|let|var)\\s+${escapeRegExp(name)}\\b`, "u").test(
    source,
  );
};

const shadowsBareFetch = (functionSource: string): boolean => {
  const arrow = functionSource.indexOf("=>");
  const bodyStart = arrow === -1 ? functionSource.indexOf("{") : arrow;
  const signature = bodyStart === -1 ? "" : functionSource.slice(0, bodyStart);
  return /\bfetch\b/u.test(signature);
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

const escapeRegExp = (value: string): string => {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
};
