import assert from "node:assert/strict";
import test from "node:test";

import type {
  ParsedDocument,
  SourceLocation,
  SourceRange,
  StructuredArgumentFact,
  StructuredFacts,
} from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import * as fc from "fast-check";

type RenderStyle = "compact" | "spacious";
type Usage = "assignment" | "await" | "expression" | "return";
type Control = "conditional" | "loop" | "loop-conditional" | "none";

type ArgumentSpec =
  | { kind: "identifier"; name: string }
  | { kind: "literal"; value: boolean | number | string | null }
  | { kind: "member"; path: string[] }
  | { kind: "object"; first: string; second: string };

interface ProgramSpec {
  callee: string[];
  arguments: ArgumentSpec[];
  usage: Usage;
  control: Control;
}

const identifiers = [
  "alpha",
  "beta",
  "client",
  "delta",
  "entry",
  "gamma",
  "payload",
  "record",
  "service",
  "value",
] as const;

const identifierArbitrary = fc.constantFrom(...identifiers);
const pathArbitrary = fc
  .tuple(
    identifierArbitrary,
    identifierArbitrary,
    fc.option(identifierArbitrary, { nil: undefined }),
  )
  .map(([first, second, third]) =>
    third === undefined ? [first, second] : [first, second, third],
  );
const argumentArbitrary: fc.Arbitrary<ArgumentSpec> = fc.oneof(
  identifierArbitrary.map((name) => ({ kind: "identifier" as const, name })),
  fc
    .oneof(
      fc.constant(null),
      fc.boolean(),
      fc.integer({ min: 0, max: 10 }),
      fc.constantFrom("alpha", "quoted value", ""),
    )
    .map((value) => ({ kind: "literal" as const, value })),
  pathArbitrary.map((path) => ({ kind: "member" as const, path })),
  fc
    .tuple(identifierArbitrary, identifierArbitrary)
    .map(([first, second]) => ({ kind: "object" as const, first, second })),
);
const programArbitrary: fc.Arbitrary<ProgramSpec> = fc.record({
  callee: pathArbitrary,
  arguments: fc.array(argumentArbitrary, { minLength: 1, maxLength: 4 }),
  usage: fc.constantFrom("assignment", "await", "expression", "return"),
  control: fc.constantFrom("conditional", "loop", "loop-conditional", "none"),
});

const parse = (source: string): ParsedDocument => oxcParser().parse("generated.ts", source);

const renderProgram = (spec: ProgramSpec, style: RenderStyle): string => {
  const call = `${renderPath(spec.callee, style)}(${spec.arguments
    .map((argument) => renderArgument(argument, style))
    .join(style === "compact" ? "," : ", ")})`;
  const statement =
    spec.usage === "assignment"
      ? `const result = ${call};`
      : spec.usage === "await"
        ? `await ${call};`
        : spec.usage === "return"
          ? `return ${call};`
          : `${call};`;
  const controlled =
    spec.control === "conditional"
      ? `if (enabled) { ${statement} }`
      : spec.control === "loop"
        ? `for (const item of items) { ${statement} }`
        : spec.control === "loop-conditional"
          ? `for (const item of items) { if (enabled) { ${statement} } }`
          : statement;

  if (style === "compact") {
    return `export async function generated(items: unknown[],enabled: boolean){${controlled}}`;
  }
  return `// Generated leading trivia must not affect facts.
export async function generated(items: unknown[], enabled: boolean): Promise<unknown> {
  const unrelated: number = 1;
  ${controlled}
}`;
};

const renderArgument = (argument: ArgumentSpec, style: RenderStyle): string => {
  if (argument.kind === "identifier") {
    return argument.name;
  }
  if (argument.kind === "literal") {
    if (typeof argument.value !== "string") {
      return String(argument.value);
    }
    const quote = style === "compact" ? "'" : '"';
    return `${quote}${argument.value}${quote}`;
  }
  if (argument.kind === "member") {
    return renderPath(argument.path, style);
  }
  const separator = style === "compact" ? "," : ", ";
  return `{payload:${argument.first}${separator}trace:${argument.second}}`;
};

const renderPath = (path: string[], style: RenderStyle): string => {
  if (style === "compact") {
    return path.slice(1).reduce((source, part) => `${source}["${part}"]`, path[0]!);
  }
  return path.join(".");
};

const expectedArgument = (argument: ArgumentSpec) => {
  if (argument.kind === "identifier") {
    return { kind: "identifier", references: [argument.name] };
  }
  if (argument.kind === "literal") {
    return { kind: "literal", references: [], value: argument.value };
  }
  if (argument.kind === "member") {
    return { kind: "member", references: [argument.path.join(".")] };
  }
  return {
    kind: "object",
    references: orderedUnique([argument.first, argument.second]),
    properties: ["payload", "trace"],
  };
};

const argumentReferences = (argument: ArgumentSpec): string[] => {
  if (argument.kind === "identifier") {
    return [argument.name];
  }
  if (argument.kind === "member") {
    return [argument.path.join(".")];
  }
  if (argument.kind === "object") {
    return orderedUnique([argument.first, argument.second]);
  }
  return [];
};

const projectArgument = (argument: StructuredArgumentFact) => {
  const projection: Record<string, unknown> = {
    kind: argument.kind,
    references: argument.references,
  };
  if (argument.properties !== undefined) {
    projection["properties"] = argument.properties;
  }
  if (argument.value !== undefined || argument.kind === "literal") {
    projection["value"] = argument.value;
  }
  if (argument.bindings !== undefined) {
    projection["bindings"] = argument.bindings;
  }
  return projection;
};

const expectedControlKinds = (control: Control): string[] => {
  if (control === "loop") {
    return ["loop"];
  }
  if (control === "conditional") {
    return ["conditional"];
  }
  if (control === "loop-conditional") {
    return ["loop", "conditional"];
  }
  return [];
};

const projectFacts = (facts: StructuredFacts) => ({
  aliases: facts.aliases.map(({ binding, target }) => ({ binding, target })),
  calls: facts.calls.map((call) => ({
    callee: call.callee,
    arguments: call.arguments.map(projectArgument),
    references: call.references,
    awaited: call.awaited,
    usage: call.usage,
    control: call.control.map(projectControl),
  })),
  constructors: facts.constructors.map((constructor) => ({
    callee: constructor.callee,
    arguments: constructor.arguments.map(projectArgument),
    references: constructor.references,
    usage: constructor.usage,
    control: constructor.control.map(projectControl),
  })),
  controls: facts.controls.map(projectControl),
  declarations: facts.declarations.map(({ kind }) => ({ kind })),
  members: facts.members.map(({ path }) => ({ path })),
  completeness: facts.completeness,
});

const projectControl = (control: StructuredFacts["controls"][number]) => ({
  kind: control.kind,
  callee: control.callee,
  loop: control.loop,
  bindings: control.bindings,
  awaited: control.awaited,
});

const projectBoundary = (document: ParsedDocument) => {
  assert.equal(document.apiBoundaries?.length, 1);
  const boundary = document.apiBoundaries[0];
  assert.ok(boundary);
  return {
    framework: boundary.framework,
    method: boundary.method,
    path: boundary.path,
    requestSources: boundary.requestSources.map(({ kind }) => kind),
    responseExits: boundary.responseExits.map(({ kind, status, bodySource, headerSources }) => ({
      kind,
      status,
      bodySource,
      headerSources,
    })),
    calls: boundary.calls.map(({ callee }) => callee),
    completeness: boundary.completeness,
  };
};

const requiredFacts = (document: ParsedDocument): StructuredFacts => {
  assert.ok(document.facts);
  return document.facts;
};

const assertDocumentIntegrity = (document: ParsedDocument): void => {
  const { source } = document;
  for (const target of [
    ...document.comments,
    ...document.functions,
    ...document.errorHandlers,
    ...(document.apiBoundaries ?? []),
  ]) {
    assertRange(source, target.range, target.source);
    assert.deepEqual(target.location, locate(source, target.range));
  }
  for (const fn of document.functions) {
    assertOrdered(fn.calls);
    for (const call of fn.calls) {
      assertRange(source, call.range, call.source);
      assertContains(fn.range, call.range);
    }
  }
  for (const handler of document.errorHandlers) {
    assertOrdered(handler.calls);
    assertOrdered(handler.exits);
    for (const item of [...handler.calls, ...handler.exits]) {
      assertRange(source, item.range, item.source);
      assertContains(handler.range, item.range);
    }
  }
  for (const boundary of document.apiBoundaries ?? []) {
    assertRange(source, boundary.handlerRange, boundary.handlerSource);
    for (const item of [...boundary.requestSources, ...boundary.attachments, ...boundary.calls]) {
      assertRange(source, item.range, item.source);
    }
    for (const exit of boundary.responseExits) {
      assertRange(source, exit.range);
    }
  }

  const facts = requiredFacts(document);
  for (const collection of [
    facts.aliases,
    facts.calls,
    facts.constructors,
    facts.controls,
    facts.declarations,
    facts.members,
  ]) {
    assertOrdered(collection);
  }
  assertUniqueRanges(facts.controls);
  assertUniqueRanges(facts.members);
  for (const fact of [...facts.aliases, ...facts.declarations, ...facts.members]) {
    assertRange(source, fact.range, fact.source);
  }
  for (const operation of [...facts.calls, ...facts.constructors]) {
    assertRange(source, operation.range, operation.source);
    assert.deepEqual(
      operation.references,
      orderedUnique(operation.arguments.flatMap((argument) => argument.references)),
    );
    assertUniqueStrings(operation.references);
    assertOrdered(operation.arguments);
    for (const argument of operation.arguments) {
      assertRange(source, argument.range, argument.source);
      assertContains(operation.range, argument.range);
      assertUniqueStrings(argument.references);
    }
    for (const control of operation.control) {
      assertRange(source, control.range);
      assertContains(control.range, operation.range);
    }
  }
};

const assertRange = (source: string, range: SourceRange, captured?: string): void => {
  assert.equal(Number.isInteger(range.start), true);
  assert.equal(Number.isInteger(range.end), true);
  assert.ok(range.start >= 0);
  assert.ok(range.end >= range.start);
  assert.ok(range.end <= source.length);
  if (captured !== undefined) {
    assert.equal(source.slice(range.start, range.end), captured);
  }
};

const assertContains = (outer: SourceRange, inner: SourceRange): void => {
  assert.ok(outer.start <= inner.start);
  assert.ok(outer.end >= inner.end);
};

const assertOrdered = (values: readonly { range: SourceRange }[]): void => {
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index - 1]!.range.start <= values[index]!.range.start);
  }
};

const assertUniqueRanges = (values: readonly { range: SourceRange }[]): void => {
  const keys = values.map(({ range }) => `${range.start}:${range.end}`);
  assert.equal(new Set(keys).size, keys.length);
};

const assertUniqueStrings = (values: readonly string[]): void => {
  assert.equal(new Set(values).size, values.length);
};

const orderedUnique = (values: string[]): string[] => [...new Set(values)];

const locate = (source: string, range: SourceRange): SourceLocation => ({
  start: locateOffset(source, range.start),
  end: locateOffset(source, range.end),
});

const locateOffset = (source: string, offset: number) => {
  const prefix = source.slice(0, offset);
  const lines = prefix.split("\n");
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
};

await test("structured facts satisfy range, ordering, and reference invariants", () => {
  fc.assert(
    fc.property(
      programArbitrary,
      fc.constantFrom<RenderStyle>("compact", "spacious"),
      (spec, style) => {
        const document = parse(renderProgram(spec, style));
        assertDocumentIntegrity(document);

        const facts = requiredFacts(document);
        const expectedCallee = spec.callee.join(".");
        const call = facts.calls.find((candidate) => candidate.callee === expectedCallee);
        assert.ok(call, `missing generated call ${expectedCallee}`);
        assert.equal(call.awaited, spec.usage === "await");
        assert.equal(call.usage, spec.usage);
        assert.deepEqual(call.arguments.map(projectArgument), spec.arguments.map(expectedArgument));
        assert.deepEqual(
          call.references,
          orderedUnique(spec.arguments.flatMap(argumentReferences)),
        );
        assert.deepEqual(
          call.control.map((region) => region.kind),
          expectedControlKinds(spec.control),
        );
      },
    ),
    { numRuns: 400 },
  );
});

await test("equivalent TypeScript renderings produce equivalent structured facts", () => {
  fc.assert(
    fc.property(programArbitrary, (spec) => {
      const compact = projectFacts(requiredFacts(parse(renderProgram(spec, "compact"))));
      const spacious = projectFacts(requiredFacts(parse(renderProgram(spec, "spacious"))));

      assert.deepEqual(spacious, compact);
    }),
    { numRuns: 300 },
  );
});

await test("API boundary evidence is stable across inline and named handlers", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("body", "params", "query"),
      fc.integer({ min: 200, max: 299 }),
      identifierArbitrary,
      (requestSource, status, pathPart) => {
        const handler = `async (request, response) => {
  const value = request.${requestSource};
  return response.status(${status}).json(value);
}`;
        const setup = `import express from "express";
const app = express();`;
        const inline = parse(`${setup}
app.post("/${pathPart}", ${handler});`);
        const named = parse(`${setup}
const handle = ${handler};
app.post("/${pathPart}", handle);`);

        assertDocumentIntegrity(inline);
        assertDocumentIntegrity(named);
        assert.deepEqual(projectBoundary(named), projectBoundary(inline));
      },
    ),
    { numRuns: 120 },
  );
});

await test("dynamic evidence never becomes falsely complete", () => {
  fc.assert(
    fc.property(identifierArbitrary, identifierArbitrary, (object, property) => {
      const staticDocument = parse(`export const value = ${object}["${property}"];`);
      const dynamicDocument = parse(`export const value = ${object}[${property}];`);

      assert.equal(requiredFacts(staticDocument).completeness.members, "complete");
      assert.equal(requiredFacts(dynamicDocument).completeness.members, "partial");
      assert.equal(
        requiredFacts(dynamicDocument).members.some(
          (member) => member.path === `${object}.${property}`,
        ),
        false,
      );
    }),
    { numRuns: 200 },
  );

  fc.assert(
    fc.property(identifierArbitrary, (pathPart) => {
      const document = parse(`import express from "express";
const app = express();
const dynamicPath = "/${pathPart}";
app.post("/static-${pathPart}", async (request, response) => response.status(204).send());
app.post(dynamicPath, externalHandler);`);

      assert.equal(document.apiBoundaries?.length, 1);
      assert.equal(document.apiBoundaries[0]?.path, `/static-${pathPart}`);

      const unresolved = parse(`import express from "express";
const app = express();
app.post("/${pathPart}", externalHandler);`);
      assert.deepEqual(unresolved.apiBoundaries?.[0]?.completeness, {
        handler: "partial",
        requestSources: "partial",
        attachments: "complete",
        responseExits: "partial",
        reasons: ["The route handler is not a unique inline or same-file function implementation."],
      });
    }),
    { numRuns: 100 },
  );
});
