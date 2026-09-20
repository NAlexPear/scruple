import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionAnswer, SemanticRule } from "@scruple/core";
import { observability } from "@scruple/observability";
import { oxcParser } from "@scruple/parser-oxc";

const choice = (selected: string, probability: number, confidence: number): DecisionAnswer => {
  return {
    type: "choice",
    choice: selected,
    probabilities: { [selected]: probability },
    confidence,
  };
};

const instructionsFor = (rule: SemanticRule, source: string): string => {
  const candidate = rule.collect(oxcParser().parse("fixture.ts", source))[0];
  assert.ok(candidate);
  assert.equal(candidate.question.type, "choice");
  return JSON.stringify(candidate.question.instructions);
};

await test("observability plugin registers the refined and high-value tranche", () => {
  assert.deepEqual(Object.keys(observability().rules), [
    "no-sensitive-logs",
    "no-unactionable-errors",
    "require-operation-context",
    "require-stable-telemetry-names",
    "no-duplicate-error-reporting",
  ]);
});

await test("observability rules select distinct bounded sink classes", () => {
  const document = oxcParser().parse(
    "checkout.ts",
    `export function checkout(request: Request, error: Error) {
  logger.debug("checkout retry details");
  logger.info("cache warm");
  logger.info({ operation: "checkout", status: "complete" });
  logger.error("checkout failed", error);
  span.addEvent("checkout.completed", { status: "ok" });
  tracer.startSpan(request.url);
  meter.createCounter("checkout.processed");
  span.setAttribute("customer.email", request.email);
  telemetry.captureException(error);
}
`,
  );
  const plugin = observability();

  assert.deepEqual(
    plugin.rules["require-stable-telemetry-names"]()
      .collect(document)
      .map((candidate) => candidate.target.source),
    [
      'span.addEvent("checkout.completed", { status: "ok" })',
      "tracer.startSpan(request.url)",
      'meter.createCounter("checkout.processed")',
    ],
  );
  assert.deepEqual(
    plugin.rules["require-operation-context"]()
      .collect(document)
      .map((candidate) => candidate.target.source),
    [
      'logger.info({ operation: "checkout", status: "complete" })',
      'logger.error("checkout failed", error)',
      'span.addEvent("checkout.completed", { status: "ok" })',
      "tracer.startSpan(request.url)",
      'meter.createCounter("checkout.processed")',
      "telemetry.captureException(error)",
    ],
  );
  assert.deepEqual(
    plugin.rules["no-unactionable-errors"]()
      .collect(document)
      .map((candidate) => candidate.target.source),
    ['logger.error("checkout failed", error)', "telemetry.captureException(error)"],
  );

  const sensitiveSources = new Set(
    plugin.rules["no-sensitive-logs"]()
      .collect(document)
      .map((candidate) => candidate.target.source),
  );
  assert.ok(sensitiveSources.has("tracer.startSpan(request.url)"));
  assert.ok(sensitiveSources.has('meter.createCounter("checkout.processed")'));
  assert.ok(sensitiveSources.has('span.setAttribute("customer.email", request.email)'));
});

await test("refined rules encode safe and ambiguity boundaries", () => {
  const plugin = observability();
  const sensitiveInstructions = instructionsFor(
    plugin.rules["no-sensitive-logs"](),
    "function record(user: User) { logger.info({ email: hash(user.email) }); }",
  );
  assert.match(sensitiveInstructions, /Hashing or pseudonymization is safe only/u);
  assert.match(sensitiveInstructions, /logger\/exporter redaction/u);

  const errorInstructions = instructionsFor(
    plugin.rules["no-unactionable-errors"](),
    "function report(error: Error) { telemetry.captureException(error); }",
  );
  assert.match(errorInstructions, /standardized exception API/u);
  assert.match(errorInstructions, /active span/u);
  assert.match(errorInstructions, /choose insufficient_context/u);

  const operationInstructions = instructionsFor(
    plugin.rules["require-operation-context"](),
    'function report(error: Error) { logger.error("failed", error); }',
  );
  assert.match(operationInstructions, /Ordinary diagnostic prose/u);
  assert.match(operationInstructions, /scope, active span, logger enrichment/u);
});

await test("stable telemetry names distinguish dynamic identifiers from bounded names", () => {
  const rule = observability().rules["require-stable-telemetry-names"]();
  const candidates = rule.collect(
    oxcParser().parse(
      "names.ts",
      `function record(order: Order, route: string) {
  span.addEvent(\`order.\${order.id}\`);
  tracer.startSpan("GET /orders/{id}");
  meter.createHistogram(route);
}
`,
    ),
  );

  assert.equal(candidates.length, 3);
  assert.deepEqual(
    candidates.map((candidate) => candidate.target.location.start.line),
    [2, 3, 4],
  );
  const [dynamic, stable, ambiguous] = candidates;
  assert.ok(dynamic);
  assert.ok(stable);
  assert.ok(ambiguous);
  assert.ok(dynamic.question.type === "choice");
  assert.deepEqual(Object.keys(dynamic.question.criteria), [
    "stable_low_cardinality",
    "dynamic_unbounded",
    "insufficient_context",
  ]);

  assert.ok(rule.diagnose(choice("dynamic_unbounded", 0.9, 0.7), dynamic));
  assert.equal(rule.diagnose(choice("stable_low_cardinality", 0.99, 0.99), stable), null);
  assert.equal(rule.diagnose(choice("insufficient_context", 0.99, 0.99), ambiguous), null);
});

await test("stable telemetry name selection supports explicit custom name sinks", () => {
  const document = oxcParser().parse(
    "custom.ts",
    "function record(name: string) { telemetry.emitName(name); }",
  );
  const rule = observability().rules["require-stable-telemetry-names"]({
    telemetryNameCallPatterns: [/(?:^|\.)emitName$/gu],
  });

  assert.equal(rule.collect(document).length, 1);
  assert.equal(rule.collect(document).length, 1, "stateful custom patterns remain deterministic");
});

await test("duplicate error reporting selects only direct repeated catch-binding reports", () => {
  const source = `export async function duplicate() {
  try { await charge(); } catch (error) {
    logger.error({ operation: "charge", error }, "charge failed");
    telemetry.captureException(error);
    throw error;
  }
}

export async function single() {
  try { await charge(); } catch (error) {
    telemetry.captureException(error);
    throw error;
  }
}

export async function distinct() {
  try { await charge(); } catch (error) {
    logger.error({ cause: paymentError }, "payment failed");
    telemetry.captureException(notificationError);
    throw error;
  }
}

export async function textualMention() {
  try { await charge(); } catch (error) {
    logger.error("error while charging");
    telemetry.captureException(new ChargeError("error"));
    throw error;
  }
}

export async function distinctCause() {
  try { await charge(); } catch (error) {
    logger.error(error);
    telemetry.captureException(error.cause);
    throw error;
  }
}
`;
  const rule = observability().rules["no-duplicate-error-reporting"]();
  const candidates = rule.collect(oxcParser().parse("errors.ts", source));

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.target.source, "telemetry.captureException(error)");
  assert.deepEqual(candidates[0]?.data, {
    binding: "error",
    reporting_calls: ["logger.error", "telemetry.captureException"],
  });
  assert.match(JSON.stringify(candidates[0]?.state), /throw error/u);
});

await test("duplicate error reporting explicitly abstains on dual-emission policy ambiguity", () => {
  const rule = observability().rules["no-duplicate-error-reporting"]();
  const candidate = rule.collect(
    oxcParser().parse(
      "migration.ts",
      `function report() {
  try { work(); } catch (error) {
    logger.error(error);
    telemetry.captureException(error);
  }
}`,
    ),
  )[0];
  assert.ok(candidate);
  assert.equal(candidate.question.type, "choice");
  assert.match(
    JSON.stringify(candidate.question.instructions),
    /dual emission may be intentional/u,
  );

  assert.ok(rule.diagnose(choice("duplicate_same_exception", 0.9, 0.7), candidate));
  assert.equal(rule.diagnose(choice("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(choice("duplicate_same_exception", 0.89, 0.99), candidate), null);
});

await test("duplicate error evidence remains bounded", () => {
  const padding = "void value;\n".repeat(800);
  const candidate = observability()
    .rules["no-duplicate-error-reporting"]()
    .collect(
      oxcParser().parse(
        "bounded.ts",
        `function report() {
  try { work(); } catch (error) {
    ${padding}
    logger.error(error);
    telemetry.captureException(error);
  }
}`,
      ),
    )[0];
  assert.ok(candidate);
  const state = JSON.stringify(candidate.state);
  assert.ok(state.length < 9_000);
  assert.match(state, /excerpt truncated/u);
});
