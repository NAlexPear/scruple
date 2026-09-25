import assert from "node:assert/strict";
import test from "node:test";

import { deciderProvider } from "@scruple/provider-decider";

await test("Decider provider maps every question type and forwards cancellation", async () => {
  let requestBody: unknown;
  const controller = new AbortController();
  assert.throws(() => deciderProvider({ apiKey: " " }), /apiKey must not be empty/u);
  assert.equal(deciderProvider().concurrency, 32);
  const provider = deciderProvider({
    apiKey: "proxy-key",
    baseURL: "https://decider.example.test",
    model: "decider-test",
    concurrency: 8,
    maxRetries: 0,
    fetch: (input, init) => {
      assert.equal(input, "https://decider.example.test/v1/systemone");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer proxy-key");
      const signal = init?.signal;
      assert.ok(signal);
      assert.equal(signal.aborted, false);
      const body = init?.body;
      assert.ok(typeof body === "string");
      requestBody = JSON.parse(body);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: "decider-4b-v2.1",
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
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    },
  });

  const response = await provider.evaluate(
    {
      state: { source: "const value = 1;", attempts: 2, enabled: true },
      questions: {
        useful: {
          type: "noul",
          instructions: "Is this useful?",
          criteria: { true: true, false: false },
        },
        outcome: {
          type: "choice",
          instructions: { task: "Classify the code." },
          criteria: { finding: "Report it.", safe: 0 },
        },
        severity: {
          type: "score",
          instructions: "How severe is it?",
          criteria: ["low", "medium", "high"],
        },
      },
    },
    controller.signal,
  );

  assert.equal(provider.id, "decider:decider-test");
  assert.equal(provider.concurrency, 8);
  assert.deepEqual(requestBody, {
    state: { source: "const value = 1;", attempts: 2, enabled: true },
    questions: {
      useful: {
        type: "noul",
        instructions: "Is this useful?",
        criteria: { true: { value: true }, false: { value: false } },
      },
      outcome: {
        type: "choice",
        instructions: { task: "Classify the code." },
        criteria: { finding: "Report it.", safe: { value: 0 } },
      },
      severity: {
        type: "score",
        instructions: "How severe is it?",
        criteria: ["low", "medium", "high"],
      },
    },
    model: "decider-test",
  });
  assert.deepEqual(response, {
    model: "decider-4b-v2.1",
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
    usage: { inputTokens: 42, outputTokens: 0 },
  });
});

await test("Decider provider propagates cancellation to its HTTP request", async () => {
  const controller = new AbortController();
  const observed: { signal?: AbortSignal } = {};
  const provider = deciderProvider({
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
  const pending = provider.evaluate(
    {
      state: "const value = 1;",
      questions: { useful: { type: "noul", instructions: "Is this useful?" } },
    },
    controller.signal,
  );

  controller.abort();

  await assert.rejects(pending, /aborted/iu);
  assert.equal(observed.signal?.aborted, true);
});
