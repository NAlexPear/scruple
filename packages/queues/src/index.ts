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

export interface QueueRuleOptions {
  threshold?: number;
  minConfidence?: number;
}

export type QueuesPlugin = ScruplePlugin<{
  "require-idempotent-handler": RuleFactory<QueueRuleOptions>;
  "no-acknowledge-before-processing": RuleFactory<QueueRuleOptions>;
  "require-dead-letter-policy": RuleFactory<QueueRuleOptions>;
}>;

interface QueueApi {
  id: string;
  packagePattern: RegExp;
  registrations: readonly RegistrationPattern[];
  acknowledgements: readonly RegExp[];
  configurations: readonly ConfigurationPattern[];
}

interface RegistrationPattern {
  callee: RegExp;
  source?: RegExp;
}

interface ConfigurationPattern {
  callee: RegExp;
  source?: RegExp;
}

interface HandlerEvidence {
  api: QueueApi;
  registration: CallCapture;
  handler: FunctionTarget;
  imports: string[];
}

interface ConfigurationEvidence {
  api: QueueApi;
  call: CallCapture;
  owner: FunctionTarget;
}

const queueApis: readonly QueueApi[] = [
  {
    id: "amqplib",
    packagePattern: /["']amqplib(?:\/callback_api)?["']/u,
    registrations: [{ callee: /(?:^|\.)consume$/u }],
    acknowledgements: [/(?:^|\.)ack$/u],
    configurations: [{ callee: /(?:^|\.)assertQueue$/u }],
  },
  {
    id: "kafkajs",
    packagePattern: /["']kafkajs["']/u,
    registrations: [{ callee: /(?:^|\.)run$/u, source: /\beach(?:Message|Batch)\s*:/u }],
    acknowledgements: [],
    configurations: [],
  },
  {
    id: "sqs-consumer",
    packagePattern: /["']sqs-consumer["']/u,
    registrations: [{ callee: /(?:^|\.)create$/u, source: /\bhandleMessage(?:Batch)?\s*:/u }],
    acknowledgements: [],
    configurations: [],
  },
  {
    id: "google-pubsub",
    packagePattern: /["']@google-cloud\/pubsub["']/u,
    registrations: [{ callee: /(?:^|\.)on$/u, source: /^\s*[^\n]*\.on\(\s*["']message["']/u }],
    acknowledgements: [/(?:^|\.)ack$/u],
    configurations: [{ callee: /(?:^|\.)createSubscription$/u }],
  },
];

export const queues = (): QueuesPlugin => {
  return definePlugin({
    rules: {
      "require-idempotent-handler": requireIdempotentHandler,
      "no-acknowledge-before-processing": noAcknowledgeBeforeProcessing,
      "require-dead-letter-policy": requireDeadLetterPolicy,
    },
  });
};

const requireIdempotentHandler = (options: QueueRuleOptions = {}): SemanticRule => {
  return handlerRule({
    description: "Queue handlers should safely tolerate redelivery.",
    options,
    collect: (document) => collectHandlers(document).map((evidence) => handlerCandidate(evidence)),
    instructions:
      "Does this queue handler visibly make repeated delivery of the same message safe? Require concrete evidence such as an idempotency key passed to the side effect, a durable processed-message or unique-key check, an upsert/conditional write with equivalent semantics, or naturally idempotent operations. A message ID alone, retries, ordering, or an in-memory check is not sufficient. Do not assume broker deduplication or deployment settings that are not visible.",
    criteria: {
      idempotent:
        "The visible handler makes duplicate delivery harmless or durably suppresses duplicate effects.",
      non_idempotent:
        "The visible handler can repeat an externally observable effect when the same message is delivered again.",
      insufficient_context:
        "Idempotency may be implemented inside a called helper, data constraint, broker, or deployment configuration that is not visible.",
    },
    finding: "non_idempotent",
    message:
      "This queue handler does not visibly protect its side effects from message redelivery.",
  });
};

const noAcknowledgeBeforeProcessing = (options: QueueRuleOptions = {}): SemanticRule => {
  return handlerRule({
    description: "Explicit queue acknowledgements should follow successful processing.",
    options,
    collect(document) {
      return collectHandlers(document).flatMap((evidence) => {
        const acknowledgements = evidence.handler.calls.filter((call) =>
          matchesAny(call.callee, evidence.api.acknowledgements),
        );
        if (acknowledgements.length !== 1) {
          return [];
        }
        return [handlerCandidate(evidence, acknowledgements[0])];
      });
    },
    instructions:
      "Does the selected delivery acknowledgement occur before processing has succeeded? Processing includes every required side effect and, when used, successful transaction commit. Distinguish the queue client's delivery acknowledgement from unrelated methods named `ack`. Do not treat a failure acknowledgement, offset resolution, or a library's automatic acknowledgement as this selected explicit acknowledgement.",
    criteria: {
      safely_after_processing:
        "The selected delivery acknowledgement runs only after all required processing and transaction commits succeed.",
      before_processing_complete:
        "The selected delivery acknowledgement can run before a required operation or transaction commit succeeds.",
      not_delivery_acknowledgement:
        "The selected call is not an acknowledgement for the delivered queue message.",
      insufficient_context:
        "Control flow or processing boundaries are not visible enough to establish acknowledgement order.",
    },
    finding: "before_processing_complete",
    message: "Acknowledge this message only after processing and any transaction commit succeed.",
  });
};

const requireDeadLetterPolicy = (options: QueueRuleOptions = {}): SemanticRule => {
  return handlerRule({
    description: "Queue declarations should configure a dead-letter destination and retry limit.",
    options,
    collect: (document) =>
      collectConfigurations(document).map((evidence) => ({
        target: evidence.owner,
        state: configurationState(evidence, document),
        data: { api: evidence.api.id, configuration: evidence.call.source },
        question: deadLetterQuestion,
      })),
    instructions: deadLetterQuestion.instructions,
    criteria: deadLetterQuestion.criteria,
    finding: "missing_policy",
    message:
      "This queue declaration does not visibly configure both a dead-letter destination and bounded delivery attempts.",
  });
};

const deadLetterQuestion = {
  type: "choice" as const,
  instructions:
    "Does this authoritative queue or subscription declaration visibly configure both a dead-letter destination and a bounded retry or delivery-attempt policy? For RabbitMQ, a dead-letter exchange without a visible bounded delivery mechanism is incomplete. Judge only the selected declaration; do not infer deployment configuration from consumer code, comments, names, or unrelated calls.",
  criteria: {
    configured:
      "The declaration visibly supplies a dead-letter destination and a bounded retry or delivery-attempt policy.",
    missing_policy:
      "The declaration visibly omits either the dead-letter destination or the bounded attempt policy.",
    insufficient_context:
      "The selected call is not authoritative configuration or delegates material policy to unavailable code.",
  },
};

interface HandlerRuleDefinition {
  description: string;
  options: QueueRuleOptions;
  collect(document: ParsedDocument): RuleCandidate[];
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
  finding: string;
  message: string;
}

const handlerRule = (definition: HandlerRuleDefinition): SemanticRule => {
  const threshold = definition.options.threshold ?? 0.85;
  const minConfidence = definition.options.minConfidence ?? 0.7;
  return {
    description: definition.description,
    collect(document) {
      return definition.collect(document).map((candidate) => {
        candidate.question = {
          type: "choice" as const,
          instructions: definition.instructions,
          criteria: definition.criteria,
        };
        return candidate;
      });
    },
    diagnose(answer, candidate) {
      if (!isFinding(answer, definition.finding, threshold, minConfidence)) {
        return null;
      }
      return diagnostic(candidate, definition.message, answer, definition.finding);
    },
  };
};

const collectHandlers = (document: ParsedDocument): HandlerEvidence[] => {
  return matchingApis(document).flatMap((api) =>
    allCalls(document)
      .filter((call) => matchesRegistration(call, api.registrations))
      .flatMap((registration) => {
        const enclosed = document.functions.filter(
          (fn) =>
            fn.range.start > registration.range.start && fn.range.end < registration.range.end,
        );
        const direct = enclosed.filter(
          (candidate) =>
            !enclosed.some(
              (other) =>
                other !== candidate &&
                other.range.start < candidate.range.start &&
                other.range.end > candidate.range.end,
            ),
        );
        const handler = direct[0];
        return direct.length === 1 && handler !== undefined
          ? [{ api, registration, handler, imports: document.imports }]
          : [];
      }),
  );
};

const collectConfigurations = (document: ParsedDocument): ConfigurationEvidence[] => {
  return matchingApis(document).flatMap((api) =>
    document.functions.flatMap((owner) =>
      owner.calls
        .filter((call) => matchesConfiguration(call, api.configurations))
        .map((call) => ({ api, call, owner })),
    ),
  );
};

const handlerCandidate = (
  evidence: HandlerEvidence,
  acknowledgement?: CallCapture,
): RuleCandidate => {
  const data: Record<string, JsonValue> = {
    api: evidence.api.id,
    registration: evidence.registration.source,
  };
  if (acknowledgement !== undefined) {
    data["acknowledgement"] = acknowledgement.source;
  }
  return {
    target: evidence.handler,
    state: {
      language: evidence.handler.language,
      imports: evidence.imports,
      api: evidence.api.id,
      registration: evidence.registration.source,
      handler: evidence.handler.source,
      calls: evidence.handler.calls.map((call) => call.source),
      ...(acknowledgement === undefined
        ? {}
        : { selected_acknowledgement: acknowledgement.source }),
    },
    data,
    question: { type: "choice", instructions: "", criteria: {} },
  };
};

const configurationState = (
  evidence: ConfigurationEvidence,
  document: ParsedDocument,
): JsonValue => {
  return {
    language: document.language,
    imports: document.imports,
    api: evidence.api.id,
    configuration: evidence.call.source,
    enclosing_function: evidence.owner.source,
  };
};

const matchingApis = (document: ParsedDocument): readonly QueueApi[] => {
  return queueApis.filter((api) =>
    document.imports.some((declaration) => matches(declaration, api.packagePattern)),
  );
};

const allCalls = (document: ParsedDocument): CallCapture[] => {
  const calls = new Map<string, CallCapture>();
  for (const call of document.functions.flatMap((fn) => fn.calls)) {
    calls.set(`${call.range.start}:${call.range.end}`, call);
  }
  return [...calls.values()].toSorted((left, right) => left.range.start - right.range.start);
};

const matchesRegistration = (
  call: CallCapture,
  patterns: readonly RegistrationPattern[],
): boolean => {
  return patterns.some(
    (pattern) =>
      matches(call.callee, pattern.callee) &&
      (pattern.source === undefined || matches(call.source, pattern.source)),
  );
};

const matchesConfiguration = (
  call: CallCapture,
  patterns: readonly ConfigurationPattern[],
): boolean => {
  return patterns.some(
    (pattern) =>
      matches(call.callee, pattern.callee) &&
      (pattern.source === undefined || matches(call.source, pattern.source)),
  );
};

const matchesAny = (value: string, patterns: readonly RegExp[]): boolean => {
  return patterns.some((pattern) => matches(value, pattern));
};

const matches = (value: string, pattern: RegExp): boolean => {
  pattern.lastIndex = 0;
  return pattern.test(value);
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
