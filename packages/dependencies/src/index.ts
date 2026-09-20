import type {
  FunctionTarget,
  JsonValue,
  ParsedDocument,
  RuleFactory,
  ScruplePlugin,
  SemanticRule,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";

export const maximumEvidenceExcerptCharacters = 2_000;
export const maximumEvidenceExcerptLines = 40;

export interface BoundedExcerpt {
  path: string;
  startLine: number;
  endLine: number;
  source: string;
}

export interface DependencyFeatureEvidence {
  dependency: string;
  capability: string;
  manifest: {
    path: string;
    specifier: string;
  };
  dependencyImport: {
    filename: string;
    source: string;
  };
  capabilityExcerpt: BoundedExcerpt;
  localSymbol: {
    filename: string;
    name: string;
    searchQuery: string;
    excerpt: BoundedExcerpt;
  };
}

export interface NoReimplementedDependencyFeatureOptions {
  threshold?: number;
  minConfidence?: number;
  evidence?: readonly DependencyFeatureEvidence[];
}

export type DependenciesPlugin = ScruplePlugin<{
  "no-reimplemented-dependency-feature": RuleFactory<NoReimplementedDependencyFeatureOptions>;
}>;

export const dependencies = (): DependenciesPlugin => {
  return definePlugin({
    rules: {
      "no-reimplemented-dependency-feature": noReimplementedDependencyFeature,
    },
  });
};

const noReimplementedDependencyFeature = (
  options: NoReimplementedDependencyFeatureOptions = {},
): SemanticRule => {
  const threshold = options.threshold ?? 0.9;
  const minConfidence = options.minConfidence ?? 0.7;
  const evidence = (options.evidence ?? []).filter((entry) => hasMinimumEvidence(entry));

  return {
    description: "Local code should not reimplement an established dependency capability.",
    collect(document) {
      return evidence.flatMap((entry) => {
        const fn = matchingFunction(document, entry);
        if (fn === undefined) {
          return [];
        }
        return [
          {
            target: fn,
            state: featureState(fn, document, entry),
            question: {
              type: "choice" as const,
              instructions:
                "Does `local_function` substantially reimplement `dependency_capability`, and can the established dependency API replace it without losing required behavior? Use only the supplied evidence. Package presence, similar naming, or partial overlap is not enough.",
              criteria: {
                dependency_reimplementation:
                  "The local function duplicates the established dependency capability and the evidenced dependency API is applicable to its required behavior.",
                distinct_or_adapting_behavior:
                  "The local function provides materially different behavior or is a necessary adapter around the dependency capability.",
                insufficient_context:
                  "The bounded evidence does not establish equivalent behavior or that the dependency API is applicable here.",
              },
            },
          },
        ];
      });
    },
    diagnose(answer, candidate) {
      if (answer.type !== "choice") {
        return null;
      }
      const probability = answer.probabilities["dependency_reimplementation"] ?? 0;
      if (
        answer.choice !== "dependency_reimplementation" ||
        probability < threshold ||
        answer.confidence < minConfidence
      ) {
        return null;
      }
      return {
        message:
          "This function appears to reimplement a capability provided by an installed dependency.",
        filename: candidate.target.filename,
        location: candidate.target.location,
        probability,
        confidence: answer.confidence,
      };
    },
  };
};

const featureState = (
  fn: FunctionTarget,
  document: ParsedDocument,
  evidence: DependencyFeatureEvidence,
): JsonValue => {
  return {
    language: document.language,
    local_function: fn.source,
    dependency_capability: {
      dependency: evidence.dependency,
      capability: evidence.capability,
      manifest: {
        path: evidence.manifest.path,
        specifier: evidence.manifest.specifier,
      },
      import: {
        filename: evidence.dependencyImport.filename,
        source: evidence.dependencyImport.source,
      },
      excerpt: excerptState(evidence.capabilityExcerpt),
    },
    local_evidence: {
      symbol: evidence.localSymbol.name,
      search_query: evidence.localSymbol.searchQuery,
      excerpt: excerptState(evidence.localSymbol.excerpt),
    },
  };
};

const excerptState = (excerpt: BoundedExcerpt): JsonValue => {
  return {
    path: excerpt.path,
    startLine: excerpt.startLine,
    endLine: excerpt.endLine,
    source: excerpt.source,
  };
};

const matchingFunction = (
  document: ParsedDocument,
  evidence: DependencyFeatureEvidence,
): FunctionTarget | undefined => {
  if (document.filename !== evidence.localSymbol.filename) {
    return undefined;
  }
  return document.functions.find(
    (fn) =>
      fn.kind === "function" &&
      fn.name === evidence.localSymbol.name &&
      fn.source.includes(evidence.localSymbol.excerpt.source),
  );
};

const hasMinimumEvidence = (evidence: DependencyFeatureEvidence): boolean => {
  return (
    isNonempty(evidence.dependency) &&
    isNonempty(evidence.capability) &&
    isNonempty(evidence.manifest.path) &&
    isNonempty(evidence.manifest.specifier) &&
    isNonempty(evidence.dependencyImport.filename) &&
    importReferencesDependency(evidence.dependencyImport.source, evidence.dependency) &&
    isBoundedExcerpt(evidence.capabilityExcerpt) &&
    isNonempty(evidence.localSymbol.filename) &&
    isNonempty(evidence.localSymbol.name) &&
    isNonempty(evidence.localSymbol.searchQuery) &&
    evidence.localSymbol.excerpt.path === evidence.localSymbol.filename &&
    isBoundedExcerpt(evidence.localSymbol.excerpt)
  );
};

const importReferencesDependency = (source: string, dependency: string): boolean => {
  return source.includes(`"${dependency}"`) || source.includes(`'${dependency}'`);
};

const isBoundedExcerpt = (excerpt: BoundedExcerpt): boolean => {
  return (
    isNonempty(excerpt.path) &&
    isNonempty(excerpt.source) &&
    excerpt.source.length <= maximumEvidenceExcerptCharacters &&
    Number.isInteger(excerpt.startLine) &&
    Number.isInteger(excerpt.endLine) &&
    excerpt.startLine > 0 &&
    excerpt.endLine >= excerpt.startLine &&
    excerpt.endLine - excerpt.startLine + 1 <= maximumEvidenceExcerptLines
  );
};

const isNonempty = (value: string): boolean => {
  return value.trim().length > 0;
};
