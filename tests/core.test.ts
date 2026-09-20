import assert from "node:assert/strict";
import test from "node:test";

import { resolveDecisionOptions } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";

await test("resolves and validates shared decision rule options", () => {
  const defaults = { threshold: 0.9, minConfidence: 0.7 };

  assert.deepEqual(resolveDecisionOptions({}, defaults), defaults);
  assert.deepEqual(resolveDecisionOptions({ threshold: 0, minConfidence: 1 }, defaults), {
    threshold: 0,
    minConfidence: 1,
  });
  assert.throws(
    () => resolveDecisionOptions({ threshold: Number.NaN }, defaults),
    /threshold must be a finite number between 0 and 1/u,
  );
  assert.throws(
    () => resolveDecisionOptions({ minConfidence: 1.01 }, defaults),
    /minConfidence must be a finite number between 0 and 1/u,
  );
});

await test("normalizes using declarations and standalone control regions without reading prose", () => {
  const document = oxcParser().parse(
    "facts.ts",
    `export async function run() {
  await using file = await open("report.txt");
  while (true) {
    try { return await file.readFile(); }
    catch (error) { log(error); }
    finally { recordAttempt(); }
  }
  const example = "using handle; while (true) catch (error)";
}`,
  );

  assert.deepEqual(
    document.facts?.declarations.map((fact) => ({ kind: fact.kind, source: fact.source })),
    [{ kind: "await-using", source: 'await using file = await open("report.txt");' }],
  );
  assert.deepEqual(
    document.facts?.controls.map((fact) => ({ kind: fact.kind, loop: fact.loop })),
    [
      { kind: "loop", loop: "while" },
      { kind: "catch", loop: undefined },
      { kind: "finally", loop: undefined },
    ],
  );
  assert.equal(document.facts?.completeness.declarations, "complete");
});

await test("normalizes an explicit Fastify route with bounded local evidence", () => {
  const document = oxcParser().parse(
    "server.ts",
    `import Fastify from "fastify";
const app = Fastify();
app.post("/users/:id", { schema: { body: userSchema }, preHandler: authorize }, async (request, reply) => {
  const input = request.body;
  const page = request.query;
  return reply.code(201).header("x-id", "1").send(await users.create(input, page));
});`,
  );

  assert.equal(document.apiBoundaries?.length, 1);
  const boundary = document.apiBoundaries?.[0];
  assert.ok(boundary);
  assert.equal(boundary.framework, "fastify");
  assert.equal(boundary.method, "POST");
  assert.equal(boundary.path, "/users/:id");
  assert.deepEqual(
    boundary.requestSources.map((source) => source.kind),
    ["body", "query"],
  );
  assert.deepEqual(
    boundary.attachments.map((attachment) => [attachment.kind, attachment.source]),
    [
      ["schema", "{ body: userSchema }"],
      ["middleware", "authorize"],
    ],
  );
  assert.deepEqual(
    boundary.responseExits.map((exit) => ({
      kind: exit.kind,
      status: exit.status,
      body: exit.bodySource,
      headers: exit.headerSources,
    })),
    [
      {
        kind: "send",
        status: 201,
        body: "await users.create(input, page)",
        headers: ['reply.code(201).header("x-id", "1")'],
      },
    ],
  );
  assert.deepEqual(boundary.completeness, {
    handler: "complete",
    requestSources: "complete",
    attachments: "complete",
    responseExits: "complete",
    reasons: ["Attached middleware behavior is captured but not resolved."],
  });
});

await test("resolves a unique same-file Express handler without changing function targets", () => {
  const document = oxcParser().parse(
    "router.ts",
    `import express from "express";
const router = express.Router();
const auth = () => true;
function show(req, res) {
  const id = req.params.id;
  if (!id) return res.status(404).json({ error: "missing" });
  return res.status(200).json({ id });
}
router.get("/users/:id", auth, show);`,
  );

  const boundary = document.apiBoundaries?.[0];
  assert.ok(boundary);
  assert.equal(boundary.framework, "express");
  assert.equal(boundary.handlerSource.startsWith("function show"), true);
  assert.deepEqual(
    boundary.requestSources.map((source) => source.kind),
    ["params"],
  );
  assert.deepEqual(
    boundary.responseExits.map((exit) => exit.status),
    [404, 200],
  );
  assert.deepEqual(
    boundary.attachments.map((attachment) => attachment.source),
    ["auth"],
  );
  const showFunction = document.functions.find((fn) => fn.name === "show");
  assert.ok(showFunction);
  assert.equal(showFunction.kind, "function");
});

await test("supports static Fastify route objects and abstains from dynamic registrations", () => {
  const document = oxcParser().parse(
    "routes.ts",
    `import fastify from "fastify";
const app = fastify();
const dynamicPath = "/dynamic";
app.route({ method: "DELETE", url: "/items/:id", schema: { params: itemParams }, handler: async (request, reply) => reply.code(204).send() });
app.get(dynamicPath, externalHandler);`,
  );

  assert.equal(document.apiBoundaries?.length, 1);
  const boundary = document.apiBoundaries?.[0];
  assert.ok(boundary);
  assert.equal(boundary.method, "DELETE");
  assert.equal(boundary.path, "/items/:id");
  assert.equal(boundary.attachments[0]?.kind, "schema");
  assert.equal(boundary.responseExits[0]?.status, 204);
});

await test("marks an unresolved local route handler as partial bounded evidence", () => {
  const document = oxcParser().parse(
    "routes.ts",
    `import express from "express";
const app = express();
app.get("/users", externalHandler);`,
  );

  const boundary = document.apiBoundaries?.[0];
  assert.ok(boundary);
  assert.equal(boundary.handlerSource, "externalHandler");
  assert.deepEqual(boundary.completeness, {
    handler: "partial",
    requestSources: "partial",
    attachments: "complete",
    responseExits: "partial",
    reasons: ["The route handler is not a unique inline or same-file function implementation."],
  });
});

await test("normalizes shared call, argument, reference, and control facts", () => {
  const document = oxcParser().parse(
    "facts.ts",
    `export async function load(ids: string[], signal: AbortSignal) {
  signal.addEventListener("abort", onAbort, { once: true });
  for (const id of ids) {
    if (id.length > 0) await db.user.find({ where: { id } });
  }
  return ids.map(async (id) => await hydrate(id));
}`,
  );

  assert.deepEqual(document.facts?.completeness, {
    calls: "complete",
    control: "complete",
    declarations: "complete",
    members: "complete",
    reasons: [],
  });
  assert.deepEqual(
    document.facts?.calls.map((call) => ({
      callee: call.callee,
      arguments: call.arguments.map((argument) => ({
        kind: argument.kind,
        source: argument.source,
        references: argument.references,
      })),
      references: call.references,
      awaited: call.awaited,
      control: call.control.map((region) => ({ kind: region.kind, callee: region.callee })),
    })),
    [
      {
        callee: "signal.addEventListener",
        arguments: [
          { kind: "literal", source: '"abort"', references: [] },
          { kind: "identifier", source: "onAbort", references: ["onAbort"] },
          { kind: "object", source: "{ once: true }", references: [] },
        ],
        references: ["onAbort"],
        awaited: false,
        control: [],
      },
      {
        callee: "db.user.find",
        arguments: [{ kind: "object", source: "{ where: { id } }", references: ["id"] }],
        references: ["id"],
        awaited: true,
        control: [
          { kind: "loop", callee: undefined },
          { kind: "conditional", callee: undefined },
        ],
      },
      {
        callee: "ids.map",
        arguments: [
          {
            kind: "function",
            source: "async (id) => await hydrate(id)",
            references: ["hydrate", "id"],
          },
        ],
        references: ["hydrate", "id"],
        awaited: false,
        control: [],
      },
      {
        callee: "hydrate",
        arguments: [{ kind: "identifier", source: "id", references: ["id"] }],
        references: ["id"],
        awaited: true,
        control: [{ kind: "callback", callee: "ids.map" }],
      },
    ],
  );
  assert.equal(
    document.facts?.members.some((member) => member.path === "db.user.find"),
    true,
  );

  const dynamic = oxcParser().parse("dynamic.ts", "export const value = object[key];");
  assert.deepEqual(dynamic.facts?.completeness, {
    calls: "complete",
    control: "complete",
    declarations: "complete",
    members: "partial",
    reasons: ["Dynamic computed member paths are not normalized as static member facts."],
  });
  assert.equal(
    dynamic.facts?.members.some((member) => member.path === "object.key"),
    false,
  );
});
