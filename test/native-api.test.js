import test from "node:test";
import assert from "node:assert/strict";
import { inferNativeApiForModelId, PROVIDER_DEFAULT_API, projectModel } from "../src/catalog.js";
import { mergeExplicit, createSub2apiProvider } from "../src/provider.js";

test("P1: claude clue → anthropic-messages", () => {
  assert.equal(inferNativeApiForModelId("claude-opus-4"), "anthropic-messages");
  assert.equal(inferNativeApiForModelId("ANTHROPIC/Claude-3"), "anthropic-messages");
  assert.equal(projectModel({ id: "claude-haiku-4-5" }).api, "anthropic-messages");
});

test("P2: gpt/o-series/codex/chatgpt → openai-responses", () => {
  for (const id of ["gpt-5.6", "o1-pro", "o3-mini", "o4-mini", "codex-spark", "chatgpt-4o"]) {
    assert.equal(inferNativeApiForModelId(id), "openai-responses", id);
  }
  assert.equal(projectModel({ id: "gpt-5.3-codex", owned_by: "openai" }).api, "openai-responses");
});

test("P3: explicit api wins over inference", () => {
  assert.equal(inferNativeApiForModelId("claude-opus", { explicitApi: "openai-responses" }), "openai-responses");
  const merged = mergeExplicit(
    { id: "claude-opus", api: "anthropic-messages", compat: {}, params: {} },
    { models: { providers: { "sub2api-provider": { models: [{ id: "claude-opus", api: "openai-completions" }] } } } },
  );
  assert.equal(merged.api, "openai-completions");
});

test("P3a unit: gemini clue → openai-completions", () => {
  assert.equal(inferNativeApiForModelId("gemini-2.5-pro"), "openai-completions");
  assert.equal(projectModel({ id: "google/gemini-flash" }).api, "openai-completions");
});

test("P4: unknown id → provider default openai-completions", () => {
  assert.equal(PROVIDER_DEFAULT_API, "openai-completions");
  assert.equal(inferNativeApiForModelId("kimi-k3-256k"), "openai-completions");
  assert.equal(inferNativeApiForModelId("totally-unknown"), "openai-completions");
  assert.equal(projectModel({ id: "mystery-router-v2" }).api, "openai-completions");
  assert.equal(inferNativeApiForModelId("mystery", { providerDefault: "openai-responses" }), "openai-responses");
});

test("catalog.run publishes per-model api and provider default", async () => {
  const cfg = { models: { providers: { "sub2api-provider": { baseUrl: "https://s2a.example.com/v1", models: [] } } } };
  const cpa = createSub2apiProvider({
    config: cfg,
    resolveAuth: async () => ({ apiKey: "test-key" }),
    fetchRows: async ({ endpoint }) => endpoint.includes("?")
      ? [
          { slug: "claude-sonnet-4", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] },
          { slug: "gpt-5.6", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: ["low"] },
          { slug: "gemini-2.5", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] },
          { slug: "mystery-x", context_window: 100000, max_tokens: 4096, supported_reasoning_levels: [] },
        ]
      : [
          { id: "claude-sonnet-4" }, { id: "gpt-5.6" }, { id: "gemini-2.5" }, { id: "mystery-x" },
        ],
  });
  const published = await cpa.provider.catalog.run({ config: cfg });
  assert.equal(published.provider.api, "openai-completions");
  const byId = Object.fromEntries(published.provider.models.map((m) => [m.id, m.api]));
  assert.equal(byId["claude-sonnet-4"], "anthropic-messages");
  assert.equal(byId["gpt-5.6"], "openai-responses");
  assert.equal(byId["gemini-2.5"], "openai-completions");
  assert.equal(byId["mystery-x"], "openai-completions");
});
