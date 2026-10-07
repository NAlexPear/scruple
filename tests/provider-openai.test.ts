import assert from "node:assert/strict";
import test from "node:test";

import { openaiProvider } from "@scruple/provider-openai";

await test("OpenAI provider maps every decision type and normalizes its response", async () => {
  let requestBody: unknown;
  let requestHeaders: Headers | undefined;
  let requestSignal: AbortSignal | null | undefined;
  const provider = openaiProvider({
    apiKey: "test-key",
    model: "gpt-test",
    organization: "org-test",
    project: "project-test",
    concurrency: 7,
    maxRetries: 0,
    fetch: (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      requestSignal = init?.signal;
      assert.ok(typeof init?.body === "string");
      requestBody = JSON.parse(init.body);
      return Promise.resolve(
        Response.json({
          model: "gpt-test-resolved",
          answers: [
            { type: "predicate", name: "safe", probability: 0.2 },
            {
              type: "choice",
              name: "kind",
              choice: "beta",
              confidence: 0.8,
              probabilities: [
                { value: "alpha", probability: 0.1 },
                { value: "beta", probability: 0.9 },
              ],
            },
            {
              type: "score",
              name: "severity",
              score: 1.25,
              confidence: 0.7,
              probabilities: [
                { value: 0, label: "0", probability: 0.1 },
                { value: 1, label: "1", probability: 0.55 },
                { value: 2, label: "2", probability: 0.35 },
              ],
            },
          ],
          usage: { input_tokens: 123, output_tokens: 4, total_tokens: 127 },
        }),
      );
    },
  });
  const controller = new AbortController();
  const response = await provider.evaluate(
    {
      state: { z: true, a: [2, "one"] },
      questions: {
        safe: {
          type: "noul",
          instructions: { question: "Is it safe?" },
          criteria: { true: "No risky behavior", false: { reason: "Risk is present" } },
        },
        kind: {
          type: "choice",
          instructions: "Choose a kind",
          criteria: { alpha: { first: true }, beta: "Second" },
        },
        severity: {
          type: "score",
          instructions: ["Rate", "severity"],
          criteria: ["Low", { impact: "Medium" }, "High"],
        },
      },
    },
    controller.signal,
  );

  assert.equal(provider.id, "openai:gpt-test");
  assert.equal(provider.concurrency, 7);
  assert.equal(requestHeaders?.get("authorization"), "Bearer test-key");
  assert.equal(requestHeaders?.get("openai-organization"), "org-test");
  assert.equal(requestHeaders?.get("openai-project"), "project-test");
  assert.ok(requestSignal instanceof AbortSignal);
  assert.deepEqual(requestBody, {
    model: "gpt-test",
    input: '{"a":[2,"one"],"z":true}',
    questions: [
      {
        type: "predicate",
        name: "safe",
        instructions:
          '{"question":"Is it safe?"}\n\nTrue criteria: No risky behavior\n\nFalse criteria: {"reason":"Risk is present"}',
      },
      {
        type: "choice",
        name: "kind",
        instructions: "Choose a kind",
        choices: [
          { value: "alpha", description: '{"first":true}' },
          { value: "beta", description: "Second" },
        ],
      },
      {
        type: "score",
        name: "severity",
        instructions: '["Rate","severity"]',
        levels: [
          { label: "0", description: "Low" },
          { label: "1", description: '{"impact":"Medium"}' },
          { label: "2", description: "High" },
        ],
      },
    ],
  });
  assert.deepEqual(response, {
    model: "gpt-test-resolved",
    answers: {
      safe: { type: "noul", noul: 0.2 },
      kind: {
        type: "choice",
        choice: "beta",
        confidence: 0.8,
        probabilities: { alpha: 0.1, beta: 0.9 },
      },
      severity: {
        type: "score",
        score: 1.25,
        confidence: 0.7,
        probabilities: { "0": 0.1, "1": 0.55, "2": 0.35 },
        legend: { "0": "Low", "1": { impact: "Medium" }, "2": "High" },
      },
    },
    usage: { inputTokens: 123, outputTokens: 4 },
  });
});

await test("OpenAI provider validates options and API failures", async () => {
  assert.throws(() => openaiProvider({ apiKey: " " }), /apiKey must not be empty/u);
  assert.throws(() => openaiProvider({ apiKey: "key", concurrency: 0 }), /positive integer/u);
  assert.throws(() => openaiProvider({ apiKey: "key", maxRetries: -1 }), /non-negative integer/u);
  const provider = openaiProvider({
    apiKey: "key",
    maxRetries: 0,
    fetch: () =>
      Promise.resolve(Response.json({ error: { message: "model unavailable" } }, { status: 400 })),
  });
  await assert.rejects(
    provider.evaluate({ state: null, questions: {} }),
    /OpenAI HTTP 400: model unavailable/u,
  );
});

await test("OpenAI provider rejects refusals and malformed answers", async () => {
  const request = {
    state: "source",
    questions: { decision: { type: "noul" as const, instructions: "Safe?" } },
  };
  const refusal = openaiProvider({
    apiKey: "key",
    maxRetries: 0,
    fetch: () =>
      Promise.resolve(
        Response.json({
          model: "gpt-6-luna",
          answers: [{ type: "refusal", name: "decision" }],
          usage: { input_tokens: 1, output_tokens: 0 },
        }),
      ),
  });
  await assert.rejects(refusal.evaluate(request), /refused question decision/u);

  const omitted = openaiProvider({
    apiKey: "key",
    maxRetries: 0,
    fetch: () =>
      Promise.resolve(
        Response.json({
          model: "gpt-6-luna",
          answers: [],
          usage: { input_tokens: 1, output_tokens: 0 },
        }),
      ),
  });
  await assert.rejects(omitted.evaluate(request), /answer names must match/u);
});

await test("OpenAI provider retries only transient responses", async () => {
  const responses = [
    new Response("busy", { status: 503, headers: { "retry-after": "0" } }),
    Response.json({
      model: "gpt-6-luna",
      answers: [{ type: "predicate", name: "decision", probability: 0.4 }],
      usage: { input_tokens: 2, output_tokens: 0 },
    }),
  ];
  const provider = openaiProvider({
    apiKey: "key",
    maxRetries: 1,
    fetch: () => Promise.resolve(responses.shift()!),
  });
  await provider.evaluate({
    state: "source",
    questions: { decision: { type: "noul", instructions: "Safe?" } },
  });
  assert.equal(responses.length, 0);
});
