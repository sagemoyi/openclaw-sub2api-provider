# OpenClaw sub2api Provider

English | [简体中文](README.zh-CN.md)

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that discovers models from [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api)'s OpenAI-compatible HTTP API. It syncs the catalog, projects each model with an explicit per-model `api` protocol, and uses OpenClaw's standard transport.

Provider ID: `sub2api-provider`. Built on the public OpenClaw plugin SDK; no sub2api or OpenClaw core changes required. Does not assume CLIProxyAPI-private catalog fields; `client_version` is used only with sub2api's measured semantics (a non-empty value selects the Codex manifest).

Placeholders only in this README: endpoint `https://s2a.example.com/v1` or `http://127.0.0.1:8080/v1`; key `${SUB2API_API_KEY}`. CI runs `npm run check && npm test` on Node 22/24 (`.github/workflows/ci.yml`); integration suites (`test:host`, `test:gateway`) and `test:live` are opt-in and not part of CI.

## What it does

- Interactive setup for the sub2api endpoint and API key.
- Model discovery via `GET /v1/models`, with real capabilities from sub2api's Codex manifest (`client_version=1`): context windows, input modalities, per-model reasoning levels.
- Per-model OpenClaw native protocol selection (`openai-completions` / `openai-responses` / `anthropic-messages`) with explicit overrides.
- Periodic catalog synchronization and manual refresh commands.
- Model-specific OpenClaw thinking profiles and request payload adaptation.
- Integration with OpenClaw authentication, inference transport, and catalog persistence. The plugin does not ship its own SSE/HTTP client.

## Requirements

- Node.js 22.16.0 or later, also satisfying your OpenClaw version's runtime requirements.
- OpenClaw 2026.7.1-2 or later; protocol behavior is pinned to the measured **2026.9.3** host. See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the host version matrix and CPA deltas.
- A reachable sub2api HTTP(S) endpoint and a model-access API key. No management / admin JWT is required.

Some older OpenClaw versions cache the Gateway model picker separately; a restart may be required. See [Troubleshooting](#troubleshooting).

## Install

Install the published plugin from ClawHub:

```bash
openclaw plugins install clawhub:@sagemoyi/openclaw-sub2api-provider
```

Use an OpenClaw version that supports the `clawhub:` plugin source. Then follow the interactive setup below and restart the Gateway to load the plugin.

From source:

```bash
git clone https://github.com/sagemoyi/openclaw-sub2api-provider.git
cd openclaw-sub2api-provider
openclaw plugins install --link .
```

Keep the checkout in place: `--link` uses it as the plugin source.

Alternatively, create an installable package:

```bash
npm pack
openclaw plugins install ./sagemoyi-openclaw-sub2api-provider-0.1.5.tgz
```

If you use `plugins.allow`, add `sub2api-provider` to the existing list without replacing other allowed plugins. The install may prompt `--accept-capabilities`.

## Update

For a ClawHub installation, preview the update using the plugin ID `sub2api-provider`:

```bash
openclaw plugins update sub2api-provider --dry-run
```

After reviewing the preview, apply the update and restart the Gateway to load it:

```bash
openclaw plugins update sub2api-provider
openclaw gateway restart
```

`plugins update` takes the installed plugin ID. Installation uses the package name `@sagemoyi/openclaw-sub2api-provider`, and the display name is **OpenClaw sub2api Provider**; updates still use `sub2api-provider`. If the plugin cannot be found, run `openclaw plugins list` and check that the command uses the configuration and state directory where it was installed.

For a source installation with `--link`, update that checkout and restart the Gateway. For a local `.tgz` installation, install the new package file.

## Interactive setup (recommended)

```bash
openclaw models auth login --provider sub2api-provider --method api-key
```

If multiple agents are configured, OpenClaw may report `Multiple agents are configured, but the model command has no explicit owner. Pass --agent <id>.` First list the agent IDs:

```bash
openclaw agents list
```

Then select the agent that owns this authentication, replacing `AGENT_ID` with an actual ID from the list:

```bash
openclaw models auth login --agent AGENT_ID --provider sub2api-provider --method api-key
```

Enter:

1. Your sub2api endpoint (the prompt defaults to `http://127.0.0.1:8080/v1`).
2. Your sub2api API key. Inject `${SUB2API_API_KEY}` in the process environment, or use an OpenClaw SecretRef / auth profile. Do not commit keys.

Setup validates the connection by querying the model catalog. Network failures, authentication errors, and invalid responses fail setup; a wrong key returns HTTP 401.

On success, credentials are stored in a standard OpenClaw auth profile, the endpoint is added to provider configuration, and `sub2api-provider/*` is added to the selectable model scope. The discovered model list is not written into the main configuration, and your default model is not changed automatically.

Refresh and list models:

```bash
openclaw sub2api sync
openclaw models list --all --provider sub2api-provider
```

Replace `MODEL_ID` with an actual ID from the catalog:

```bash
openclaw models set sub2api-provider/MODEL_ID
openclaw gateway restart
```

Run the login command again to update connection details. If you also use explicit API keys or environment variables, review those settings as well: credential selection follows OpenClaw's authentication rules.

## Non-interactive configuration

Merge this into your OpenClaw configuration, preserving existing providers, plugins, and agent settings:

```json5
{
  models: {
    providers: {
      "sub2api-provider": {
        baseUrl: "http://127.0.0.1:8080/v1",
        apiKey: "${SUB2API_API_KEY}",
        models: []
      }
    }
  },
  agents: {
    defaults: {
      models: {
        "sub2api-provider/*": {}
      }
    }
  },
  plugins: {
    entries: {
      "sub2api-provider": {
        enabled: true
      }
    }
  }
}
```

`SUB2API_API_KEY` must be available to the process running OpenClaw. Variables in an interactive shell may not reach systemd, a container, or another service manager.

Keep `models: []` for automatic discovery. Add explicit model configuration only when you need capability or protocol overrides. Local test path: write `models.providers.sub2api-provider.baseUrl` and `paste-api-key` (profile `sub2api-provider:manual`).

### Endpoint normalization

Endpoints must include `http://` or `https://`. Use HTTPS for remote connections.

| Input | Normalized API base URL |
| --- | --- |
| `https://s2a.example.com` | `https://s2a.example.com/v1` |
| `https://s2a.example.com/v1/` | `https://s2a.example.com/v1` |
| `https://proxy.example.com/s2a` | `https://proxy.example.com/s2a/v1` |

Reverse-proxy path prefixes are supported. Embedded usernames, passwords, query parameters, and fragments are rejected. Use the OpenAI-compatible API base, not a `/backend-api` address.

Note: catalog rows whose protocol is `anthropic-messages` carry their own per-model `baseUrl` with the trailing `/v1` removed, because some host request paths append `/v1/messages` to `model.baseUrl` directly. The provider-level `baseUrl` keeps `/v1`. See [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Commands

| Command | Purpose |
| --- | --- |
| `openclaw sub2api catalog` | Query model capabilities, metadata sources, and diagnostics without printing credentials or the endpoint URL |
| `openclaw sub2api sync` | Request a refresh and publish the catalog; return synchronization status without editing the main configuration |
| `/sub2api sync` | Chat command (TUI, WebUI, Telegram, and other channels): force a catalog refresh and reply with the synchronization status |
| `openclaw models list --all --provider sub2api-provider` | List sub2api models in the OpenClaw catalog |

There is **no** `openclaw cpa` alias. Inspect command output and Gateway logs if discovery or synchronization fails. Transient failures can return a historical snapshot marked `stale`; synchronization does not publish it as a fresh catalog.

## Refresh and cache

The Gateway service discovers models at startup and, by default, waits 24 hours after each synchronization before checking again. Request-time discovery also reads or refreshes the catalog cache.

| Setting | Default | Range | Description |
| --- | --- | --- | --- |
| `refreshSeconds` | `86400` | 10–86400 | Cache TTL and background refresh interval, in seconds (default: 24 hours) |
| `staleSeconds` | `300` | 0–86400 | Additional time after TTL during which a successful snapshot may be used temporarily |
| `timeoutMs` | `10000` | 100–60000 | Timeout for each catalog request, in milliseconds |
| `useBundledMetadata` | `false` | Boolean | Supplement or correct known capabilities using bundled CLIProxyAPI-derived metadata |

Configure these under the plugin entry:

```json5
{
  plugins: {
    entries: {
      "sub2api-provider": {
        enabled: true,
        config: {
          refreshSeconds: 86400,
          staleSeconds: 300,
          timeoutMs: 10000,
          useBundledMetadata: false
        }
      }
    }
  }
}
```

The in-memory discovery cache is isolated by endpoint and credential. OpenClaw owns generated catalog persistence. Synchronization is serialized, and changes to the catalog, endpoint, or configuration trigger publication.

Set `useBundledMetadata` only if you have a sub2api-measured snapshot. `data/cpa-models.json` is a CLIProxyAPI-derived snapshot and is **not** a live sub2api source of truth.

### Failure behavior

- **No endpoint or credentials:** no discovery requests or model registration.
- **Network, server, or response-format errors:** an earlier successful snapshot may be used within the bounded stale window; errors are returned after that window expires.
- **401/403:** the corresponding cache is invalidated immediately, with no stale fallback.
- **Successful empty catalog:** models are removed from the discovered catalog rather than restored from an old snapshot.
- **Removed model:** request-time checks reject it after discovery observes the change. A still-valid cache can temporarily retain the earlier inventory.
- **Incomplete publication or unexpected deleted models remaining:** synchronization reports failure and retries later. Explicit user model entries are not treated as unexpected leftovers.

Account health or quota changes may temporarily hide models in sub2api; these are treated as availability changes. The plugin does not manage sub2api accounts, restart the Gateway, or retry failed inference requests.

## Model capabilities and protocol

The plain catalog (`data[]` rows) defines availability. Capabilities come from sub2api's Codex manifest (`GET /v1/models?client_version=1`, live-verified); bundled metadata only supplements those models and never makes an unavailable model selectable.

| Capability | Mapping |
| --- | --- |
| Context window | `context_window`, then exact-ID bundled metadata, then 32768 |
| Output limit | The manifest carries no `max_tokens`: bundled metadata, then a conservative 4096; capped at the context window |
| Input modalities | `input_modalities`, filtered to text/image |
| Reasoning | String or `{ effort }` entries from `supported_reasoning_levels` mapped to OpenClaw thinking profiles |
| Hidden models | Skip `visibility: hide` and (with bundled metadata enabled) known image/video generation models |
| Cost | Zero is an unknown placeholder, not free usage; use standard cost overrides if needed |

`max_context_window` is retained for diagnostics, not automatically enabled. Unknown aliases are not resolved by guessing model names. Incomplete metadata produces conservative defaults and warnings; inspect them with `openclaw sub2api catalog`.

### Per-model protocol selection

The host uses OpenClaw native `api`; this plugin only writes catalog fields and does not ship its own transport.

| `api` | Path |
| --- | --- |
| `openai-completions` | `${baseUrl}/chat/completions` (baseUrl ends in `/v1`) |
| `openai-responses` | `${baseUrl}/responses` (baseUrl ends in `/v1`) |
| `anthropic-messages` | `${baseUrl}/v1/messages`; rows on this API carry a per-model baseUrl with the trailing `/v1` stripped |

Inference (case-insensitive; explicit `models[].api` wins): `claude` → messages; `gpt` / `codex` / `chatgpt`, or `o1` / `o3` / `o4` on a token boundary → responses; `gemini` clues → completions; **unknown IDs use the provider default `openai-completions` (not an official exhaustive table)**.

Host defaults are not uniform (measured on the 2026.9.3 dist): the dynamic-provider resolution path lands on `openai-completions`; static catalog rows are `row.api ?? "openai-responses"` and the end-of-chain fallback is also `openai-responses`. This plugin writes an explicit `api` on every catalog row, so it does not depend on either default — `PROVIDER_DEFAULT_API = "openai-completions"` only decides the plugin's own inference fallback. Locked to **OpenClaw 2026.9.3**.

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

Measured: DISCOVER / D1 **PASS** (default completions); P1/P2/P3a **live pending** (no clue IDs in the measured catalog). P5-messages **PASS** (0.1.3, live re-verified): explicit `anthropic-messages` → `/v1/messages` 200, and an A/B rerun with the old `/v1`-suffixed row URL reproduced the `/v1/v1/messages` 404 — the double prefix was the root cause. See [docs/PROTOCOL.md](docs/PROTOCOL.md).

### Reasoning levels

Supported reasoning levels are model-specific. `none` maps to OpenClaw `off`; `auto` maps to `adaptive`. Models that cannot disable thinking do not advertise `off`. If an existing session's level becomes unsupported, request adaptation selects a supported lower level or the model default.

`ultra` is not offered as a normal thinking option: some OpenClaw versions give it separate orchestration semantics, and a server may advertise levels its request validator rejects. For exact passthrough after verifying endpoint support:

```json5
{
  agents: {
    defaults: {
      models: {
        "sub2api-provider/MODEL_ID": {
          params: {
            sub2apiReasoningEffort: "max"
          }
        }
      }
    }
  }
}
```

The explicit effort must appear in the model's capability declaration, but that declaration does not guarantee upstream acceptance. The plugin does not probe support by sending trial inference requests.

## Migration from static providers

1. Keep the old configuration while installing and configuring this plugin.
2. Check models and capabilities with `openclaw sub2api catalog` and `models list`.
3. Change the desired default or agent model references to `sub2api-provider/MODEL_ID`.
4. Remove obsolete configuration only after verifying requests.

The plugin does not delete existing providers or rewrite sessions. Context and compaction budgets in an active session are not guaranteed to be recalculated within the current turn.

## Troubleshooting

### Models discovered but missing from the picker

OpenClaw versions with `agents.defaults.modelPolicy.allow` use that explicit policy ahead of the legacy `agents.defaults.models` entries. Login adds `sub2api-provider/*` to an existing default policy while preserving its entries. If the agent has its own `modelPolicy.allow`, that policy takes precedence and must allow sub2api-provider models as well. Repeated Gateway restarts do not change model visibility policy.

### Sync reports success but does not exit

OpenClaw `2026.8.1` / `2026.8.2` can retain a host worker after prepared catalog publication completes. For one-shot sync commands that exit normally, use the verified `2026.9.3` host. If either August host must be retained, see the separate [host patches and rollback instructions](https://github.com/sagemoyi/openclaw-sub2api-provider/tree/main/patches/openclaw); plugin updates do not apply these patches automatically.

### Provider or login method is missing

Check `openclaw plugins list` and ensure `plugins.allow` includes `sub2api-provider`. After installation or updates, the running Gateway must load the new plugin code.

If login fails before prompting because the CLI and installed Gateway use different state directories or config paths, the host has refused a write to a divergent store. Check that the command targets the intended Gateway configuration; use a dedicated configuration for isolated tests. This error does not establish that the sub2api key is invalid.

### Discovery succeeds, but the picker shows old models

Run `openclaw sub2api sync` and inspect the result. OpenClaw versions with the legacy picker cache may require:

```bash
openclaw gateway restart
```

The presence of a refresh API does not guarantee restart-free updates for every host version, agent, and existing session.

### Authentication or connection fails

Verify the URL scheme, reverse-proxy routing, credential source, and Gateway service environment. A wrong key returns HTTP 401. Never put keys in URLs, issue reports, or public logs.

### Reasoning or context limits look wrong

Inspect sources and warnings in `openclaw sub2api catalog`. The sub2api manifest carries no `max_tokens`, so output limits fall back to a conservative 4096 unless bundled metadata or an explicit override applies. Bundled metadata is CLIProxyAPI-derived and disabled by default; compare behavior with `useBundledMetadata` toggled, or use standard model overrides.

### An anthropic-messages model returns 404

Update to 0.1.3 or later: rows on `anthropic-messages` now carry a per-model `baseUrl` without the trailing `/v1`, which earlier requests could double (`/v1/v1/messages`). If you pinned a per-model `baseUrl` yourself, remove the `/v1` suffix for anthropic-protocol rows. See [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Measured notes (2026-09-17)

- Catalog shape: **`data[]`** (not `models[]`). Row fields: `id`, `display_name`, `created_at`, `type`. No `owned_by`. Newer upstream rows may add `owned_by`/`created`; the parser indexes on `id` only and stays compatible.
- Wrong key: **HTTP 401**.
- Inference: `POST /v1/chat/completions` → 200; `/v1/responses` and `/v1/messages` verified via explicit per-model `api`.
- Empty catalog: not observed on the live host; the code parses an empty array and treats it as authoritative.
- Discovery probes `client_version=1` to request sub2api's Codex manifest (an **empty** value is treated as absent by sub2api and returns the plain list) — **live-verified**. The manifest carries no `max_tokens`, so output limits still fall back conservatively. A server that ignores the parameter is detected and treated as non-rich.

Full matrix: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Limits

- No sub2api admin UI / multi-tenant billing coverage.
- Do not copy CPA ownership heuristics for `openai-responses`; this plugin infers per-model `api` from ID clues instead.
- Gemini-clue models map to completions with confidence only for OpenAI/Grok platform groups; a Gemini-platform group may serve only `/v1beta/models/{model}:generateContent` — override `models[].api` explicitly if a 404 appears.
- Older OpenClaw versions may still cache the Gateway picker; a restart can be required. See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Development

See [Testing and development](docs/DEVELOPMENT.md) and [Architecture and compatibility](docs/ARCHITECTURE.md).

## Related projects and license

Discovery and refresh design draws on the official [pi-sub2api-provider-provider](https://github.com/router-for-me/pi-sub2api-provider-provider). This is an independent OpenClaw integration, not a fork of that plugin, and does not provide its TUI, Fast, pause, or compaction features. Ported from the same author's [openclaw-cliproxyapi-provider](https://github.com/sagemoyi/openclaw-cliproxyapi-provider).

Licensed under the [MIT License](LICENSE). See [Third-party notices](THIRD_PARTY_NOTICES.md) for bundled metadata attribution and licensing.

## Links

[Linux.do](https://linux.do/)

[nodeseek](https://www.nodeseek.com/)
