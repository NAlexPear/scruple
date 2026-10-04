import type {
  CallCapture,
  CommentTarget,
  FunctionTarget,
  ParsedDocument,
  ParseIssue,
  SourceLocation,
  SourceParser,
  SourceRange,
} from "@scruple/core";
import { Language, type Node as SyntaxNode, Parser } from "web-tree-sitter";

const functionTypes = new Set(["function_declaration", "method_declaration", "func_literal"]);
let languagePromise: Promise<Language> | undefined;

export const goParser = (): SourceParser => ({
  id: "go",
  languages: ["go"],
  filePatterns: ["**/*.go"],

  supports(filename) {
    return extension(filename) === ".go";
  },

  async parse(filename, source) {
    const language = await loadLanguage();
    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(source);
    if (tree === null) {
      parser.delete();
      throw new Error("Tree-sitter did not return a Go syntax tree");
    }
    try {
      const root = tree.rootNode;
      const functions = collectFunctions(root, filename, source);
      return {
        filename,
        language: "go",
        source,
        imports: descendants(root, new Set(["import_declaration"])).map((node) => node.text),
        comments: descendants(root, new Set(["comment"])).map((node) =>
          commentTarget(node, filename, source, functions),
        ),
        functions,
        errorHandlers: [],
        issues: collectIssues(root),
      } satisfies ParsedDocument;
    } finally {
      tree.delete();
      parser.delete();
    }
  },
});

const loadLanguage = (): Promise<Language> => {
  languagePromise ??= Parser.init().then(() =>
    Language.load(new URL("./tree-sitter-go.wasm", import.meta.url)),
  );
  return languagePromise;
};

const collectFunctions = (root: SyntaxNode, filename: string, source: string): FunctionTarget[] =>
  descendants(root, functionTypes).map((node) => {
    const range = rangeOf(node);
    const name = node.childForFieldName("name")?.text;
    const target: FunctionTarget = {
      kind: "function",
      filename,
      language: "go",
      range,
      location: locationOf(node),
      source: source.slice(range.start, range.end),
      async: false,
      calls: callsWithin(node, source),
      role: node.type === "method_declaration" ? "method" : "function",
    };
    if (name !== undefined) {
      target.name = name;
    }
    return target;
  });

const callsWithin = (root: SyntaxNode, source: string): CallCapture[] => {
  const calls: CallCapture[] = [];
  walkNested(root, root, (node) => {
    if (node.type !== "call_expression") {
      return;
    }
    const range = rangeOf(node);
    const callee = node.childForFieldName("function")?.text;
    if (callee !== undefined) {
      calls.push({ callee, range, source: source.slice(range.start, range.end) });
    }
  });
  return calls;
};

const walkNested = (
  node: SyntaxNode,
  root: SyntaxNode,
  visit: (node: SyntaxNode) => void,
): void => {
  visit(node);
  for (const child of node.namedChildren) {
    if (child.id !== root.id && functionTypes.has(child.type)) {
      continue;
    }
    walkNested(child, root, visit);
  }
};

const commentTarget = (
  node: SyntaxNode,
  filename: string,
  source: string,
  functions: FunctionTarget[],
): CommentTarget => {
  const range = rangeOf(node);
  const text = source.slice(range.start, range.end);
  const block = text.startsWith("/*");
  const enclosing = smallestEnclosingFunction(functions, range);
  const target: CommentTarget = {
    kind: "comment",
    filename,
    language: "go",
    range,
    location: locationOf(node),
    source: text,
    style: block ? "block" : "line",
    value: block ? text.slice(2, -2) : text.slice(2),
  };
  if (enclosing !== undefined) {
    target.enclosingSource = enclosing.source;
  }
  return target;
};

const descendants = (root: SyntaxNode, types: ReadonlySet<string>): SyntaxNode[] => {
  const found: SyntaxNode[] = [];
  const visit = (node: SyntaxNode): void => {
    if (types.has(node.type)) {
      found.push(node);
    }
    for (const child of node.namedChildren) {
      visit(child);
    }
  };
  visit(root);
  return found;
};

const collectIssues = (root: SyntaxNode): ParseIssue[] => {
  const issues: ParseIssue[] = [];
  const visit = (node: SyntaxNode): void => {
    if (node.isError || node.isMissing) {
      issues.push({
        message: node.isMissing
          ? `Go parser expected ${node.type}`
          : "Go parser encountered unrecognized syntax",
        severity: "error",
        range: rangeOf(node),
      });
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(root);
  return issues;
};

const smallestEnclosingFunction = (
  functions: FunctionTarget[],
  range: SourceRange,
): FunctionTarget | undefined =>
  functions
    .filter((fn) => fn.range.start <= range.start && fn.range.end >= range.end)
    .toSorted((left, right) => rangeLength(left.range) - rangeLength(right.range))[0];

const rangeOf = (node: SyntaxNode): SourceRange => ({
  start: node.startIndex,
  end: node.endIndex,
});

const locationOf = (node: SyntaxNode): SourceLocation => ({
  start: { line: node.startPosition.row + 1, column: node.startPosition.column + 1 },
  end: { line: node.endPosition.row + 1, column: node.endPosition.column + 1 },
});

const rangeLength = (range: SourceRange): number => range.end - range.start;

const extension = (filename: string): string =>
  /\.[^.\\/]+$/u.exec(filename.toLowerCase())?.[0] ?? "";
