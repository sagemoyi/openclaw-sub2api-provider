# OpenClaw sub2api Provider（中文说明）

> 占位：`https://s2a.example.com/v1`、`${SUB2API_API_KEY}`、登录默认 `http://127.0.0.1:8080/v1`。仓根已用脱敏终稿。

OpenClaw 外置插件：从 [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) 的 OpenAI 兼容面发现模型、同步目录、按模型显式 `api` 投影后走宿主标准传输。

**不** fork sub2api 核心；**不**假定 CLIProxyAPI（CPA）私有目录字段（如 thinking 预算表）可用；`client_version` 只按 sub2api 的实测语义使用（非空值取 Codex manifest，空值等同无参数）。

## 身份

| 项 | 值 |
| --- | --- |
| 插件 ID / provider ID | `sub2api-provider` |
| 包名（目标） | `@sagemoyi/openclaw-sub2api-provider` |
| CLI | `openclaw sub2api {sync,catalog}`（无 `cpa` 别名）；聊天命令 `/sub2api sync`（TUI/WebUI/Telegram） |
| 密钥环境变量 | `${SUB2API_API_KEY}` |
| 默认示例端点 | `http://127.0.0.1:8080/v1` |

## 安装（目标形态，改名后）

```bash
openclaw plugins install --link .
# 或 npm pack 后 install tgz
```

`plugins.allow` 若启用，加入 `sub2api-provider`，不要替换其他插件。

## 登录

```bash
openclaw models auth login --provider sub2api-provider --method api-key
```

凭据由运行环境注入（`${SUB2API_API_KEY}` 或 OpenClaw SecretRef / auth profile）。文档与示例**不写真实 key**。

## 常用命令

```bash
openclaw sub2api catalog
openclaw sub2api sync
openclaw models list --all --provider sub2api-provider
openclaw models set sub2api-provider/MODEL_ID
```

## 配置要点

- `models.providers.sub2api-provider.baseUrl`：示例用 `http://127.0.0.1:8080/v1` 或 `https://s2a.example.com/v1`
- `useBundledMetadata`：**默认 false**。不得把 `cpa-models.json` 当 sub2api 真源。
- 协议按模型/组显式 `api`；对不上记待验，不猜。

兼容性差异、bundled 去留与测项矩阵见 [COMPATIBILITY.md](./COMPATIBILITY.md)。

## 红线

- README / 示例 / 默认值 / 测试 fixture：占位符
- 不测管理后台、不测多用户计费
- 与 learning-agent P0 并行，不抢 OpenClaw 全局 PATH

## 实测摘要（2026-09-17，A–H）

- `/v1/models` 为 **`data[]`**（非 `models[]`）；行字段含 `id` / `display_name` / `created_at` / `type`；无 `owned_by`。
- 错 key：**HTTP 401**。空目录线上未观测，待补测。
- 推理：`POST /v1/chat/completions` → 200。
- `useBundledMetadata` **默认 false**。
- 兼容性全文：[COMPATIBILITY.md](./COMPATIBILITY.md)。
