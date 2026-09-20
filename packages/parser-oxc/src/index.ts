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
import { parseSync, visitorKeys, type Comment, type OxcError } from "oxc-parser";

type AstNode = Record<string, unknown> & {
  type: string;
  start: number;
  end: number;
  body?: unknown;
  async?: unknown;
  callee?: unknown;
  arguments?: unknown;
  value?: unknown;
  name?: unknown;
  id?: unknown;
  key?: unknown;
  expression?: unknown;
  object?: unknown;
  property?: unknown;
};

const supportedExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const functionTypes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
]);
const testCallees = new Set(["test", "it", "specify"]);

export interface OxcParserOptions {
  testCallees?: string[];
}

export function oxcParser(options: OxcParserOptions = {}): SourceParser {
  const configuredTestCallees = new Set(options.testCallees ?? testCallees);

  return {
    id: "oxc",

    supports(filename) {
      return supportedExtensions.has(extension(filename));
    },

    parse(filename, source) {
      const result = parseSync(filename, source, {
        sourceType: "unambiguous",
        preserveParens: false,
      });
      const program: unknown = result.program;
      if (!isNode(program)) {
        throw new Error("OXC returned an invalid program");
      }

      const language = languageFor(filename);
      const locate = createLocator(source);
      const imports = collectImports(program, source);
      const functions = collectFunctions(
        program,
        source,
        filename,
        language,
        locate,
        configuredTestCallees,
      );
      const comments = result.comments.map((comment) =>
        convertComment(comment, source, filename, language, locate, functions),
      );

      return {
        filename,
        language,
        source,
        imports,
        comments,
        functions,
        issues: result.errors.map(convertError),
      } satisfies ParsedDocument;
    },
  };
}

function collectImports(program: AstNode, source: string): string[] {
  const body = Array.isArray(program.body) ? program.body : [];
  return body
    .filter((value) => isNode(value))
    .filter((node) => node.type === "ImportDeclaration")
    .map((node) => source.slice(node.start, node.end));
}

function collectFunctions(
  program: AstNode,
  source: string,
  filename: string,
  language: string,
  locate: (range: SourceRange) => SourceLocation,
  configuredTestCallees: Set<string>,
): FunctionTarget[] {
  const functions: FunctionTarget[] = [];
  const stack: FunctionTarget[] = [];

  walk(program, undefined, {
    enter(node, parent) {
      if (functionTypes.has(node.type)) {
        const test = getTestDetails(node, parent, configuredTestCallees);
        const name = functionName(node, parent);
        const target: FunctionTarget = {
          kind: test ? "test" : "function",
          filename,
          language,
          range: rangeOf(node),
          location: locate(rangeOf(node)),
          source: source.slice(node.start, node.end),
          async: node.async === true,
          calls: [],
        };
        if (name !== undefined) {
          target.name = name;
        }
        if (test?.name !== undefined) {
          target.testName = test.name;
        }
        functions.push(target);
        stack.push(target);
      }

      if (node.type === "CallExpression" && stack.length > 0) {
        const callee = getCalleeName(node.callee);
        const currentFunction = stack.at(-1);
        if (callee !== undefined && currentFunction !== undefined) {
          const call: CallCapture = {
            callee,
            range: rangeOf(node),
            source: source.slice(node.start, node.end),
          };
          currentFunction.calls.push(call);
        }
      }
    },

    leave(node) {
      if (functionTypes.has(node.type)) {
        stack.pop();
      }
    },
  });

  return functions;
}

function convertComment(
  comment: Comment,
  source: string,
  filename: string,
  language: string,
  locate: (range: SourceRange) => SourceLocation,
  functions: FunctionTarget[],
): CommentTarget {
  const range = { start: comment.start, end: comment.end };
  const enclosing = functions
    .filter((fn) => fn.range.start <= range.start && fn.range.end >= range.end)
    .toSorted((left, right) => rangeLength(left.range) - rangeLength(right.range))[0];

  const target: CommentTarget = {
    kind: "comment",
    filename,
    language,
    range,
    location: locate(range),
    source: source.slice(range.start, range.end),
    style: comment.type === "Line" ? "line" : "block",
    value: comment.value,
  };
  if (enclosing !== undefined) {
    target.enclosingSource = enclosing.source;
  }
  return target;
}

function convertError(error: OxcError): ParseIssue {
  const label = error.labels[0];
  const severity: string = error.severity;
  return {
    message: error.message,
    severity: severity === "Error" ? "error" : "warning",
    ...(label ? { range: { start: label.start, end: label.end } } : {}),
  };
}

function walk(
  node: AstNode,
  parent: AstNode | undefined,
  visitor: {
    enter(node: AstNode, parent: AstNode | undefined): void;
    leave(node: AstNode, parent: AstNode | undefined): void;
  },
): void {
  visitor.enter(node, parent);
  for (const key of visitorKeys[node.type] ?? []) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          walk(child, node, visitor);
        }
      }
    } else if (isNode(value)) {
      walk(value, node, visitor);
    }
  }
  visitor.leave(node, parent);
}

function getTestDetails(
  node: AstNode,
  parent: AstNode | undefined,
  configuredTestCallees: Set<string>,
): { name?: string } | undefined {
  if (parent === undefined || parent.type !== "CallExpression") {
    return undefined;
  }
  const args = Array.isArray(parent.arguments) ? parent.arguments : [];
  if (!args.includes(node)) {
    return undefined;
  }

  const callee = getCalleeName(parent.callee);
  const rootCallee = callee?.split(".")[0];
  if (
    rootCallee === undefined ||
    rootCallee.length === 0 ||
    !configuredTestCallees.has(rootCallee)
  ) {
    return undefined;
  }

  const firstArgument = args.find((value) => isNode(value));
  const value = firstArgument?.type === "Literal" ? firstArgument.value : undefined;
  return typeof value === "string" ? { name: value } : {};
}

function functionName(node: AstNode, parent: AstNode | undefined): string | undefined {
  const ownId = isNode(node.id) ? identifierName(node.id) : undefined;
  if (ownId !== undefined) {
    return ownId;
  }
  if (parent === undefined) {
    return undefined;
  }

  if (parent.type === "VariableDeclarator" && isNode(parent.id)) {
    return identifierName(parent.id);
  }
  if (parent.type === "MethodDefinition" && isNode(parent.key)) {
    return identifierName(parent.key);
  }
  if ((parent.type === "Property" || parent.type === "ObjectProperty") && isNode(parent.key)) {
    return identifierName(parent.key);
  }
  return undefined;
}

function getCalleeName(value: unknown): string | undefined {
  if (!isNode(value)) {
    return undefined;
  }
  if (value.type === "Identifier") {
    return identifierName(value);
  }
  if (value.type === "ChainExpression") {
    return getCalleeName(value.expression);
  }
  if (value.type === "MemberExpression" || value.type.endsWith("MemberExpression")) {
    const object = getCalleeName(value.object);
    const property = isNode(value.property) ? identifierName(value.property) : undefined;
    if (object !== undefined && property !== undefined) {
      return `${object}.${property}`;
    }
    return property ?? object;
  }
  return undefined;
}

function identifierName(node: AstNode): string | undefined {
  if (typeof node.name === "string") {
    return node.name;
  }
  if (typeof node.value === "string") {
    return node.value;
  }
  return undefined;
}

function createLocator(source: string): (range: SourceRange) => SourceLocation {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (range) => ({
    start: positionAt(lineStarts, range.start),
    end: positionAt(lineStarts, range.end),
  });
}

function positionAt(lineStarts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lineStarts[middle]! <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: offset - lineStarts[lineIndex]! + 1 };
}

function isNode(value: unknown): value is AstNode {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["type"] === "string" &&
    typeof value["start"] === "number" &&
    typeof value["end"] === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rangeOf(node: AstNode): SourceRange {
  return { start: node.start, end: node.end };
}

function rangeLength(range: SourceRange): number {
  return range.end - range.start;
}

function extension(filename: string): string {
  const match = /\.[^.\\/]+$/u.exec(filename.toLowerCase());
  return match?.[0] ?? "";
}

function languageFor(filename: string): string {
  const ext = extension(filename);
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") {
    return "typescript";
  }
  if (ext === ".tsx") {
    return "tsx";
  }
  if (ext === ".jsx") {
    return "jsx";
  }
  return "javascript";
}
