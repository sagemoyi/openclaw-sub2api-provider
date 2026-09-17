# OpenClaw sub2api Provider

[English](README.md) | 简体中文

OpenClaw 外置插件：从 [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) 的 OpenAI 兼容 HTTP 面发现模型、同步目录，按模型显式 `api` 投影后走宿主标准传输。

插件 / provider ID：`sub2api-provider`。基于公共插件 SDK，不 fork sub2api 或 OpenClaw 核心。不假定 CLIProxyAPI 私有字段（`client_version` 富目录、thinking 预算表）。

本文占位：端点 `https://s2a.example.com/v1` 或 `http://127.0.0.1:8080/v1`；密钥 `${SUB2API_API_KEY}`。

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
| `openai-completions` | `/v1/chat/completions` |
| `openai-responses` | `/v1/responses` |
| `anthropic-messages` | `/v1/messages` |

推断（大小写不敏感；显式 `models[].api` 优先）：`claude` → messages；`gpt` / `o1` / `o3` / `o4` / `codex` / `chatgpt` → responses；`gemini` 线索 → completions；**未知 ID 走默认 `openai-completions`（不是官方穷尽表）**。

**默认对齐**：本插件 provider 默认是 `openai-completions`，与 OpenClaw 无 `api` 时一致（原分叉已关闭）。按模型推断仍会把 claude / gpt-family 等写成对应协议。钉 **OpenClaw 2026.9.3**。

实测摘要（改默认前）：P1/P2/P3a **live 待验**；P5-messages 受宿主 `/v1` 双前缀影响。改默认后 D1/P4 → completions 已复测（见工作区矩阵）。详见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

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
openclaw plugins install ./sagemoyi-openclaw-sub2api-provider-0.1.2.tgz
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
- catalog 可能仍报 `rich=true`（兼容探测）；应优先普通 `/v1/models`，勿沿用 CPA `client_version`。

全文：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

## 限制

- 不覆盖 sub2api 管理后台 / 多用户计费。
- 不要沿用 CPA 的 `owned_by` → responses 启发式。
- 较旧 OpenClaw 的 Gateway picker 可能仍缓存，需要重启。见兼容性文档。
