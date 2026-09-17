# OpenClaw sub2api Provider

English | [简体中文](README.zh-CN.md)

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that discovers models from [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api)'s OpenAI-compatible HTTP API. It syncs the catalog, projects each model with an explicit `api` type, and uses OpenClaw's standard transport.

Provider ID: `sub2api-provider`. Built on the public OpenClaw plugin SDK. This plugin does not fork sub2api or OpenClaw. It does **not** assume CLIProxyAPI-private catalog fields (`client_version` manifest semantics or thinking budget tables) beyond the documented `client_version` probe.
Placeholders only in this README: endpoint `https://s2a.example.com/v1` or `http://127.0.0.1:8080/v1`; key `${SUB2API_API_KEY}`. CI runs `npm run check && npm test` on Node 22/24 (`.github/workflows/ci.yml`); integration suites (`test:host`, `test:gateway`) and `test:live` are opt-in and not part of CI.

## What it does

- Login / config for a sub2api endpoint and API key.
- Catalog discovery via `GET /v1/models` (`data[]` on the measured host).
- `openclaw sub2api {catalog,sync}` and `models list --provider sub2api-provider`.
- Inference over OpenClaw's standard openai-compatible transport (`POST /v1/chat/completions` in local A–H).
- `useBundledMetadata` defaults to **false**. Bundled CPA snapshots are not the source of truth.

## Requirements

- Node.js 22.16.0 or later (and your OpenClaw host's own engines).
- OpenClaw 2026.7.1-2 or later.
- A reachable sub2api HTTP(S) endpoint and a model-access API key. No management / admin JWT is required.

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for CPA deltas, bundled-metadata policy, and the A–H matrix. Protocol-by-model: [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Select transport by model

The host uses OpenClaw native `api`. This plugin only writes catalog fields; it does not ship its own SSE client.

| `api` | Path |
| --- | --- |
| `openai-completions` | `${baseUrl}/chat/completions` (baseUrl must end in `/v1`) |
| `openai-responses` | `${baseUrl}/responses` (baseUrl must end in `/v1`) |
| `anthropic-messages` | `${baseUrl}/v1/messages` (or `${baseUrl}/messages` when baseUrl already ends in `/v1`). **Rows on this API get their trailing `/v1` stripped by the plugin** |

Inference (case-insensitive; explicit `models[].api` wins): `claude` → messages; `gpt` / `codex` / `chatgpt`, or `o1` / `o3` / `o4` on a token boundary → responses; `gemini` clues → completions; **unknown IDs use the provider default `openai-completions` (not an official exhaustive table)**.

**Host defaults are not uniform (measured on the 2026.9.3 dist):** the dynamic-provider resolution path lands on `openai-completions`; static catalog rows are `row.api ?? "openai-responses"` and the end-of-chain fallback is also `openai-responses`. This plugin writes an explicit `api` on every catalog row, so it does not depend on either default — `PROVIDER_DEFAULT_API = "openai-completions"` only decides the plugin's own inference fallback. Locked to **OpenClaw 2026.9.3**.

Measured: DISCOVER / D1 **PASS** (default completions); P1/P2/P3a **live pending** (no clue IDs in the catalog). P5-messages **PASS** (0.1.3, live re-verified): explicit `anthropic-messages` → `/v1/messages` 200, and an A/B rerun with the old `/v1`-suffixed row URL reproduced the `/v1/v1/messages` 404 — the double prefix was the root cause. The `client_version=1` Codex manifest is live-verified: `rich=true` is truthful, with real context windows (272k–1M) and per-model reasoning levels. See [docs/PROTOCOL.md](docs/PROTOCOL.md).

Override:

```json5
{
  models: {
    providers: {
      "sub2api-provider": {
        models: [{ id: "some-odd-id", api: "openai-completions" }]
      }
    }
  }
}
```

Full text: [docs/PROTOCOL.md](docs/PROTOCOL.md).


## Install

From source (recommended while unpublished):

```bash
openclaw plugins install --link .
```

Keep the checkout in place: `--link` uses it as the plugin source.

Or pack a tarball:

```bash
npm pack
openclaw plugins install ./sagemoyi-openclaw-sub2api-provider-0.1.3.tgz
```

If you use `plugins.allow`, add `sub2api-provider` without replacing other allowed plugins. The install may prompt `--accept-capabilities`.

## Login

```bash
openclaw models auth login --provider sub2api-provider --method api-key
```

Inject `${SUB2API_API_KEY}` in the process environment, or use an OpenClaw SecretRef / auth profile. Do not commit keys.

Non-interactive path used in local tests: write `models.providers.sub2api-provider.baseUrl` and `paste-api-key` (profile `sub2api-provider:manual`). Default example base URL: `http://127.0.0.1:8080/v1`.

## Commands

```bash
openclaw sub2api catalog
openclaw sub2api sync
openclaw models list --all --provider sub2api-provider
openclaw models set sub2api-provider/MODEL_ID
```

There is **no** `openclaw cpa` alias.

## Config sketch

```json5
{
  models: {
    providers: {
      "sub2api-provider": {
        baseUrl: "http://127.0.0.1:8080/v1",
        apiKey: "${SUB2API_API_KEY}",
        useBundledMetadata: false
      }
    }
  }
}
```

Set `useBundledMetadata` only if you have a sub2api-measured snapshot. Do not treat `data/cpa-models.json` as a live catalog.

## Measured notes (2026-09-17, local A–H)

- Catalog shape: **`data[]`** (not `models[]`). Row fields: `id`, `display_name`, `created_at`, `type`. No `owned_by`.
- Wrong key: **HTTP 401**.
- Inference: `POST /v1/chat/completions` → 200.
- Empty catalog: not observed on the live host; treat as pending.
- Discovery probes `client_version=1` to request sub2api's Codex manifest (an **empty** value is treated as absent by sub2api and returns the plain list) — **live-verified 2026-09-17**. The manifest carries no `max_tokens`, so output limits still fall back conservatively. A server that ignores the parameter is detected and treated as non-rich.

Full matrix: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Limits

- No sub2api admin UI / multi-tenant billing coverage.
- Do not copy CPA ownership heuristics for `openai-responses`.
- Older OpenClaw versions may still cache the Gateway picker; a restart can be required. See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).
