import type {
  ApiBoundaryAttachmentCapture,
  ApiBoundaryTarget,
  ApiFramework,
  ApiRequestSourceCapture,
  ApiRequestSourceKind,
  ApiResponseExitCapture,
  CallCapture,
  CommentTarget,
  ErrorHandlerExitCapture,
  ErrorHandlerTarget,
  FunctionTarget,
  ParsedDocument,
  ParseIssue,
  StructuredArgumentFact,
  StructuredCallFact,
  StructuredDeclarationFact,
  StructuredFacts,
  StructuredValueKind,
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
  argument?: unknown;
  param?: unknown;
  params?: unknown;
  properties?: unknown;
  init?: unknown;
  declarations?: unknown;
  specifiers?: unknown;
  computed?: unknown;
  finalizer?: unknown;
  local?: unknown;
  imported?: unknown;
  source?: unknown;
  kind?: unknown;
};

const supportedExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const functionTypes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
]);
const testCallees = new Set(["test", "it", "specify"]);
const routeMethods = new Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"]);
const responseTerminalMethods = new Set(["end", "json", "redirect", "send", "sendStatus"]);
const maxApiBoundaryCharacters = 12_000;

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
      const apiBoundaries = collectApiBoundaries(program, source, filename, language, locate);
      const facts = collectStructuredFacts(program, source);
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
        apiBoundaries,
        facts,
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

interface FrameworkBindings {
  receivers: Map<string, ApiFramework>;
}

interface RouteParts {
  framework: ApiFramework;
  method: string;
  path: string;
  handler: AstNode;
  attachments: ApiBoundaryAttachmentCapture[];
}

interface HandlerFlow {
  requestSources: ApiRequestSourceCapture[];
  responseExits: ApiResponseExitCapture[];
  calls: CallCapture[];
  requestSourcesComplete: boolean;
  responseExitsComplete: boolean;
  reasons: string[];
}

const collectApiBoundaries = (
  program: AstNode,
  source: string,
  filename: string,
  language: string,
  locate: (range: SourceRange) => SourceLocation,
): ApiBoundaryTarget[] => {
  const bindings = collectFrameworkBindings(program);
  if (bindings.receivers.size === 0) {
    return [];
  }
  const namedFunctions = collectNamedFunctionNodes(program);
  const boundaries: ApiBoundaryTarget[] = [];

  walk(program, undefined, {
    enter(node) {
      if (node.type !== "CallExpression") {
        return;
      }
      const member = directMember(node.callee);
      if (member === undefined) {
        return;
      }
      const framework = bindings.receivers.get(member.object);
      if (framework === undefined) {
        return;
      }
      const parts = routeParts(node, framework, member.property, source);
      if (parts === undefined) {
        return;
      }
      const resolved = resolveHandler(parts.handler, namedFunctions);
      const handler = resolved.node ?? parts.handler;
      const handlerSource = source.slice(handler.start, handler.end);
      const registrationSource = source.slice(node.start, node.end);
      if (
        handlerSource.length === 0 ||
        handlerSource.length > maxApiBoundaryCharacters ||
        registrationSource.length > maxApiBoundaryCharacters
      ) {
        return;
      }
      const complete = resolved.node !== undefined;
      const flow = complete ? collectHandlerFlow(handler, source) : emptyHandlerFlow();
      const reasons = complete
        ? [...flow.reasons]
        : ["The route handler is not a unique inline or same-file function implementation."];
      if (parts.attachments.some((attachment) => attachment.kind === "middleware")) {
        reasons.push("Attached middleware behavior is captured but not resolved.");
      }

      boundaries.push({
        kind: "api-boundary",
        filename,
        language,
        range: rangeOf(node),
        location: locate(rangeOf(node)),
        source: registrationSource,
        framework: parts.framework,
        method: parts.method,
        path: parts.path,
        handlerRange: rangeOf(handler),
        handlerSource,
        requestSources: flow.requestSources,
        attachments: parts.attachments,
        responseExits: flow.responseExits,
        calls: flow.calls,
        completeness: {
          handler: complete ? "complete" : "partial",
          requestSources: complete && flow.requestSourcesComplete ? "complete" : "partial",
          attachments: "complete",
          responseExits: complete && flow.responseExitsComplete ? "complete" : "partial",
          reasons,
        },
      });
    },
    leave() {},
  });

  return boundaries.toSorted((left, right) => left.range.start - right.range.start);
};

const collectFrameworkBindings = (program: AstNode): FrameworkBindings => {
  const fastifyFactories = new Set<string>();
  const expressFactories = new Set<string>();
  const expressRouterFactories = new Set<string>();
  const body = Array.isArray(program.body) ? program.body : [];

  for (const value of body) {
    if (!isNode(value) || value.type !== "ImportDeclaration" || !isNode(value.source)) {
      continue;
    }
    const specifier = value.source.value;
    if (specifier !== "fastify" && specifier !== "express") {
      continue;
    }
    for (const imported of Array.isArray(value.specifiers) ? value.specifiers : []) {
      if (!isNode(imported) || !isNode(imported.local)) {
        continue;
      }
      const local = identifierName(imported.local);
      if (local === undefined) {
        continue;
      }
      if (
        specifier === "fastify" &&
        (imported.type === "ImportDefaultSpecifier" ||
          imported.type === "ImportNamespaceSpecifier" ||
          (imported.type === "ImportSpecifier" &&
            isNode(imported.imported) &&
            identifierName(imported.imported) === "fastify"))
      ) {
        fastifyFactories.add(local);
      } else if (
        specifier === "express" &&
        imported.type === "ImportSpecifier" &&
        isNode(imported.imported) &&
        identifierName(imported.imported) === "Router"
      ) {
        expressRouterFactories.add(local);
      } else if (
        specifier === "express" &&
        (imported.type === "ImportDefaultSpecifier" || imported.type === "ImportNamespaceSpecifier")
      ) {
        expressFactories.add(local);
      }
    }
  }

  const receivers = new Map<string, ApiFramework>();
  walk(program, undefined, {
    enter(node) {
      if (node.type !== "VariableDeclarator" || !isNode(node.id) || !isNode(node.init)) {
        return;
      }
      const receiver = identifierName(node.id);
      const init = node.init;
      if (receiver === undefined || init.type !== "CallExpression") {
        return;
      }
      const callee = getCalleeName(init.callee);
      if (callee !== undefined && fastifyFactories.has(callee)) {
        receivers.set(receiver, "fastify");
      } else if (
        callee !== undefined &&
        (expressFactories.has(callee) ||
          expressRouterFactories.has(callee) ||
          [...expressFactories].some((factory) => callee === `${factory}.Router`))
      ) {
        receivers.set(receiver, "express");
      }
    },
    leave() {},
  });
  return { receivers };
};

const collectNamedFunctionNodes = (program: AstNode): Map<string, AstNode[]> => {
  const functions = new Map<string, AstNode[]>();
  walk(program, undefined, {
    enter(node, parent) {
      if (!functionTypes.has(node.type)) {
        return;
      }
      const name = functionName(node, parent);
      if (name !== undefined) {
        const existing = functions.get(name) ?? [];
        existing.push(node);
        functions.set(name, existing);
      }
    },
    leave() {},
  });
  return functions;
};

const routeParts = (
  call: AstNode,
  framework: ApiFramework,
  member: string,
  source: string,
): RouteParts | undefined => {
  const args = Array.isArray(call.arguments) ? call.arguments.filter(isNode) : [];
  if (framework === "fastify" && member === "route") {
    return args[0]?.type === "ObjectExpression"
      ? fastifyObjectRouteParts(args[0], source)
      : undefined;
  }
  if (!routeMethods.has(member)) {
    return undefined;
  }
  const path = literalString(args[0]);
  const handler = args.at(-1);
  if (path === undefined || handler === undefined || args.length < 2) {
    return undefined;
  }

  if (framework === "fastify") {
    const options = args.length >= 3 && args[1]?.type === "ObjectExpression" ? args[1] : undefined;
    return {
      framework,
      method: member.toUpperCase(),
      path,
      handler,
      attachments: options === undefined ? [] : fastifyAttachments(options, source),
    };
  }
  return {
    framework,
    method: member.toUpperCase(),
    path,
    handler,
    attachments: args.slice(1, -1).map((middleware) => ({
      kind: "middleware",
      range: rangeOf(middleware),
      source: source.slice(middleware.start, middleware.end),
    })),
  };
};

const fastifyObjectRouteParts = (options: AstNode, source: string): RouteParts | undefined => {
  const method = literalString(objectPropertyValue(options, "method"));
  const path =
    literalString(objectPropertyValue(options, "url")) ??
    literalString(objectPropertyValue(options, "path"));
  const handler = objectPropertyValue(options, "handler");
  if (method === undefined || path === undefined || handler === undefined) {
    return undefined;
  }
  return {
    framework: "fastify",
    method: method.toUpperCase(),
    path,
    handler,
    attachments: fastifyAttachments(options, source),
  };
};

const fastifyAttachments = (options: AstNode, source: string): ApiBoundaryAttachmentCapture[] => {
  const attachments: ApiBoundaryAttachmentCapture[] = [];
  const schema = objectPropertyValue(options, "schema");
  if (schema !== undefined) {
    attachments.push({
      kind: "schema",
      range: rangeOf(schema),
      source: source.slice(schema.start, schema.end),
    });
  }
  for (const key of ["onRequest", "preParsing", "preValidation", "preHandler"] as const) {
    const middleware = objectPropertyValue(options, key);
    if (middleware !== undefined) {
      attachments.push({
        kind: "middleware",
        range: rangeOf(middleware),
        source: source.slice(middleware.start, middleware.end),
      });
    }
  }
  return attachments;
};

const objectPropertyValue = (object: AstNode, name: string): AstNode | undefined => {
  const properties = Array.isArray(object.properties) ? object.properties : [];
  for (const property of properties) {
    if (
      isNode(property) &&
      (property.type === "Property" || property.type === "ObjectProperty") &&
      isNode(property.key) &&
      identifierName(property.key) === name &&
      isNode(property.value)
    ) {
      return property.value;
    }
  }
  return undefined;
};

const resolveHandler = (
  handler: AstNode,
  namedFunctions: Map<string, AstNode[]>,
): { node?: AstNode } => {
  if (functionTypes.has(handler.type) && handler.type !== "TSDeclareFunction") {
    return { node: handler };
  }
  const name = identifierName(handler);
  const matches = name === undefined ? [] : (namedFunctions.get(name) ?? []);
  const match = matches[0];
  return matches.length === 1 && match !== undefined ? { node: match } : {};
};

const emptyHandlerFlow = (): HandlerFlow => ({
  requestSources: [],
  responseExits: [],
  calls: [],
  requestSourcesComplete: false,
  responseExitsComplete: false,
  reasons: [],
});

const collectHandlerFlow = (handler: AstNode, source: string): HandlerFlow => {
  const params = Array.isArray(handler.params) ? handler.params.filter(isNode) : [];
  const requestName = identifierName(params[0] ?? handler);
  const responseName = identifierName(params[1] ?? handler);
  const requestSourcesComplete = params[0] === undefined || requestName !== undefined;
  const responseExitsComplete = params[1] === undefined || responseName !== undefined;
  const reasons: string[] = [];
  if (!requestSourcesComplete) {
    reasons.push("Destructured or non-identifier request parameters are not normalized.");
  }
  if (!responseExitsComplete) {
    reasons.push("Destructured or non-identifier response parameters are not normalized.");
  }
  const requestSources: ApiRequestSourceCapture[] = [];
  const responseExits: ApiResponseExitCapture[] = [];
  const calls: CallCapture[] = [];
  const body = isNode(handler.body) ? handler.body : handler;

  const visit = (node: AstNode, root: boolean): void => {
    if (!root && functionTypes.has(node.type)) {
      return;
    }
    const member = directMember(node);
    const requestSourceKind =
      member === undefined ? undefined : apiRequestSourceKind(member.property);
    if (member !== undefined && member.object === requestName && requestSourceKind !== undefined) {
      requestSources.push({
        kind: requestSourceKind,
        range: rangeOf(node),
        source: source.slice(node.start, node.end),
      });
    }
    if (node.type === "CallExpression") {
      const callee = getCalleeName(node.callee);
      if (callee !== undefined) {
        calls.push({ callee, range: rangeOf(node), source: source.slice(node.start, node.end) });
      }
      const terminal = memberPropertyName(node.callee);
      if (
        responseName !== undefined &&
        terminal !== undefined &&
        responseTerminalMethods.has(terminal) &&
        chainContainsReceiver(node, responseName)
      ) {
        const args = Array.isArray(node.arguments) ? node.arguments.filter(isNode) : [];
        const chainedStatus = statusInResponseChain(node);
        const redirectStatus = terminal === "redirect" ? literalNumber(args[0]) : undefined;
        const status = chainedStatus ?? redirectStatus;
        const hasResponseBody =
          terminal !== "end" &&
          terminal !== "redirect" &&
          terminal !== "sendStatus" &&
          args[0] !== undefined;
        responseExits.push({
          kind: "send",
          range: rangeOf(node),
          source: source.slice(node.start, node.end),
          ...(status === undefined ? {} : { status }),
          ...(hasResponseBody && args[0] !== undefined
            ? { bodySource: source.slice(args[0].start, args[0].end) }
            : {}),
          headerSources: headerSourcesInResponseChain(node, source),
        });
      }
    } else if (node.type === "ReturnStatement" && isNode(node.argument)) {
      if (
        responseName === undefined ||
        node.argument.type !== "CallExpression" ||
        !chainContainsReceiver(node.argument, responseName)
      ) {
        responseExits.push({
          kind: "return",
          range: rangeOf(node),
          source: source.slice(node.start, node.end),
          bodySource: source.slice(node.argument.start, node.argument.end),
          headerSources: [],
        });
      }
    } else if (node.type === "ThrowStatement") {
      responseExits.push({
        kind: "throw",
        range: rangeOf(node),
        source: source.slice(node.start, node.end),
        ...(isNode(node.argument)
          ? { bodySource: source.slice(node.argument.start, node.argument.end) }
          : {}),
        headerSources: [],
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
  if (
    handler.type === "ArrowFunctionExpression" &&
    handler.expression === true &&
    !responseExits.some((exit) => exit.range.start === body.start && exit.range.end === body.end)
  ) {
    responseExits.push({
      kind: "return",
      range: rangeOf(body),
      source: source.slice(body.start, body.end),
      bodySource: source.slice(body.start, body.end),
      headerSources: [],
    });
  }
  return {
    requestSources: uniqueByRange(requestSources),
    responseExits: uniqueByRange(responseExits),
    calls: uniqueByRange(calls),
    requestSourcesComplete,
    responseExitsComplete,
    reasons,
  };
};

const apiRequestSourceKind = (value: string): ApiRequestSourceKind | undefined => {
  switch (value) {
    case "body":
    case "cookies":
    case "headers":
    case "params":
    case "query":
    case "raw":
      return value;
    default:
      return undefined;
  }
};

const directMember = (value: unknown): { object: string; property: string } | undefined => {
  if (
    !isNode(value) ||
    (value.type !== "MemberExpression" && !value.type.endsWith("MemberExpression"))
  ) {
    return undefined;
  }
  const object = isNode(value.object) ? identifierName(value.object) : undefined;
  const property = isNode(value.property) ? identifierName(value.property) : undefined;
  return object === undefined || property === undefined ? undefined : { object, property };
};

const memberPropertyName = (value: unknown): string | undefined => {
  if (
    !isNode(value) ||
    (value.type !== "MemberExpression" && !value.type.endsWith("MemberExpression"))
  ) {
    return undefined;
  }
  return isNode(value.property) ? identifierName(value.property) : undefined;
};

const chainContainsReceiver = (value: AstNode, receiver: string): boolean => {
  if (value.type === "Identifier") {
    return identifierName(value) === receiver;
  }
  if (value.type === "CallExpression" && isNode(value.callee)) {
    return chainContainsReceiver(value.callee, receiver);
  }
  if (
    (value.type === "MemberExpression" || value.type.endsWith("MemberExpression")) &&
    isNode(value.object)
  ) {
    return chainContainsReceiver(value.object, receiver);
  }
  return false;
};

const statusInResponseChain = (value: AstNode): number | undefined => {
  if (value.type === "CallExpression") {
    const method = memberPropertyName(value.callee);
    const args = Array.isArray(value.arguments) ? value.arguments.filter(isNode) : [];
    if (method === "status" || method === "code" || method === "sendStatus") {
      const status = literalNumber(args[0]);
      if (status !== undefined) {
        return status;
      }
    }
    if (isNode(value.callee)) {
      return statusInResponseChain(value.callee);
    }
  } else if (
    (value.type === "MemberExpression" || value.type.endsWith("MemberExpression")) &&
    isNode(value.object)
  ) {
    return statusInResponseChain(value.object);
  }
  return undefined;
};

const headerSourcesInResponseChain = (value: AstNode, source: string): string[] => {
  const headers: string[] = [];
  const visit = (node: AstNode): void => {
    if (node.type === "CallExpression") {
      const method = memberPropertyName(node.callee);
      if (method === "header" || method === "set" || method === "setHeader") {
        headers.push(source.slice(node.start, node.end));
      }
      if (isNode(node.callee)) {
        visit(node.callee);
      }
    } else if (
      (node.type === "MemberExpression" || node.type.endsWith("MemberExpression")) &&
      isNode(node.object)
    ) {
      visit(node.object);
    }
  };
  visit(value);
  return headers.toReversed();
};

const literalString = (node: AstNode | undefined): string | undefined => {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
};

const literalNumber = (node: AstNode | undefined): number | undefined => {
  return node?.type === "Literal" && typeof node.value === "number" ? node.value : undefined;
};

const uniqueByRange = <Value extends { range: SourceRange }>(values: Value[]): Value[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.range.start}:${value.range.end}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

interface AstAncestor {
  node: AstNode;
  parent?: AstNode;
}

const loopNodeTypes = new Set([
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "WhileStatement",
]);
const conditionalNodeTypes = new Set([
  "ConditionalExpression",
  "IfStatement",
  "SwitchCase",
  "SwitchStatement",
]);

const collectStructuredFacts = (program: AstNode, source: string): StructuredFacts => {
  const calls: StructuredCallFact[] = [];
  const controls: StructuredFacts["controls"] = [];
  const declarations: StructuredDeclarationFact[] = [];
  const members: StructuredFacts["members"] = [];
  let dynamicMembers = false;

  const visit = (node: AstNode, ancestors: AstAncestor[]): void => {
    const parent = ancestors.at(-1)?.node;
    const control = standaloneControlRegion(node, parent);
    if (control !== undefined) {
      controls.push(control);
    }
    if (
      node.type === "VariableDeclaration" &&
      (node.kind === "using" || node.kind === "await using")
    ) {
      declarations.push({
        kind: node.kind === "await using" ? "await-using" : "using",
        range: rangeOf(node),
        source: source.slice(node.start, node.end),
      });
    }
    if (node.type === "CallExpression") {
      const argumentNodes = Array.isArray(node.arguments)
        ? node.arguments.filter((value): value is AstNode => isNode(value))
        : [];
      const args = argumentNodes.map((argument) => argumentFact(argument, source));
      const fact: StructuredCallFact = {
        range: rangeOf(node),
        source: source.slice(node.start, node.end),
        arguments: args,
        references: uniqueStrings(args.flatMap((argument) => argument.references)),
        awaited: parent?.type === "AwaitExpression",
        control: controlRegions(node, ancestors),
      };
      const callee = getCalleeName(node.callee);
      if (callee !== undefined) {
        fact.callee = callee;
      }
      calls.push(fact);
    }
    if (isMemberExpression(node)) {
      const path = getStaticMemberPath(node);
      if (path === undefined) {
        dynamicMembers = true;
      } else {
        members.push({ path, range: rangeOf(node), source: source.slice(node.start, node.end) });
      }
    }

    const entry: AstAncestor = parent === undefined ? { node } : { node, parent };
    for (const key of visitorKeys[node.type] ?? []) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (isNode(child)) {
            visit(child, [...ancestors, entry]);
          }
        }
      } else if (isNode(value)) {
        visit(value, [...ancestors, entry]);
      }
    }
  };

  visit(program, []);
  return {
    calls: calls.toSorted((left, right) => left.range.start - right.range.start),
    controls: uniqueByRange(controls).toSorted(
      (left, right) => left.range.start - right.range.start,
    ),
    declarations: declarations.toSorted((left, right) => left.range.start - right.range.start),
    members: uniqueByRange(members).toSorted((left, right) => left.range.start - right.range.start),
    completeness: {
      calls: "complete",
      control: "complete",
      declarations: "complete",
      members: dynamicMembers ? "partial" : "complete",
      reasons: dynamicMembers
        ? ["Dynamic computed member paths are not normalized as static member facts."]
        : [],
    },
  };
};

const standaloneControlRegion = (
  node: AstNode,
  parent: AstNode | undefined,
): StructuredFacts["controls"][number] | undefined => {
  if (loopNodeTypes.has(node.type)) {
    return { kind: "loop", range: rangeOf(node), loop: loopKind(node.type) };
  }
  if (conditionalNodeTypes.has(node.type)) {
    return { kind: "conditional", range: rangeOf(node) };
  }
  if (node.type === "CatchClause") {
    return { kind: "catch", range: rangeOf(node) };
  }
  if (
    node.type === "BlockStatement" &&
    parent?.type === "TryStatement" &&
    parent.finalizer === node
  ) {
    return { kind: "finally", range: rangeOf(node) };
  }
  if (functionTypes.has(node.type) && parent?.type === "CallExpression") {
    const args = Array.isArray(parent.arguments) ? parent.arguments : [];
    if (args.includes(node)) {
      const region = { kind: "callback" as const, range: rangeOf(node) };
      const callee = getCalleeName(parent.callee);
      return callee === undefined ? region : { ...region, callee };
    }
  }
  return undefined;
};

const loopKind = (type: string): NonNullable<StructuredFacts["controls"][number]["loop"]> => {
  if (type === "DoWhileStatement") {
    return "do-while";
  }
  if (type === "ForInStatement") {
    return "for-in";
  }
  if (type === "ForOfStatement") {
    return "for-of";
  }
  if (type === "ForStatement") {
    return "for";
  }
  return "while";
};

const argumentFact = (node: AstNode, source: string): StructuredArgumentFact => {
  return {
    kind: structuredValueKind(node),
    range: rangeOf(node),
    source: source.slice(node.start, node.end),
    references: collectReferencePaths(node),
  };
};

const structuredValueKind = (node: AstNode): StructuredValueKind => {
  if (node.type === "ArrayExpression") {
    return "array";
  }
  if (node.type === "CallExpression" || node.type === "NewExpression") {
    return "call";
  }
  if (functionTypes.has(node.type)) {
    return "function";
  }
  if (node.type === "Identifier") {
    return "identifier";
  }
  if (node.type === "Literal") {
    return "literal";
  }
  if (isMemberExpression(node)) {
    return "member";
  }
  if (node.type === "ObjectExpression") {
    return "object";
  }
  if (node.type === "SpreadElement") {
    return "spread";
  }
  if (node.type === "TemplateLiteral") {
    return "template";
  }
  return "other";
};

const collectReferencePaths = (root: AstNode): string[] => {
  const references: string[] = [];
  const visit = (node: AstNode): void => {
    if (isMemberExpression(node)) {
      const path = getStaticMemberPath(node);
      if (path !== undefined) {
        references.push(path);
        return;
      }
      if (isNode(node.object)) {
        visit(node.object);
      }
      if (node.computed === true && isNode(node.property)) {
        visit(node.property);
      }
      return;
    }
    if (node.type === "Identifier") {
      const name = identifierName(node);
      if (name !== undefined) {
        references.push(name);
      }
      return;
    }
    if (functionTypes.has(node.type)) {
      if (isNode(node.body)) {
        visit(node.body);
      }
      return;
    }
    for (const key of visitorKeys[node.type] ?? []) {
      if ((node.type === "Property" || node.type === "ObjectProperty") && key === "key") {
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (isNode(child)) {
            visit(child);
          }
        }
      } else if (isNode(value)) {
        visit(value);
      }
    }
  };
  visit(root);
  return uniqueStrings(references);
};

const controlRegions = (call: AstNode, ancestors: AstAncestor[]) => {
  const regions: StructuredCallFact["control"] = [];
  for (const ancestor of ancestors) {
    const node = ancestor.node;
    if (loopNodeTypes.has(node.type)) {
      regions.push({ kind: "loop", range: rangeOf(node), loop: loopKind(node.type) });
    }
    if (conditionalNodeTypes.has(node.type)) {
      regions.push({ kind: "conditional", range: rangeOf(node) });
    }
    if (node.type === "CatchClause") {
      regions.push({ kind: "catch", range: rangeOf(node) });
    }
    if (
      node.type === "TryStatement" &&
      isNode(node.finalizer) &&
      node.finalizer.start <= call.start &&
      node.finalizer.end >= call.end
    ) {
      regions.push({ kind: "finally", range: rangeOf(node.finalizer) });
    }
    if (functionTypes.has(node.type) && ancestor.parent?.type === "CallExpression") {
      const args = Array.isArray(ancestor.parent.arguments) ? ancestor.parent.arguments : [];
      if (args.includes(node)) {
        const region = { kind: "callback" as const, range: rangeOf(node) };
        const callee = getCalleeName(ancestor.parent.callee);
        regions.push(callee === undefined ? region : { ...region, callee });
      }
    }
  }
  return regions.filter(
    (region, index) =>
      regions.findIndex(
        (candidate) =>
          candidate.kind === region.kind &&
          candidate.range.start === region.range.start &&
          candidate.range.end === region.range.end,
      ) === index,
  );
};

const isMemberExpression = (node: AstNode): boolean => {
  return node.type === "MemberExpression" || node.type.endsWith("MemberExpression");
};

const getStaticMemberPath = (node: AstNode): string | undefined => {
  if (!isMemberExpression(node) || !isNode(node.object) || !isNode(node.property)) {
    return undefined;
  }
  const object =
    node.object.type === "Identifier"
      ? identifierName(node.object)
      : isMemberExpression(node.object)
        ? getStaticMemberPath(node.object)
        : undefined;
  const property =
    node.computed === true
      ? node.property.type === "Literal" && typeof node.property.value === "string"
        ? node.property.value
        : undefined
      : identifierName(node.property);
  return object === undefined || property === undefined ? undefined : `${object}.${property}`;
};

const uniqueStrings = (values: string[]): string[] => [...new Set(values)];

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
