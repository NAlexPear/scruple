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
  let requestBody: unknown;
  const provider = kevProvider({
    baseURL: "http://127.0.0.1:8008",
    model: "kev-4b",
    fetch: (input, init) => {
      requested.push(input);
      const body = init?.body;
      assert.ok(typeof body === "string");
      requestBody = JSON.parse(body);
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
  assert.deepEqual(requestBody, {
    state: "const value = 1;",
    questions: { decision: { type: "noul", instructions: "Is this useful?" } },
    model: "kev-4b",
  });
  assert.deepEqual(response, {
    model: "kev-4b",
    answers: { decision: { type: "noul", noul: 0.25 } },
    usage: { inputTokens: 9, outputTokens: 2 },
  });
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
