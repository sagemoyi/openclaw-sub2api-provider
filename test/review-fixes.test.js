// Regressions from the post-review fix set (F1–F6): Anthropic baseUrl handling,
// the sub2api client_version rich probe, and o-series token boundaries.
import test from "node:test";
import assert from "node:assert/strict";
import { CatalogClient, normalizeBaseUrl, stripV1Suffix, inferNativeApiForModelId } from "../src/catalog.js";
import { createSub2apiProvider, patchPayload } from "../src/provider.js";

const PROVIDER = "sub2api-provider";
const baseConfig = (models = [], baseUrl = "https://s2a.example.com/v1") =>
  ({ models: { providers: { [PROVIDER]: { baseUrl, models } } } });

test("F1 unit: stripV1Suffix removes only a trailing /v1 and passes everything else through", () => {
  assert.equal(stripV1Suffix("http://h/v1"), "http://h");
  assert.equal(stripV1Suffix("http://h/s2a/v1"), "http://h/s2a");
  assert.equal(stripV1Suffix("https://s2a.example.com/v1"), "https://s2a.example.com");
  assert.equal(stripV1Suffix("http://h/s2a"), "http://h/s2a");
  assert.equal(stripV1Suffix("http://h/v1beta"), "http://h/v1beta");
  assert.equal(stripV1Suffix(undefined), undefined);
  assert.equal(stripV1Suffix(null), null);
  // A normalized endpoint always ends in /v1, so the pair round-trips.
  assert.equal(stripV1Suffix(normalizeBaseUrl("https://s2a.example.com")), "https://s2a.example.com");
});

async function discovered(rows, models = []) {
  const config = baseConfig(models);
  const cpa = createSub2apiProvider({ config, fetchRows: async (params) => rows(params),
    resolveAuth: async () => ({ apiKey: "test-key" }) });
  await cpa.provider.catalog.run({ config });
  return { config, cpa };
}

test("F1: Anthropic rows resolve without /v1 while OpenAI-family rows keep it", async () => {
  const { config, cpa } = await discovered(({ endpoint }) => endpoint.includes("?")
    ? [{ slug: "claude-sonnet-4", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] },
        { slug: "gpt-5.6", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: ["low"] }]
    : [{ id: "claude-sonnet-4" }, { id: "gpt-5.6" }]);
  const claude = cpa.provider.resolveDynamicModel({ config, modelId: "claude-sonnet-4" });
  assert.equal(claude.api, "anthropic-messages");
  assert.equal(claude.baseUrl, "https://s2a.example.com");
  const gpt = cpa.provider.resolveDynamicModel({ config, modelId: "gpt-5.6" });
  assert.equal(gpt.api, "openai-responses");
  assert.equal(gpt.baseUrl, "https://s2a.example.com/v1");
});

test("F1: an explicit models[].api flip recomputes baseUrl instead of reusing the catalog stamp", async () => {
  // Catalog stamps an Anthropic row with the stripped URL; the user flips it back to completions.
  const { config, cpa } = await discovered(({ endpoint }) => endpoint.includes("?")
    ? [{ slug: "claude-sonnet-4", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] }]
    : [{ id: "claude-sonnet-4" }], [{ id: "claude-sonnet-4", api: "openai-completions" }]);
  const flipped = cpa.provider.resolveDynamicModel({ config, modelId: "claude-sonnet-4" });
  assert.equal(flipped.api, "openai-completions");
  assert.equal(flipped.baseUrl, "https://s2a.example.com/v1");

  // The inverse: an unknown ID the catalog never saw, forced onto Anthropic.
  const unknown = await discovered(async () => [], [{ id: "mystery-router", api: "anthropic-messages" }]);
  const forced = unknown.cpa.provider.resolveDynamicModel({ config: unknown.config, modelId: "mystery-router" });
  assert.equal(forced.api, "anthropic-messages");
  assert.equal(forced.baseUrl, "https://s2a.example.com");
});

test("F1: a user-supplied per-model baseUrl outranks the recomputed one", async () => {
  const { config, cpa } = await discovered(({ endpoint }) => endpoint.includes("?")
    ? [{ slug: "claude-sonnet-4", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] }]
    : [{ id: "claude-sonnet-4" }], [{ id: "claude-sonnet-4", baseUrl: "https://custom.example/v1" }]);
  const model = cpa.provider.resolveDynamicModel({ config, modelId: "claude-sonnet-4" });
  assert.equal(model.baseUrl, "https://custom.example/v1");
});

test("F1: catalog.run publishes stripped Anthropic rows and keeps the provider-level /v1", async () => {
  const config = baseConfig();
  const cpa = createSub2apiProvider({ config, resolveAuth: async () => ({ apiKey: "test-key" }),
    fetchRows: async ({ endpoint }) => endpoint.includes("?")
      ? [{ slug: "claude-sonnet-4", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] },
          { slug: "gpt-5.6", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] }]
      : [{ id: "claude-sonnet-4" }, { id: "gpt-5.6" }] });
  const published = await cpa.provider.catalog.run({ config });
  assert.equal(published.provider.baseUrl, "https://s2a.example.com/v1");
  const byId = Object.fromEntries(published.provider.models.map((m) => [m.id, m]));
  assert.equal(byId["claude-sonnet-4"].api, "anthropic-messages");
  assert.equal(byId["claude-sonnet-4"].baseUrl, "https://s2a.example.com");
  assert.equal(byId["gpt-5.6"].api, "openai-responses");
  assert.equal(byId["gpt-5.6"].baseUrl, undefined);
});

test("F2: patchPayload leaves Anthropic payloads to the host's native thinking handling", () => {
  const payload = { model: "claude-sonnet-4", thinking: { type: "enabled", budget_tokens: 4096 }, messages: [] };
  const snapshot = structuredClone(payload);
  assert.deepEqual(patchPayload(payload, "anthropic-messages", "high"), snapshot);
  assert.equal(Object.hasOwn(payload, "reasoning_effort"), false);
  // An undefined effort must not delete the host-owned thinking block either.
  assert.deepEqual(patchPayload({ ...snapshot }, "anthropic-messages", undefined), snapshot);
});

test("F3: discovery probes a non-empty client_version", async () => {
  const seen = [];
  const client = new CatalogClient({ fetchRows: async ({ endpoint, readRows }) => {
    seen.push(endpoint); return readRows(endpoint.includes("?") ? [] : [{ id: "a" }]);
  } });
  await client.get({ baseUrl: "http://localhost:8317/v1", apiKey: "test-key" });
  assert.deepEqual(seen.sort(), ["http://localhost:8317/v1/models", "http://localhost:8317/v1/models?client_version=1"]);
});

test("F3: a 400 from the rich endpoint is a conservative fallback, not a failed snapshot", async () => {
  for (const status of [400, 404, 405]) {
    const client = new CatalogClient({ fetchRows: async ({ endpoint }) => {
      if (endpoint.includes("?")) throw Object.assign(new Error("rejected parameter"), { status });
      return [{ id: "a" }];
    } });
    const result = await client.get({ baseUrl: "http://localhost" });
    assert.equal(result.rich, false);
    assert.equal(result.models[0].id, "a");
    assert.equal(result.models[0].contextWindow, 32768);
    assert.equal(result.models[0].maxTokens, 4096);
  }
  // 401/500 keep failing the snapshot.
  for (const status of [401, 500]) {
    const client = new CatalogClient({ fetchRows: async ({ endpoint }) => {
      if (endpoint.includes("?")) throw Object.assign(new Error("failure"), { status });
      return [{ id: "a" }];
    } });
    await assert.rejects(client.get({ baseUrl: "http://localhost" }));
  }
});

test("F3: sub2api plain rows carry display_name, so an ignored probe stays non-rich", async () => {
  const warnings = [];
  const plain = [{ id: "deepseek-v3", display_name: "DeepSeek V3", created_at: 1700000000, type: "text" }];
  let calls = 0;
  const client = new CatalogClient({ warn: (m) => warnings.push(m),
    fetchRows: async () => { calls++; return plain; } });
  const result = await client.get({ baseUrl: "http://localhost" });
  assert.equal(calls, 2, "both endpoints are still requested");
  assert.equal(result.rich, false);
  assert.ok(warnings.some((w) => w.includes("no rich catalog")));
  assert.equal(result.models[0].contextWindow, 32768);
  assert.equal(result.models[0].maxTokens, 4096);
  assert.equal(result.models[0].reasoning, false);
  // A row with a real rich discriminator is still treated as rich.
  const rich = new CatalogClient({ fetchRows: async ({ endpoint }) =>
    endpoint.includes("?") ? [{ id: "a", context_window: 64000 }] : [{ id: "a", display_name: "A" }] });
  assert.equal((await rich.get({ baseUrl: "http://localhost" })).rich, true);
});

test("F4: o-series inference needs token boundaries, so unrelated ids stay on the default", () => {
  for (const id of ["o1", "o1-pro", "o3-mini", "o4-mini", "openai/o1", "vendor-o3-mini"]) {
    assert.equal(inferNativeApiForModelId(id), "openai-responses", id);
  }
  for (const id of ["hero12b-instruct", "grok-4.3", "kimi-k3-256k", "composer-2"]) {
    assert.equal(inferNativeApiForModelId(id), "openai-completions", id);
  }
  // gpt/codex/chatgpt remain substring clues.
  assert.equal(inferNativeApiForModelId("gpt-5.6"), "openai-responses");
  assert.equal(inferNativeApiForModelId("chatgpt-4o"), "openai-responses");
  assert.equal(inferNativeApiForModelId("codex-spark"), "openai-responses");
});
