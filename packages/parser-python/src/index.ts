import type {
  CallCapture,
  CommentTarget,
  ErrorHandlerExitCapture,
  ErrorHandlerTarget,
  FunctionTarget,
  ParsedDocument,
  ParseIssue,
  SourceLocation,
  SourceParser,
  SourceRange,
} from "@scruple/core";
import { Language, type Node as SyntaxNode, Parser } from "web-tree-sitter";

const supportedExtensions = new Set([".py", ".pyi"]);
const functionTypes = new Set(["function_definition", "lambda"]);
let languagePromise: Promise<Language> | undefined;

export const pythonParser = (): SourceParser => ({
  id: "python",
  languages: ["python"],
  filePatterns: ["**/*.{py,pyi}"],

  supports(filename) {
    return supportedExtensions.has(extension(filename));
  },

  async parse(filename, source) {
    const language = await loadLanguage();
    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(source);
    if (tree === null) {
      parser.delete();
      throw new Error("Tree-sitter did not return a Python syntax tree");
    }
    try {
      const root = tree.rootNode;
      const functions = collectFunctions(root, filename, source);
      return {
        filename,
        language: "python",
        source,
        imports: descendants(root, new Set(["import_statement", "import_from_statement"])).map(
          (node) => node.text,
        ),
        comments: descendants(root, new Set(["comment"])).map((node) =>
          commentTarget(node, filename, source, functions),
        ),
        functions,
        errorHandlers: collectErrorHandlers(root, filename, source, functions),
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
    Language.load(new URL("./tree-sitter-python.wasm", import.meta.url)),
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
      language: "python",
      range,
      location: locationOf(node),
      source: source.slice(range.start, range.end),
      async:
        node.type === "function_definition" &&
        node.children.some((child) => child.type === "async"),
      calls: callsWithin(node, source),
      role: isClassMethod(node) ? "method" : "function",
    };
    if (name !== undefined) {
      target.name = name;
    }
    return target;
  });

const isClassMethod = (node: SyntaxNode): boolean => {
  let parent = node.parent;
  while (parent !== null && !functionTypes.has(parent.type)) {
    if (parent.type === "class_definition") {
      return true;
    }
    parent = parent.parent;
  }
  return false;
};

const collectErrorHandlers = (
  root: SyntaxNode,
  filename: string,
  source: string,
  functions: FunctionTarget[],
): ErrorHandlerTarget[] =>
  descendants(root, new Set(["except_clause"])).map((node) => {
    const body = node.namedChildren.find((child) => child.type === "block") ?? node;
    const range = rangeOf(node);
    const enclosing = smallestEnclosingFunction(functions, range);
    const value = node.childForFieldName("value");
    const binding = value?.childForFieldName("alias")?.text;
    const target: ErrorHandlerTarget = {
      kind: "error-handler",
      filename,
      language: "python",
      range,
      location: locationOf(node),
      source: source.slice(range.start, range.end),
      bodySource: body.text,
      trySource: node.parent?.type === "try_statement" ? node.parent.text : node.text,
      calls: callsWithin(body, source),
      exits: exitsWithin(body, source),
    };
    if (binding !== undefined) {
      target.binding = binding;
    }
    if (enclosing !== undefined) {
      target.enclosingSource = enclosing.source;
    }
    return target;
  });

const callsWithin = (root: SyntaxNode, source: string): CallCapture[] => {
  const calls: CallCapture[] = [];
  walkNested(root, root, (node) => {
    if (node.type !== "call") {
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

const exitsWithin = (root: SyntaxNode, source: string): ErrorHandlerExitCapture[] => {
  const exits: ErrorHandlerExitCapture[] = [];
  walkNested(root, root, (node) => {
    if (node.type !== "return_statement" && node.type !== "raise_statement") {
      return;
    }
    const range = rangeOf(node);
    exits.push({
      kind: node.type === "return_statement" ? "return" : "throw",
      range,
      source: source.slice(range.start, range.end),
    });
  });
  return exits;
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
  const enclosing = smallestEnclosingFunction(functions, range);
  const target: CommentTarget = {
    kind: "comment",
    filename,
    language: "python",
    range,
    location: locationOf(node),
    source: source.slice(range.start, range.end),
    style: "line",
    value: node.text.slice(1),
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
          ? `Python parser expected ${node.type}`
          : "Python parser encountered unrecognized syntax",
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
