import test from "node:test";
import assert from "node:assert/strict";
import { createSub2apiCommand } from "../src/command.js";

test("the chat command registers as /sub2api and accepts arguments", () => {
  const command = createSub2apiCommand({ sync: async () => ({ synced: true, models: 0 }) });
  assert.equal(command.name, "sub2api");
  assert.equal(command.acceptsArgs, true);
  assert.equal(typeof command.handler, "function");
});

test("sync subcommand forces a sync with the invocation config and reports the result", async () => {
  let seen;
  const command = createSub2apiCommand({ sync: async (ctx, force) => {
    seen = { ctx, force }; return { synced: true, models: 7, revision: "r1", mode: "prepared" };
  } });
  const config = { models: { providers: { "sub2api-provider": { baseUrl: "http://localhost/v1" } } } };
  const reply = await command.handler({ args: "sync", config, agentId: "agent-1" });
  assert.equal(seen.force, true);
  assert.equal(seen.ctx.config, config);
  assert.equal(seen.ctx.agentId, "agent-1");
  assert.match(reply.text, /published 7 model/);
  assert.match(reply.text, /r1/);
});

test("subcommand matching is case-insensitive", async () => {
  let calls = 0;
  const command = createSub2apiCommand({ sync: async () => { calls++; return { synced: true, models: 1, mode: "prepared" }; } });
  const reply = await command.handler({ args: " SYNC ", config: {} });
  assert.equal(calls, 1);
  assert.match(reply.text, /published 1 model/);
});

test("empty or unknown arguments return usage without syncing", async () => {
  let calls = 0;
  const command = createSub2apiCommand({ sync: async () => { calls++; return { synced: true, models: 0 }; } });
  for (const args of ["", "catalog", "syncx"]) {
    const reply = await command.handler({ args, config: {} });
    assert.match(reply.text, /Usage: \/sub2api sync/);
  }
  const reply = await command.handler({ config: {} });
  assert.match(reply.text, /Usage: \/sub2api sync/);
  assert.equal(calls, 0);
});

test("unconfigured and stale outcomes explain why nothing was published", async () => {
  const unconfigured = createSub2apiCommand({ sync: async () => ({ synced: false, reason: "unconfigured" }) });
  assert.match((await unconfigured.handler({ args: "sync", config: {} })).text, /not configured/);
  const stale = createSub2apiCommand({ sync: async () => ({ synced: false, reason: "stale" }) });
  assert.match((await stale.handler({ args: "sync", config: {} })).text, /stays published/);
});

test("sync failures surface as reply text instead of throwing into the channel", async () => {
  const command = createSub2apiCommand({ sync: async () => { throw new Error("boom"); } });
  const reply = await command.handler({ args: "sync", config: {} });
  assert.match(reply.text, /sync failed: boom/);
});
