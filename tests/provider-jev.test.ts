import assert from "node:assert/strict";
import test from "node:test";

import { jevProvider, kevProvider } from "@scruple/provider-jev";

const restoreEnvironment = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

await test("Jev provider uses its explicit API key and sends provider-neutral questions", async (t) => {
  let requestBody: unknown;
  const originalApiKey = process.env["TYPESAFE_API_KEY"];
  process.env["TYPESAFE_API_KEY"] = "environment-key-must-not-be-used";
  t.after(() => {
    restoreEnvironment("TYPESAFE_API_KEY", originalApiKey);
  });
  assert.throws(() => jevProvider({ apiKey: " " }), /apiKey must not be empty/u);
  assert.equal(jevProvider({ apiKey: "test-key" }).concurrency, 64);
  const provider = jevProvider({
    apiKey: "test-key",
    model: "jev-test",
    concurrency: 32,
    maxRetries: 0,
    fetch: (input, init) => {
      assert.equal(input, "https://api.typesafe.ai/v1/systemone");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
      const body = init?.body;
      assert.ok(typeof body === "string");
      requestBody = JSON.parse(body);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: "jev-resolved",
            answers: { decision: { type: "noul", noul: 0.75 } },
            usage: { input_tokens: 12, output_tokens: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    },
  });

  const response = await provider.evaluate({
    state: { source: "const value = 1;" },
    questions: { decision: { type: "noul", instructions: "Is this useful?" } },
  });

  assert.equal(provider.concurrency, 32);
  assert.deepEqual(requestBody, {
    state: { source: "const value = 1;" },
    questions: { decision: { type: "noul", instructions: "Is this useful?" } },
    model: "jev-test",
  });
  assert.deepEqual(response, {
    model: "jev-resolved",
    answers: { decision: { type: "noul", noul: 0.75 } },
    usage: { inputTokens: 12, outputTokens: 3 },
  });
});

await test("Kev provider refuses non-loopback servers unless explicitly allowed", () => {
  assert.throws(
    () => kevProvider({ baseURL: "https://api.typesafe.ai" }),
    /must be a loopback address/u,
  );
  assert.throws(() => kevProvider({ baseURL: "http://10.0.0.5:8008" }), /loopback/u);
  assert.equal(kevProvider({ baseURL: "http://127.0.0.1:8008" }).id, "kev:kev-latest");
  assert.equal(kevProvider({ baseURL: "http://localhost:8008", model: "kev-4b" }).id, "kev:kev-4b");
  assert.equal(
    kevProvider({ baseURL: "http://gpu.internal:8008", allowRemote: true }).id,
    "kev:kev-latest",
  );
});

await test("Kev provider sends System One requests only to its own server", async (t) => {
  const originalBaseUrl = process.env["TYPESAFE_BASE_URL"];
  process.env["TYPESAFE_BASE_URL"] = "https://api.typesafe.ai";
  t.after(() => {
    restoreEnvironment("TYPESAFE_BASE_URL", originalBaseUrl);
  });
  const requested: string[] = [];
  const provider = kevProvider({
    baseURL: "http://127.0.0.1:8008",
    model: "kev-4b",
    fetch: (input) => {
      requested.push(input);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: "kev-4b",
            answers: { decision: { type: "noul", noul: 0.25 } },
            usage: { input_tokens: 9, output_tokens: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    },
  });

  const response = await provider.evaluate({
    state: "const value = 1;",
    questions: { decision: { type: "noul", instructions: "Is this useful?" } },
  });

  assert.equal(provider.concurrency, 1);
  assert.deepEqual(requested, ["http://127.0.0.1:8008/v1/systemone"]);
  assert.equal(response.model, "kev-4b");
});

await test("Kev provider queues requests beyond its concurrency", async () => {
  let active = 0;
  let peak = 0;
  const provider = kevProvider({
    baseURL: "http://127.0.0.1:8008",
    fetch: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      active -= 1;
      return new Response(
        JSON.stringify({
          model: "kev-latest",
          answers: { decision: { type: "noul", noul: 0.5 } },
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const request = {
    state: "x",
    questions: { decision: { type: "noul" as const, instructions: "Is this useful?" } },
  };

  await Promise.all([
    provider.evaluate(request),
    provider.evaluate(request),
    provider.evaluate(request),
  ]);

  assert.equal(peak, 1);
});
