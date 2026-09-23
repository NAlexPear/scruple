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

const kevResponse = (): Promise<Response> =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        model: "kev-4b",
        answers: { decision: { type: "noul", noul: 0.25 } },
        usage: { input_tokens: 9, output_tokens: 2 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

const request = {
  state: "const value = 1;",
  questions: { decision: { type: "noul" as const, instructions: "Is this useful?" } },
};

await test("Kev provider sends System One requests only to its own server", async (t) => {
  const originalBaseUrl = process.env["TYPESAFE_BASE_URL"];
  const originalApiKey = process.env["TYPESAFE_API_KEY"];
  process.env["TYPESAFE_BASE_URL"] = "https://api.typesafe.ai";
  process.env["TYPESAFE_API_KEY"] = "environment-key-must-not-be-used";
  t.after(() => {
    restoreEnvironment("TYPESAFE_BASE_URL", originalBaseUrl);
    restoreEnvironment("TYPESAFE_API_KEY", originalApiKey);
  });
  assert.throws(
    () => kevProvider({ baseURL: "http://127.0.0.1:8008", model: " " }),
    /model must not be empty/u,
  );
  const requested: string[] = [];
  let requestBody: unknown;
  const provider = kevProvider({
    baseURL: "http://127.0.0.1:8008",
    model: "kev-4b",
    fetch: (input, init) => {
      requested.push(input);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer kev-local");
      const body = init?.body;
      assert.ok(typeof body === "string");
      requestBody = JSON.parse(body);
      return kevResponse();
    },
  });

  const response = await provider.evaluate(request);

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

await test("Kev provider sends an explicit API key", async () => {
  let authorization: string | null = null;
  const provider = kevProvider({
    baseURL: "http://127.0.0.1:8008",
    apiKey: "test-key",
    model: "kev-4b",
    fetch: (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization");
      return kevResponse();
    },
  });

  await provider.evaluate(request);

  assert.equal(authorization, "Bearer test-key");
});
