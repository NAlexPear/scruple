import assert from "node:assert/strict";
import test from "node:test";

import { cloudflareProvider } from "@scruple/provider-cloudflare";

const restoreEnvironment = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

const request = {
  state: { source: "const value = 1;", attempts: 2, enabled: true },
  questions: {
    useful: {
      type: "noul" as const,
      instructions: "Is this useful?",
      criteria: { true: true, false: false },
    },
    outcome: {
      type: "choice" as const,
      instructions: { task: "Classify the code." },
      criteria: { finding: "Report it.", safe: 0 },
    },
    severity: {
      type: "score" as const,
      instructions: "How severe is it?",
      criteria: ["low", "medium", "high"] as [string, string, ...string[]],
    },
  },
};

const result = {
  model: "clef-2026-10-01",
  answers: {
    useful: { type: "noul", noul: 0.8 },
    outcome: {
      type: "choice",
      choice: "safe",
      confidence: 0.7,
      probabilities: { finding: 0.1, safe: 0.9 },
    },
    severity: {
      type: "score",
      score: 1.25,
      confidence: 0.6,
      probabilities: { "0": 0.1, "1": 0.55, "2": 0.35 },
      legend: { "0": "low", "1": "medium", "2": "high" },
    },
  },
  usage: { input_tokens: 42, output_tokens: 0 },
};

await test("Cloudflare provider maps every question type and parses the API envelope", async (t) => {
  let requestBody: unknown;
  const originalToken = process.env["CLOUDFLARE_API_TOKEN"];
  process.env["CLOUDFLARE_API_TOKEN"] = "environment-token-must-not-be-used";
  t.after(() => {
    restoreEnvironment("CLOUDFLARE_API_TOKEN", originalToken);
  });
  assert.throws(
    () => cloudflareProvider({ accountId: " ", apiToken: "test-token" }),
    /accountId must not be empty/u,
  );
  assert.throws(
    () => cloudflareProvider({ accountId: "test-account", apiToken: " " }),
    /apiToken must not be empty/u,
  );
  assert.throws(
    () => cloudflareProvider({ accountId: "test-account", apiToken: "test-token", concurrency: 0 }),
    /concurrency must be a positive integer/u,
  );
  assert.equal(
    cloudflareProvider({ accountId: "test-account", apiToken: "test-token" }).concurrency,
    4,
  );
  const provider = cloudflareProvider({
    accountId: "test-account",
    apiToken: "explicit-token",
    model: "clef-flash",
    concurrency: 2,
    timeoutMs: 1_000,
    fetch: (input, init) => {
      assert.equal(
        input,
        "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/cloudflare/clef-flash",
      );
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer explicit-token");
      assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
      assert.ok(init?.signal);
      assert.equal(init.signal.aborted, false);
      const body = init.body;
      assert.ok(typeof body === "string");
      requestBody = JSON.parse(body) as unknown;
      return Promise.resolve(Response.json({ result, success: true, errors: [], messages: [] }));
    },
  });

  const response = await provider.evaluate(request);

  assert.equal(provider.id, "cloudflare:clef-flash");
  assert.equal(provider.concurrency, 2);
  assert.deepEqual(requestBody, { model: "clef-flash", ...request });
  assert.deepEqual(response, {
    model: "clef-2026-10-01",
    answers: result.answers,
    usage: { inputTokens: 42, outputTokens: 0 },
  });
});

await test("Cloudflare provider propagates caller cancellation", async () => {
  const controller = new AbortController();
  const observed: { signal?: AbortSignal } = {};
  const provider = cloudflareProvider({
    accountId: "test-account",
    apiToken: "test-token",
    fetch: (_input, init) => {
      const signal = init?.signal;
      assert.ok(signal);
      observed.signal = signal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            reject(new Error("request aborted"));
          },
          { once: true },
        );
      });
    },
  });
  const pending = provider.evaluate(request, controller.signal);

  controller.abort();

  await assert.rejects(pending, /aborted/iu);
  assert.equal(observed.signal?.aborted, true);
});

await test("Cloudflare provider enforces its request timeout", async () => {
  const keepAlive = setTimeout(
    () => assert.fail("provider timeout did not abort the request"),
    100,
  );
  const provider = cloudflareProvider({
    accountId: "test-account",
    apiToken: "test-token",
    timeoutMs: 10,
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new Error("request timed out"));
          },
          { once: true },
        );
      }),
  });

  try {
    await assert.rejects(provider.evaluate(request), /timed out/iu);
  } finally {
    clearTimeout(keepAlive);
  }
});

await test("Cloudflare provider rejects API failures and malformed decisions", async () => {
  const responses = [
    Response.json(
      { success: false, errors: [{ code: 3040, message: "Capacity temporarily exceeded" }] },
      { status: 429 },
    ),
    Response.json({
      success: true,
      result: {
        ...result,
        answers: {
          ...result.answers,
          outcome: {
            ...result.answers.outcome,
            probabilities: { safe: 1 },
          },
        },
      },
    }),
  ];
  const provider = cloudflareProvider({
    accountId: "test-account",
    apiToken: "test-token",
    fetch: () => Promise.resolve(responses.shift()!),
  });

  await assert.rejects(provider.evaluate(request), /Cloudflare HTTP 429.*Capacity/u);
  await assert.rejects(provider.evaluate(request), /invalid probability labels/u);
});
