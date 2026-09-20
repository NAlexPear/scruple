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

export interface ApiContractRuleOptions {
  threshold?: number;
  minConfidence?: number;
}

export type ApiContractsPlugin = ScruplePlugin<{
  "no-misleading-function-names": RuleFactory<ApiContractRuleOptions>;
  "no-ambiguous-failure-contracts": RuleFactory<ApiContractRuleOptions>;
  "require-input-validation": RuleFactory<ApiContractRuleOptions>;
}>;

const maxFunctionCharacters = 12_000;
const contextCharacters = 600;

export const apiContracts = (): ApiContractsPlugin => {
  return definePlugin({
    rules: {
      "no-misleading-function-names": noMisleadingFunctionNames,
      "no-ambiguous-failure-contracts": noAmbiguousFailureContracts,
      "require-input-validation": requireInputValidation,
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
  return choiceRule({
    description: "Untrusted API inputs should be validated before they are used.",
    options,
    defaults: { threshold: 0.85, minConfidence: 0.7 },
    select: directlyExportedFunctions,
    question: {
      instructions:
        "Does this directly exported function visibly form an untrusted input boundary and use that input without runtime validation? Request objects, raw payloads, unknown data, headers, query values, and webhook bodies are boundary evidence. Schema parsing, framework validation calls visible in the function, explicit guards, and validated domain types are counter-evidence. Type annotations alone do not validate raw boundary data. A direct export does not establish its callers: choose insufficient_context when the evidence does not establish that input is untrusted, and never assume validation occurs in unseen callers or middleware.",
      criteria: {
        validation_present:
          "The function visibly validates or parses untrusted input before using it, including through a recognizable schema or framework validation API.",
        validation_required:
          "The function visibly accepts untrusted boundary data and uses it without visible runtime validation.",
        trusted_input:
          "The contract explicitly receives a validated or trusted domain value rather than raw boundary data.",
        insufficient_context:
          "The per-file evidence does not establish input trust, caller behavior, middleware, or validation semantics strongly enough.",
      },
    },
    finding: "validation_required",
    message: "This exported boundary appears to use untrusted input without runtime validation.",
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

interface SelectedFunction {
  fn: FunctionTarget;
  exportEvidence?: string;
}

const choiceRule = (definition: ChoiceRuleDefinition): SemanticRule => {
  const threshold = definition.options.threshold ?? definition.defaults.threshold;
  const minConfidence = definition.options.minConfidence ?? definition.defaults.minConfidence;
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
