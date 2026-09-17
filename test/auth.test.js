import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthModelAccessPatch } from "../src/auth.js";

test("login repairs a modern policy that overrides the legacy CPA wildcard", () => {
  const config = { agents: { defaults: {
    models: { "sub2api-provider/*": { alias: "CPA" } },
    modelPolicy: { allow: ["other/model-a", "other/model-b"] },
  } } };
  const before = structuredClone(config);
  const patch = buildAuthModelAccessPatch(config);
  assert.deepEqual(patch.defaults.modelPolicy.allow, ["other/model-a", "other/model-b", "sub2api-provider/*"]);
  assert.deepEqual(patch.defaults.models["sub2api-provider/*"], { alias: "CPA" });
  assert.deepEqual(config, before);
  const updated = { agents: { defaults: { ...config.agents.defaults, ...patch.defaults } } };
  assert.deepEqual(buildAuthModelAccessPatch(updated), patch, "repeated login must not duplicate the wildcard");
});

test("legacy login does not introduce an unsupported modelPolicy field", () => {
  assert.deepEqual(buildAuthModelAccessPatch({}), { defaults: { models: { "sub2api-provider/*": {} } } });
});

test("an explicitly empty policy gains only CPA access", () => {
  const config = { agents: { defaults: { modelPolicy: { allow: [] } } } };
  assert.deepEqual(buildAuthModelAccessPatch(config).defaults.modelPolicy.allow, ["sub2api-provider/*"]);
});
