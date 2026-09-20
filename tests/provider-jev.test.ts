import assert from "node:assert/strict";
import test from "node:test";

import { jevProvider } from "@scruple/provider-jev";

await test("Jev provider supports injected fetch and sends provider-neutral questions", async () => {
  let requestBody: unknown;
  const provider = jevProvider({
    apiKey: "test-key",
    model: "jev-test",
    maxRetries: 0,
    fetch: (input, init) => {
      assert.equal(input, "https://api.typesafe.ai/v1/systemone");
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
