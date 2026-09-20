import assert from "node:assert/strict";
import test from "node:test";

import type { ChoiceAnswer } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { security } from "@scruple/security";

const answer = (choice: string, probability: number, confidence: number): ChoiceAnswer => {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: probability },
  };
};

await test("security rules deterministically select only relevant functions", () => {
  const document = oxcParser().parse(
    "routes.ts",
    `import { requirePermission } from "./auth.js";

router.post("/roles", requirePermission("roles:write"), async (req, res) => {
  const role = req.body.role;
  await users.setRole(req.params.userId, role);
  res.json({ ok: true });
});

function add(left: number, right: number) {
  return left + right;
}
`,
  );
  const plugin = security();
  const authorization = plugin.rules["no-user-controlled-authorization"]().collect(document);
  const exposure = plugin.rules["no-sensitive-data-exposure"]().collect(document);

  assert.equal(authorization.length, 1);
  assert.equal(exposure.length, 1);
  assert.equal(authorization[0]?.target.source.includes("req.body.role"), true);
  assert.equal(exposure[0]?.target.source.includes("res.json"), true);
  assert.match(JSON.stringify(authorization[0]?.state), /requirePermission/u);
  const question = authorization[0]?.question;
  assert.ok(question?.type === "choice");
  assert.ok("insufficient_context" in question.criteria);
});

await test("authorization selection includes trusted and ambiguous authority flows for review", () => {
  const document = oxcParser().parse(
    "authorization.ts",
    `export async function trusted(req: Request) {
  const identity = await requireAuthenticatedIdentity(req);
  const role = await policy.roleFor(identity);
  return authorize(identity, role);
}

export function ambiguous(req: Request) {
  return authorizeRequest(req);
}
`,
  );
  const candidates = security().rules["no-user-controlled-authorization"]().collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.includes("trusted")),
    [true, false],
  );
});

await test("security diagnostics require the configured finding, probability, and confidence", () => {
  const plugin = security();
  const document = oxcParser().parse(
    "account.ts",
    `export function account(req: Request, res: Response) {
  res.json({ email: req.user.email, passwordHash: req.user.passwordHash });
}
`,
  );
  const rule = plugin.rules["no-sensitive-data-exposure"]();
  const candidate = rule.collect(document)[0];
  assert.ok(candidate);

  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("sensitive_data_exposure", 0.89, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("sensitive_data_exposure", 0.99, 0.74), candidate), null);
  assert.deepEqual(rule.diagnose(answer("sensitive_data_exposure", 0.9, 0.75), candidate), {
    message: "This function appears to expose sensitive data in a response or log.",
    filename: "account.ts",
    location: candidate.target.location,
    probability: 0.9,
    confidence: 0.75,
  });
});

await test("authorization findings use a stable advisory diagnostic", () => {
  const document = oxcParser().parse(
    "report.ts",
    `export function adminReport(req: Request) {
  if (req.body.role !== "admin") throw new ForbiddenError();
  return loadAdminReport();
}
`,
  );
  const rule = security().rules["no-user-controlled-authorization"]();
  const candidate = rule.collect(document)[0];
  assert.ok(candidate);

  assert.deepEqual(rule.diagnose(answer("user_controlled_authorization", 0.95, 0.9), candidate), {
    message: "This function appears to trust user-controlled data for an authorization decision.",
    filename: "report.ts",
    location: candidate.target.location,
    probability: 0.95,
    confidence: 0.9,
  });
});

await test("security plugin registers advisory rules without enabling them", () => {
  assert.deepEqual(Object.keys(security().rules), [
    "no-user-controlled-authorization",
    "no-sensitive-data-exposure",
  ]);
});
