import assert from "node:assert/strict";
import test from "node:test";

import { layaProvider } from "@scruple/provider-laya";

await test("Laya provider owns its concurrency limit", (t) => {
  const defaultProvider = layaProvider();
  const overriddenProvider = layaProvider({ concurrency: 2 });
  t.after(async () => {
    await defaultProvider.close?.();
    await overriddenProvider.close?.();
  });

  assert.equal(defaultProvider.concurrency, 1);
  assert.equal(overriddenProvider.concurrency, 2);
});
