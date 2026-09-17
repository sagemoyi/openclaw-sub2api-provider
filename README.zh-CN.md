# OpenClaw sub2api Provider

[English](README.md) | 简体中文

OpenClaw 外置插件：从 [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) 的 OpenAI 兼容 HTTP 面发现模型、同步目录，按模型显式 `api` 投影后走宿主标准传输。

插件 / provider ID：`sub2api-provider`。基于公共插件 SDK，不 fork sub2api 或 OpenClaw 核心。不假定 CLIProxyAPI 私有目录字段；`client_version` 只按 sub2api 实测语义使用（非空值取 Codex manifest）。

本文占位：端点 `https://s2a.example.com/v1` 或 `http://127.0.0.1:8080/v1`；密钥 `${SUB2API_API_KEY}`。CI 在 Node 22/24 上跑 `npm run check && npm test`（`.github/workflows/ci.yml`）；集成套件（`test:host`、`test:gateway`）与 `test:live` 为可选，不进 CI。

## 功能

- 配置 sub2api 端点与 API key。
- 经 `GET /v1/models` 发现目录（实测为 `data[]`）。
- `openclaw sub2api {catalog,sync}` 与 `models list --provider sub2api-provider`。
- 推理走 OpenClaw 标准 openai-compatible 传输（本地 A–H 为 `POST /v1/chat/completions`）。
- `useBundledMetadata` **默认 false**；随包 CPA 快照不是真源。

## 要求

- Node.js 22.16.0 或更高（并满足所用 OpenClaw 宿主 engines）。
- OpenClaw 2026.7.1-2 或更高。
- 可访问的 sub2api HTTP(S) 端点与模型访问 key。不需要管理后台 / admin JWT。

差异、bundled 去留与测项见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。按模型选协议见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

## 按模型选择协议

宿主走 OpenClaw 原生 `api`，插件只写目录字段，不自写传输。

| `api` | 路径 |
| --- | --- |
| `openai-completions` | `${baseUrl}/chat/completions`（baseUrl 需以 `/v1` 结尾） |
| `openai-responses` | `${baseUrl}/responses`（baseUrl 需以 `/v1` 结尾） |
| `anthropic-messages` | `${baseUrl}/v1/messages`（baseUrl 已以 `/v1` 结尾时为 `${baseUrl}/messages`）。**这类行由插件剥离尾部 `/v1`** |

推断（大小写不敏感；显式 `models[].api` 优先）：`claude` → messages；`gpt` / `codex` / `chatgpt`，或按 token 边界出现 `o1` / `o3` / `o4` → responses；`gemini` 线索 → completions；**未知 ID 走默认 `openai-completions`（不是官方穷尽表）**。

**宿主默认并非单一**（2026.9.3 dist 实测）：动态 provider 默认解析路径落到 `openai-completions`；静态目录行是 `row.api ?? "openai-responses"`，请求链末端 fallback 也是 `openai-responses`。本插件**给每条目录模型显式写 `api`**，不依赖宿主任何一种默认——`PROVIDER_DEFAULT_API = "openai-completions"` 只决定插件自己的推断兜底。钉 **OpenClaw 2026.9.3**。

实测摘要：DISCOVER / D1 **PASS**（默认 completions）；P1/P2/P3a **live 待验**（目录无对应线索 ID）。P5-messages **PASS**（0.1.3 live 复测）：显式 `anthropic-messages` → `/v1/messages` 200；A/B 复现旧行为 `…/v1/v1/messages` → 404，根因确认为双 `/v1` 前缀。`client_version=1` Codex manifest 已 live 验证：`rich=true` 为真，真实 context window（272k–1M）与逐模型 reasoning 档位生效。详见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

覆盖示例：

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

全文：[docs/PROTOCOL.md](docs/PROTOCOL.md)。


## 安装

源码链接（未发布 npm 时推荐）：

```bash
openclaw plugins install --link .
```

`--link` 会把当前目录当作插件源，请保持 checkout 不动。

或打包：

```bash
npm pack
openclaw plugins install ./sagemoyi-openclaw-sub2api-provider-0.1.3.tgz
```

若启用 `plugins.allow`，加入 `sub2api-provider`，不要替换其他已允许插件。安装可能需要 `--accept-capabilities`。

## 登录

```bash
openclaw models auth login --provider sub2api-provider --method api-key
```

在进程环境注入 `${SUB2API_API_KEY}`，或使用 OpenClaw SecretRef / auth profile。不要把密钥写入仓库。

本地非交互路径：写入 `models.providers.sub2api-provider.baseUrl` 并 `paste-api-key`（profile `sub2api-provider:manual`）。默认示例：`http://127.0.0.1:8080/v1`。

## 常用命令

```bash
openclaw sub2api catalog
openclaw sub2api sync
openclaw models list --all --provider sub2api-provider
openclaw models set sub2api-provider/MODEL_ID
```

**没有** `openclaw cpa` 别名。

## 配置示意

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

只有在按 sub2api 实测重写过快照时才打开 `useBundledMetadata`。不要把 `data/cpa-models.json` 当在线目录。

## 实测摘要（2026-09-17，本地 A–H）

- 目录形态：**`data[]`**（非 `models[]`）。行字段：`id` / `display_name` / `created_at` / `type`；无 `owned_by`。
- 错 key：**HTTP 401**。
- 推理：`POST /v1/chat/completions` → 200。
- 空目录：线上未观测，待补测。
- 探测改发非空 `client_version=1` 以取 sub2api 的 Codex manifest（**空值**在 sub2api 等同无此参数，返回普通列表）——**live 已验（2026-09-17）**。manifest 无 `max_tokens` 字段，输出上限仍保守回退。忽略该参数的服务器会被识别为非 rich。

全文：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

## 限制

- 不覆盖 sub2api 管理后台 / 多用户计费。
- 不要沿用 CPA 的 `owned_by` → responses 启发式。
- 较旧 OpenClaw 的 Gateway picker 可能仍缓存，需要重启。见兼容性文档。
