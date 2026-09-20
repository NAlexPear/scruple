import assert from "node:assert/strict";
import test from "node:test";

import { jevProvider } from "@scruple/provider-jev";

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
  const provider = jevProvider({
    apiKey: "test-key",
    model: "jev-test",
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
