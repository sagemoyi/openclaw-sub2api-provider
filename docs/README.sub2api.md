# OpenClaw sub2api Provider (README)

> Placeholders only: `https://s2a.example.com/v1`, `${SUB2API_API_KEY}`, default login `http://127.0.0.1:8080/v1`. Repo-root README is the desensitized final.

OpenClaw plugin that discovers models from [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api)'s OpenAI-compatible surface. No sub2api core fork. Does not assume CLIProxyAPI-private catalog fields beyond the documented `client_version=1` manifest probe.

| Item | Value |
| --- | --- |
| Plugin / provider ID | `sub2api-provider` |
| Target package | `@sagemoyi/openclaw-sub2api-provider` |
| CLI | `openclaw sub2api {sync,catalog}` (no `cpa` alias); chat command `/sub2api sync` (TUI/WebUI/Telegram) |
| Env | `${SUB2API_API_KEY}` |

See [COMPATIBILITY.md](./COMPATIBILITY.md) for CPA deltas, bundled-metadata policy (`useBundledMetadata` default **false**), and the A–H matrix.
