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
  param?: unknown;
  source?: unknown;
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

export const oxcParser = (options: OxcParserOptions = {}): SourceParser => {
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
      const errorHandlers = collectErrorHandlers(
        program,
        source,
        filename,
        language,
        locate,
        functions,
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
        errorHandlers,
        issues: result.errors.map(convertError),
      } satisfies ParsedDocument;
    },
  };
};

const collectErrorHandlers = (
  program: AstNode,
  source: string,
  filename: string,
  language: string,
  locate: (range: SourceRange) => SourceLocation,
  functions: FunctionTarget[],
): ErrorHandlerTarget[] => {
  const handlers: ErrorHandlerTarget[] = [];
  walk(program, undefined, {
    enter(node, parent) {
      if (node.type !== "CatchClause") {
        return;
      }
      const body = isNode(node.body) ? node.body : node;
      const enclosing = smallestEnclosingFunction(functions, rangeOf(node));
      const flow = collectErrorHandlerFlow(body, source);
      const target: ErrorHandlerTarget = {
        kind: "error-handler",
        filename,
        language,
        range: rangeOf(node),
        location: locate(rangeOf(node)),
        source: source.slice(node.start, node.end),
        bodySource: source.slice(body.start, body.end),
        trySource:
          parent?.type === "TryStatement"
            ? source.slice(parent.start, parent.end)
            : source.slice(node.start, node.end),
        calls: flow.calls,
        exits: flow.exits,
      };
      if (isNode(node.param)) {
        target.binding = source.slice(node.param.start, node.param.end);
      }
      if (enclosing !== undefined) {
        target.enclosingSource = enclosing.source;
      }
      handlers.push(target);
    },
    leave() {},
  });
  return handlers;
};

const collectErrorHandlerFlow = (
  body: AstNode,
  source: string,
): { calls: CallCapture[]; exits: ErrorHandlerExitCapture[] } => {
  const calls: CallCapture[] = [];
  const exits: ErrorHandlerExitCapture[] = [];

  const visit = (node: AstNode, root: boolean): void => {
    if (!root && (functionTypes.has(node.type) || node.type === "CatchClause")) {
      return;
    }
    if (node.type === "CallExpression") {
      const callee = getCalleeName(node.callee);
      if (callee !== undefined) {
        calls.push({ callee, range: rangeOf(node), source: source.slice(node.start, node.end) });
      }
    } else if (node.type === "ThrowStatement" || node.type === "ReturnStatement") {
      exits.push({
        kind: node.type === "ThrowStatement" ? "throw" : "return",
        range: rangeOf(node),
        source: source.slice(node.start, node.end),
      });
    }
    for (const key of visitorKeys[node.type] ?? []) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (isNode(child)) {
            visit(child, false);
          }
        }
      } else if (isNode(value)) {
        visit(value, false);
      }
    }
  };

  visit(body, true);
  return { calls, exits };
};

const smallestEnclosingFunction = (
  functions: FunctionTarget[],
  range: SourceRange,
): FunctionTarget | undefined => {
  return functions
    .filter((fn) => fn.range.start <= range.start && fn.range.end >= range.end)
    .toSorted((left, right) => rangeLength(left.range) - rangeLength(right.range))[0];
};

const collectImports = (program: AstNode, source: string): string[] => {
  const body = Array.isArray(program.body) ? program.body : [];
  return body
    .filter((value) => isNode(value))
    .filter((node) => node.type === "ImportDeclaration")
    .map((node) => source.slice(node.start, node.end));
};

const collectFunctions = (
  program: AstNode,
  source: string,
  filename: string,
  language: string,
  locate: (range: SourceRange) => SourceLocation,
  configuredTestCallees: Set<string>,
): FunctionTarget[] => {
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
        if (test !== undefined && parent !== undefined) {
          target.enclosingSource = source.slice(parent.start, parent.end);
        }
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
};

const convertComment = (
  comment: Comment,
  source: string,
  filename: string,
  language: string,
  locate: (range: SourceRange) => SourceLocation,
  functions: FunctionTarget[],
): CommentTarget => {
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
};

const convertError = (error: OxcError): ParseIssue => {
  const label = error.labels[0];
  const severity: string = error.severity;
  return {
    message: error.message,
    severity: severity === "Error" ? "error" : "warning",
    ...(label ? { range: { start: label.start, end: label.end } } : {}),
  };
};

const walk = (
  node: AstNode,
  parent: AstNode | undefined,
  visitor: {
    enter(node: AstNode, parent: AstNode | undefined): void;
    leave(node: AstNode, parent: AstNode | undefined): void;
  },
): void => {
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
};

const getTestDetails = (
  node: AstNode,
  parent: AstNode | undefined,
  configuredTestCallees: Set<string>,
): { name?: string } | undefined => {
  if (parent === undefined || parent.type !== "CallExpression") {
    return undefined;
  }
  const args = Array.isArray(parent.arguments) ? parent.arguments : [];
  if (!args.includes(node)) {
    return undefined;
  }

  const callee = getTestCalleeName(parent.callee);
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
};

const getTestCalleeName = (value: unknown): string | undefined => {
  if (isNode(value) && value.type === "CallExpression") {
    return getTestCalleeName(value.callee);
  }
  return getCalleeName(value);
};

const functionName = (node: AstNode, parent: AstNode | undefined): string | undefined => {
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
};

const getCalleeName = (value: unknown): string | undefined => {
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
};

const identifierName = (node: AstNode): string | undefined => {
  if (typeof node.name === "string") {
    return node.name;
  }
  if (typeof node.value === "string") {
    return node.value;
  }
  return undefined;
};

const createLocator = (source: string): ((range: SourceRange) => SourceLocation) => {
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
};

const positionAt = (lineStarts: number[], offset: number): { line: number; column: number } => {
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
};

const isNode = (value: unknown): value is AstNode => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["type"] === "string" &&
    typeof value["start"] === "number" &&
    typeof value["end"] === "number"
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const rangeOf = (node: AstNode): SourceRange => {
  return { start: node.start, end: node.end };
};

const rangeLength = (range: SourceRange): number => {
  return range.end - range.start;
};

const extension = (filename: string): string => {
  const match = /\.[^.\\/]+$/u.exec(filename.toLowerCase());
  return match?.[0] ?? "";
};

const languageFor = (filename: string): string => {
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
};
