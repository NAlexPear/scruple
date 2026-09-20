import assert from "node:assert/strict";
import test from "node:test";

import type { ChoiceAnswer, RuleCandidate, SemanticRule } from "@scruple/core";
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

const assertChoiceOutcomes = (
  rule: SemanticRule,
  candidate: RuleCandidate | undefined,
  finding: string,
  safe: string,
): void => {
  assert.ok(candidate);
  assert.equal(candidate.question.type, "choice");
  assert.ok(finding in candidate.question.criteria);
  assert.ok(safe in candidate.question.criteria);
  assert.ok("no_direct_flow" in candidate.question.criteria);
  assert.ok("insufficient_context" in candidate.question.criteria);
  assert.equal(rule.diagnose(answer(safe, 0.99, 0.99), candidate), null);
  assert.equal(rule.diagnose(answer("insufficient_context", 0.99, 0.99), candidate), null);
  assert.ok(rule.diagnose(answer(finding, 0.99, 0.99), candidate));
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

await test("authorization selection excludes authority vocabulary without a decision shape", () => {
  const document = oxcParser().parse(
    "labels.ts",
    `export function formatRoleLabel(role: string) {
  return role.toUpperCase();
}
`,
  );

  assert.equal(security().rules["no-user-controlled-authorization"]().collect(document).length, 0);
});

await test("sensitive data exposure leaves logging to observability", () => {
  const document = oxcParser().parse(
    "session.ts",
    `export function recordSession(session: Session) {
  logger.info({ token: session.token }, "session created");
}

export function sendSession(res: Response, session: Session) {
  res.json({ token: session.token });
}
`,
  );
  const candidates = security().rules["no-sensitive-data-exposure"]().collect(document);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.target.source.includes("sendSession"), true);
});

await test("command execution selects direct unsafe, constrained, and ambiguous flows", () => {
  const document = oxcParser().parse(
    "commands.ts",
    `import { exec, execFile } from "node:child_process";

export function convert(req: Request) {
  return exec(\`convert \${req.body.filename} output.png\`);
}

export function inspectRepository(req: Request) {
  const operation = req.body.operation;
  if (operation !== "status" && operation !== "diff") throw new Error("unsupported operation");
  return execFile("git", [operation], { shell: false });
}

export function runApprovedTool(req: Request) {
  return execFile(resolveApprovedTool(req.body.tool), []);
}

export function staticVersion() {
  return execFile("node", ["--version"]);
}
`,
  );
  const rule = security().rules["no-untrusted-command-execution"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.match(/function (\w+)/u)?.[1]),
    ["convert", "inspectRepository", "runApprovedTool"],
  );
  assert.equal(JSON.stringify(candidates[0]?.state).includes("surrounding_source"), false);
  assertChoiceOutcomes(rule, candidates[0], "untrusted_command_execution", "constrained_execution");
});

await test("mass assignment selects direct unsafe, allowlisted, and ambiguous flows", () => {
  const document = oxcParser().parse(
    "accounts.ts",
    `export function replaceAccount(req: Request) {
  return accounts.update(req.params.id, { ...req.body });
}

export function updateProfile(req: Request) {
  const { displayName, biography } = req.body;
  return accounts.update(req.params.id, { displayName, biography });
}

export function mapAccount(req: Request) {
  return accounts.update(req.params.id, toAccountPatch(req.body));
}

export function updateLastSeen(account: Account) {
  return accounts.update(account.id, { lastSeenAt: new Date() });
}
`,
  );
  const rule = security().rules["no-untrusted-mass-assignment"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.match(/function (\w+)/u)?.[1]),
    ["replaceAccount", "updateProfile", "mapAccount"],
  );
  assertChoiceOutcomes(rule, candidates[0], "untrusted_mass_assignment", "allowlisted_assignment");
});

await test("unsafe redirect selects direct unsafe, validated, and ambiguous flows", () => {
  const document = oxcParser().parse(
    "redirects.ts",
    `export function continueToTarget(req: Request, res: Response) {
  res.redirect(req.query.next);
}

export function continueToConsole(req: Request, res: Response) {
  const target = new URL(req.query.next, "https://console.example.com");
  if (target.origin !== "https://console.example.com") throw new Error("invalid redirect");
  res.redirect(target.toString());
}

export function continueWithPolicy(req: Request, res: Response) {
  res.redirect(validateRedirect(req.query.next));
}

export function signInComplete(res: Response) {
  res.redirect("/dashboard");
}
`,
  );
  const rule = security().rules["no-unsafe-redirect"]();
  const candidates = rule.collect(document);

  assert.deepEqual(
    candidates.map((candidate) => candidate.target.source.match(/function (\w+)/u)?.[1]),
    ["continueToTarget", "continueToConsole", "continueWithPolicy"],
  );
  assertChoiceOutcomes(rule, candidates[0], "unsafe_redirect", "validated_redirect");
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
    message: "This function appears to expose sensitive data in a response or rendered output.",
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
    "no-untrusted-command-execution",
    "no-untrusted-mass-assignment",
    "no-unsafe-redirect",
  ]);
});
