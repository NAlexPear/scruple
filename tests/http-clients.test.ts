import assert from "node:assert/strict";
import test from "node:test";

import type { ChoiceAnswer, JsonValue, SemanticRule } from "@scruple/core";
import { httpClients, type HttpClientRuleOptions } from "@scruple/http-clients";
import { oxcParser } from "@scruple/parser-oxc";

const parser = oxcParser();

type RuleName = keyof ReturnType<typeof httpClients>["rules"];

const collect = (ruleName: RuleName, source: string, options?: HttpClientRuleOptions) => {
  const rule: SemanticRule = httpClients().rules[ruleName](options);
  return rule.collect(parser.parse("client.ts", source));
};

const stringifyState = (state: JsonValue | undefined): string => {
  return JSON.stringify(state);
};

await test("http client plugin registers all rules without enabling them", () => {
  assert.deepEqual(Object.keys(httpClients().rules), [
    "require-timeout",
    "require-response-validation",
    "no-unbounded-retries",
  ]);
});

await test("fetch and imported Axios calls are selected deterministically", () => {
  const source = `import axios from "axios";
export async function loadOne() {
  return fetch("https://example.com/one");
}
export async function loadTwo() {
  return axios.get("https://example.com/two");
}
`;
  const candidates = collect("require-timeout", source);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.data?.["requestCallees"]),
    [["fetch"], ["axios.get"]],
  );
});

await test("visible Axios instance defaults and retry middleware are bounded context", () => {
  const source = `import axios from "axios";
import axiosRetry from "axios-retry";

const api = axios.create({
  baseURL: "https://example.com",
  timeout: 2_000,
});
axiosRetry(api, { retries: 3 });

export async function loadUser() {
  return api.get("/user");
}
`;
  const timeout = collect("require-timeout", source)[0];
  const retries = collect("no-unbounded-retries", source)[0];
  assert.ok(timeout);
  assert.ok(retries);

  const timeoutState = stringifyState(timeout.state);
  assert.match(timeoutState, /axios\.create/u);
  assert.match(timeoutState, /timeout: 2_000/u);
  assert.match(stringifyState(retries.state), /axiosRetry\(api, \{ retries: 3 \}\)/u);
});

await test("local options from another function are excluded from client configuration", () => {
  const source = `export async function bounded() {
  return fetch("https://example.com/one", { signal: AbortSignal.timeout(2_000) });
}
export async function unbounded() {
  return fetch("https://example.com/two");
}`;
  const candidates = collect("require-timeout", source);

  assert.equal(candidates.length, 2);
  const unboundedState = stringifyState(candidates[1]?.state);
  assert.doesNotMatch(unboundedState, /visible_client_configuration":"[^"]*AbortSignal/u);
});

await test("abort deadlines, caller signals, and schema validation stay visible to decisions", () => {
  const source = `import { UserSchema } from "./schema.js";
export async function withDeadline() {
  const response = await fetch("https://example.com/user", {
    signal: AbortSignal.timeout(2_000),
  });
  return UserSchema.parse(await response.json());
}
export async function withCallerSignal(signal: AbortSignal) {
  return fetch("https://example.com/user", { signal });
}
`;
  const timeoutCandidates = collect("require-timeout", source);
  const validationCandidate = collect("require-response-validation", source)[0];

  assert.equal(timeoutCandidates.length, 2);
  assert.match(stringifyState(timeoutCandidates[0]?.state), /AbortSignal\.timeout\(2_000\)/u);
  assert.match(stringifyState(timeoutCandidates[1]?.state), /signal: AbortSignal/u);
  assert.match(stringifyState(validationCandidate?.state), /UserSchema\.parse/u);
});

await test("unknown clients abstain unless explicitly recognized", () => {
  const source = `export async function load(client: InternalClient) {
  return client.get("/user");
}`;
  assert.equal(collect("require-timeout", source).length, 0);
  assert.equal(
    collect(
      "require-timeout",
      `export async function load(fetch: InternalFetcher) { return fetch("/user"); }`,
    ).length,
    0,
  );

  const options: HttpClientRuleOptions = {
    recognizedClients: [
      {
        name: "client",
        kind: "axios",
        guarantees: { timeout: true, responseValidation: true, maxRetries: 2 },
      },
    ],
  };
  const candidate = collect("require-timeout", source, options)[0];
  assert.ok(candidate);
  assert.match(stringifyState(candidate.state), /"source":"configured"/u);
  assert.match(stringifyState(candidate.state), /"response_validation":true/u);
  assert.equal(collect("no-unbounded-retries", source, options).length, 1);
});

await test("retry rule selects visible retry behavior and skips ordinary requests", () => {
  const ordinary = `export async function load() { return fetch("https://example.com"); }`;
  const unbounded = `export async function loadWithRetry() {
  while (true) {
    try { return await fetch("https://example.com"); } catch {}
  }
}`;

  assert.equal(collect("no-unbounded-retries", ordinary).length, 0);
  assert.equal(collect("no-unbounded-retries", unbounded).length, 1);
});

await test("oversized functions abstain instead of using truncated evidence", () => {
  const source = `export async function load() { return fetch("https://example.com"); }`;
  assert.equal(collect("require-timeout", source, { maxFunctionCharacters: 20 }).length, 0);
});

await test("all HTTP rules use calibrated findings and stable diagnostics", () => {
  const cases = [
    ["require-timeout", "missing_timeout", "This HTTP request appears to have no finite timeout."],
    [
      "require-response-validation",
      "unvalidated_response",
      "This HTTP response appears to be used without runtime validation.",
    ],
    [
      "no-unbounded-retries",
      "unbounded_retries",
      "This HTTP request appears to retry without a finite bound.",
    ],
  ] as const;
  const source = `export async function loadWithRetry() {
  while (true) {
    const response = await fetch("https://example.com");
    if (response.ok) return response.json();
  }
}`;

  for (const [ruleName, finding, message] of cases) {
    const rule = httpClients().rules[ruleName]();
    const candidate = rule.collect(parser.parse("client.ts", source))[0];
    assert.ok(candidate);
    const answer: ChoiceAnswer = {
      type: "choice",
      choice: finding,
      confidence: 0.7,
      probabilities: { [finding]: 0.85 },
    };
    assert.equal(rule.diagnose(answer, candidate)?.message, message);
    assert.equal(
      rule.diagnose({ ...answer, confidence: 0.69 }, candidate),
      null,
      `${ruleName} should honor minConfidence`,
    );
  }
});
