import assert from "node:assert/strict";
import test from "node:test";

import { kevProvider } from "@scruple/provider-kev";

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
      instructions: true,
      criteria: { true: { reason: "helps" }, false: 0 },
    },
    outcome: {
      type: "choice" as const,
      instructions: { task: "Classify the code." },
      criteria: { finding: "Report it.", safe: null },
    },
    severity: {
      type: "score" as const,
      instructions: ["How severe is it?", 3],
      criteria: ["low", { label: "medium" }, false] as [string, { label: string }, boolean],
    },
  },
};

const result = {
  model: "kev-27b-v1.0",
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
      legend: { "0": "low", "1": { label: "medium" }, "2": false },
    },
  },
  usage: { input_tokens: 73, output_tokens: 11, state_tokens: 9, state_tokens_used: 9 },
  latency_ms: 42,
};

await test("Kev provider preserves every question type and validates the response", async (t) => {
  let requestBody: unknown;
  const originalApiKey = process.env["KEV_API_KEY"];
  process.env["KEV_API_KEY"] = "environment-key-must-not-be-used";
  t.after(() => {
    restoreEnvironment("KEV_API_KEY", originalApiKey);
  });
  assert.throws(() => kevProvider({ apiKey: " " }), /apiKey must not be empty/u);
  assert.throws(() => kevProvider({ checkpoint: " " }), /checkpoint must not be empty/u);
  assert.throws(() => kevProvider({ concurrency: 0 }), /concurrency must be a positive integer/u);
  assert.throws(() => kevProvider({ timeoutMs: 1.5 }), /timeoutMs must be a positive integer/u);
  assert.equal(kevProvider().concurrency, 32);
  const provider = kevProvider({
    apiKey: "explicit-key",
    baseURL: "https://kev.example/",
    checkpoint: "jaredpalmer/kev-27b@v1.0",
    concurrency: 7,
    timeoutMs: 1_000,
    fetch: (input, init) => {
      assert.equal(input, "https://kev.example/v1/systemone");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer explicit-key");
      assert.equal(new Headers(init?.headers).get("accept"), "application/json");
      assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
      assert.ok(init?.signal);
      assert.equal(init.signal.aborted, false);
      assert.ok(typeof init.body === "string");
      requestBody = JSON.parse(init.body) as unknown;
      return Promise.resolve(Response.json(result));
    },
  });

  const response = await provider.evaluate(request);

  assert.equal(provider.id, "kev:jaredpalmer/kev-27b@v1.0");
  assert.equal(provider.concurrency, 7);
  assert.equal("close" in provider, false);
  assert.deepEqual(requestBody, { model: "kev-latest", ...request });
  assert.deepEqual(response, {
    model: "kev-27b-v1.0",
    answers: result.answers,
    usage: { inputTokens: 73, outputTokens: 11 },
  });
});

await test("Kev provider leaves authorization unset for an open local server", async () => {
  const provider = kevProvider({
    fetch: (input, init) => {
      assert.equal(input, "http://127.0.0.1:8009/v1/systemone");
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      return Promise.resolve(Response.json(result));
    },
  });

  await provider.evaluate(request);
});

await test("Kev provider propagates caller cancellation", async () => {
  const controller = new AbortController();
  const observed: { signal?: AbortSignal } = {};
  const provider = kevProvider({
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

await test("Kev provider enforces its request timeout", async () => {
  const keepAlive = setTimeout(
    () => assert.fail("provider timeout did not abort the request"),
    100,
  );
  const provider = kevProvider({
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

await test("Kev provider rejects API failures and malformed decisions", async () => {
  const responses = [
    Response.json({ detail: "Invalid API key" }, { status: 401 }),
    Response.json({
      ...result,
      answers: {
        ...result.answers,
        outcome: { ...result.answers.outcome, probabilities: { safe: 1 } },
      },
    }),
    Response.json({
      ...result,
      answers: { ...result.answers, unexpected: { type: "noul", noul: 1 } },
    }),
    Response.json({ ...result, usage: { input_tokens: 1, output_tokens: -1 } }),
  ];
  const provider = kevProvider({ fetch: () => Promise.resolve(responses.shift()!) });

  await assert.rejects(provider.evaluate(request), /Kev HTTP 401.*Invalid API key/u);
  await assert.rejects(provider.evaluate(request), /invalid probability labels/u);
  await assert.rejects(provider.evaluate(request), /answer names must match/u);
  await assert.rejects(provider.evaluate(request), /output_tokens must be a non-negative integer/u);
});
