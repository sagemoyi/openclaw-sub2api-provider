# OpenClaw sub2api Provider

[English](README.md) | 简体中文

OpenClaw 外置插件：从 [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) 的 OpenAI 兼容 HTTP API 发现模型。同步目录，为每个模型写入显式的按模型 `api` 协议，并使用 OpenClaw 标准传输。

插件 / provider ID：`sub2api-provider`。基于公共插件 SDK，不 fork sub2api 或 OpenClaw 核心。不假定 CLIProxyAPI 私有目录字段；`client_version` 只按 sub2api 实测语义使用（非空值取 Codex manifest）。

本文占位：端点 `https://s2a.example.com/v1` 或 `http://127.0.0.1:8080/v1`；密钥 `${SUB2API_API_KEY}`。CI 在 Node 22/24 上跑 `npm run check && npm test`（`.github/workflows/ci.yml`）；集成套件（`test:host`、`test:gateway`）与 `test:live` 为可选，不进 CI。

## 功能

- sub2api 端点与 API key 的交互式配置。
- 经 `GET /v1/models` 发现模型，并从 sub2api 的 Codex manifest（`client_version=1`）取得真实能力：上下文窗口、输入模态、逐模型 reasoning 档位。
- 按模型选择 OpenClaw 原生协议（`openai-completions` / `openai-responses` / `anthropic-messages`），支持显式覆盖。
- 周期目录同步与手动刷新命令。
- 按模型的 OpenClaw thinking profile 与请求负载适配。
- 接入 OpenClaw 认证、推理传输与目录持久化。插件不自写 SSE/HTTP 客户端。

## 要求

- Node.js 22.16.0 或更高，同时满足你的 OpenClaw 版本自身的运行时要求。
- OpenClaw 2026.7.1-2 或更高；协议行为以实测的 **2026.9.3** 宿主为准。宿主版本矩阵与相对 CPA 的差异见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。
- 可达的 sub2api HTTP(S) 端点与具备模型访问权限的 API key。不需要管理 / admin JWT。

部分旧版 OpenClaw 会单独缓存 Gateway 模型选择器，可能需要重启。见[故障排查](#故障排查)。

## 安装

从 ClawHub 安装已发布的插件：

```bash
openclaw plugins install clawhub:@sagemoyi/openclaw-sub2api-provider
```

需要支持 `clawhub:` 插件源的 OpenClaw 版本。随后按下方交互式设置进行，并重启 Gateway 以加载插件。

从源码安装：

```bash
git clone https://github.com/sagemoyi/openclaw-sub2api-provider.git
cd openclaw-sub2api-provider
openclaw plugins install --link .
```

保持该 checkout 不移动：`--link` 会把它当作插件来源。

也可以打包安装：

```bash
npm pack
openclaw plugins install ./sagemoyi-openclaw-sub2api-provider-0.1.3.tgz
```

若启用 `plugins.allow`，把 `sub2api-provider` 追加进现有列表，不要替换其他已允许插件。安装可能提示 `--accept-capabilities`。

## 更新

ClawHub 安装使用插件 ID `sub2api-provider` 预览更新：

```bash
openclaw plugins update sub2api-provider --dry-run
```

确认预览后应用更新并重启 Gateway 以加载：

```bash
openclaw plugins update sub2api-provider
openclaw gateway restart
```

`plugins update` 使用已安装的插件 ID。安装时用包名 `@sagemoyi/openclaw-sub2api-provider`，显示名是 **OpenClaw sub2api Provider**；更新仍用 `sub2api-provider`。若提示找不到插件，先 `openclaw plugins list`，并确认命令使用的是当初安装它的配置与状态目录。

`--link` 源码安装：更新该 checkout 并重启 Gateway。本地 `.tgz` 安装：安装新的包文件。

## 交互式设置（推荐）

```bash
openclaw models auth login --provider sub2api-provider --method api-key
```

若配置了多个 agent，OpenClaw 可能报 `Multiple agents are configured, but the model command has no explicit owner. Pass --agent <id>.`。先列出 agent ID：

```bash
openclaw agents list
```

再指定拥有此认证的 agent（把 `AGENT_ID` 换成列表中的真实 ID）：

```bash
openclaw models auth login --agent AGENT_ID --provider sub2api-provider --method api-key
```

输入：

1. sub2api 端点（提示默认 `http://127.0.0.1:8080/v1`）。
2. sub2api API key。通过进程环境注入 `${SUB2API_API_KEY}`，或使用 OpenClaw SecretRef / auth profile。不要提交密钥。

设置会查询模型目录来验证连接。网络失败、认证错误和非法响应会导致设置失败；错误密钥返回 HTTP 401。

成功后：凭据存入标准 OpenClaw auth profile，端点写入 provider 配置，`sub2api-provider/*` 加入可选模型范围。发现的模型列表不会写入主配置，也不会自动更改你的默认模型。

刷新并列出模型：

```bash
openclaw sub2api sync
openclaw models list --all --provider sub2api-provider
```

把 `MODEL_ID` 换成目录中的真实 ID：

```bash
openclaw models set sub2api-provider/MODEL_ID
openclaw gateway restart
```

再次运行登录命令即可更新连接信息。若同时使用显式 API key 或环境变量，请一并检查：凭据选择遵循 OpenClaw 的认证规则。

## 非交互配置

把以下内容合并进 OpenClaw 配置，保留已有 providers、plugins 与 agent 设置：

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

`SUB2API_API_KEY` 必须对运行 OpenClaw 的进程可见。交互 shell 里的变量未必能传到 systemd、容器或其他服务管理器。

保持 `models: []` 即为自动发现。仅在需要能力或协议覆盖时添加显式模型配置。本地测试路径：写 `models.providers.sub2api-provider.baseUrl` 与 `paste-api-key`（profile `sub2api-provider:manual`）。

### 端点规范化

端点必须带 `http://` 或 `https://`。远程连接请用 HTTPS。

| 输入 | 规范化后的 API 基址 |
| --- | --- |
| `https://s2a.example.com` | `https://s2a.example.com/v1` |
| `https://s2a.example.com/v1/` | `https://s2a.example.com/v1` |
| `https://proxy.example.com/s2a` | `https://proxy.example.com/s2a/v1` |

支持反代路径前缀。内嵌用户名、密码、查询参数和 fragment 会被拒绝。使用 OpenAI 兼容 API 基址，不是 `/backend-api` 地址。

注意：协议为 `anthropic-messages` 的目录行自带去掉了尾部 `/v1` 的 per-model `baseUrl`，因为宿主部分请求路径会在 `model.baseUrl` 后直接拼接 `/v1/messages`。provider 级 `baseUrl` 保留 `/v1`。见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

## 命令

| 命令 | 用途 |
| --- | --- |
| `openclaw sub2api catalog` | 查询模型能力、元数据来源与诊断，不打印凭据和端点 URL |
| `openclaw sub2api sync` | 请求刷新并发布目录；返回同步状态，不修改主配置 |
| `openclaw models list --all --provider sub2api-provider` | 列出 OpenClaw 目录中的 sub2api 模型 |

**没有** `openclaw cpa` 别名。发现或同步失败时检查命令输出与 Gateway 日志。瞬时故障可能返回标记为 `stale` 的历史快照；同步不会把它当作新目录发布。

## 刷新与缓存

Gateway 服务启动时发现模型，默认在每次同步后等待 60 秒再检查。请求时的发现也会读取或刷新目录缓存。

| 设置 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- |
| `refreshSeconds` | `60` | 10–86400 | 缓存 TTL 与后台刷新间隔（秒） |
| `staleSeconds` | `300` | 0–86400 | TTL 之后允许临时使用成功快照的额外时长 |
| `timeoutMs` | `10000` | 100–60000 | 每次目录请求的超时（毫秒） |
| `useBundledMetadata` | `false` | 布尔 | 用随包的 CLIProxyAPI 衍生元数据补充或修正已知能力 |

在插件条目下配置：

```json5
{
  plugins: {
    entries: {
      "sub2api-provider": {
        enabled: true,
        config: {
          refreshSeconds: 60,
          staleSeconds: 300,
          timeoutMs: 10000,
          useBundledMetadata: false
        }
      }
    }
  }
}
```

内存发现缓存按端点 + 凭据隔离。生成的目录持久化由 OpenClaw 负责。同步串行执行，目录、端点或配置变化都会触发发布。

仅在你有 sub2api 实测快照时才开启 `useBundledMetadata`。`data/cpa-models.json` 是 CLIProxyAPI 衍生快照，**不是** sub2api 的在线真源。

### 失败行为

- **无端点或凭据：** 不发起发现请求，不注册模型。
- **网络、服务端或响应格式错误：** 在有界 stale 窗口内可临时使用上次成功快照；窗口过后返回错误。
- **401/403：** 对应缓存立即作废，无 stale 兜底。
- **成功的空目录：** 模型从发现目录中移除，而不是从旧快照恢复。
- **模型被移除：** 发现观测到变化后，请求时检查会拒绝它。仍有效的缓存可能暂时保留旧清单。
- **发布不完整或被删模型意外残留：** 同步报告失败并稍后重试。用户显式配置的模型不会被当作意外残留。

账号健康或额度变化可能让模型在 sub2api 中暂时隐藏；这被视为可用性变化。插件不管理 sub2api 账号、不重启 Gateway、不重试失败的推理请求。

## 模型能力与协议

普通目录（`data[]` 行）定义可用性。能力来自 sub2api 的 Codex manifest（`GET /v1/models?client_version=1`，已 live 验证）；bundled 元数据只补充这些模型，绝不会让不可用的模型变成可选。

| 能力 | 映射 |
| --- | --- |
| 上下文窗口 | `context_window`，再精确 ID 的 bundled 元数据，再 32768 |
| 输出上限 | manifest 无 `max_tokens` 字段：bundled 元数据，再保守回退 4096；不超过上下文窗口 |
| 输入模态 | `input_modalities`，过滤为 text/image |
| Reasoning | `supported_reasoning_levels` 的字符串或 `{ effort }` 条目映射到 OpenClaw thinking profile |
| 隐藏模型 | 跳过 `visibility: hide` 与（bundled 开启时）已知图像/视频生成模型 |
| 成本 | 零是未知占位，不是免费用；需要时用标准成本覆盖 |

`max_context_window` 仅保留作诊断，不自动启用。未知 alias 不靠猜模型名解析。元数据不全时产生保守默认值和警告；用 `openclaw sub2api catalog` 查看。

### 按模型选择协议

宿主使用 OpenClaw 原生 `api`；本插件只写目录字段，不自带传输。

| `api` | 路径 |
| --- | --- |
| `openai-completions` | `${baseUrl}/chat/completions`（baseUrl 以 `/v1` 结尾） |
| `openai-responses` | `${baseUrl}/responses`（baseUrl 以 `/v1` 结尾） |
| `anthropic-messages` | `${baseUrl}/v1/messages`；这类行的 per-model baseUrl 尾部 `/v1` 已剥离 |

推断（大小写不敏感；显式 `models[].api` 优先）：`claude` → messages；`gpt` / `codex` / `chatgpt`，或按 token 边界出现 `o1` / `o3` / `o4` → responses；`gemini` 线索 → completions；**未知 ID 走默认 `openai-completions`（不是官方穷尽表）**。

宿主默认并非单一（2026.9.3 dist 实测）：动态 provider 默认解析路径落到 `openai-completions`；静态目录行是 `row.api ?? "openai-responses"`，请求链末端 fallback 也是 `openai-responses`。本插件**给每条目录模型显式写 `api`**，不依赖宿主任何一种默认——`PROVIDER_DEFAULT_API = "openai-completions"` 只决定插件自己的推断兜底。钉 **OpenClaw 2026.9.3**。

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

实测摘要：DISCOVER / D1 **PASS**（默认 completions）；P1/P2/P3a **live 待验**（实测目录无对应线索 ID）。P5-messages **PASS**（0.1.3 live 复测）：显式 `anthropic-messages` → `/v1/messages` 200；A/B 复现旧行为 `…/v1/v1/messages` → 404，根因确认为双 `/v1` 前缀。详见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

### Reasoning 档位

支持的 reasoning 档位按模型而定。`none` 映射到 OpenClaw `off`；`auto` 映射到 `adaptive`。不能关闭 thinking 的模型不宣告 `off`。若现有会话的档位变得不受支持，请求适配会选择更低的受支持档位或模型默认。

`ultra` 不作为常规 thinking 选项提供：部分 OpenClaw 版本给它单独的编排语义，且服务端可能宣告其请求校验器拒绝的档位。确认端点支持后可精确透传：

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

显式 effort 必须出现在模型的能力宣告中，但宣告不保证上游接受。插件不会通过发送试探性推理请求来探测支持情况。

## 从静态 provider 迁移

1. 安装与配置本插件期间保留旧配置。
2. 用 `openclaw sub2api catalog` 与 `models list` 检查模型与能力。
3. 把目标默认模型或 agent 模型引用改为 `sub2api-provider/MODEL_ID`。
4. 验证请求通过后再移除旧配置。

插件不删除已有 provider、不改写会话。活动会话的上下文与压缩预算不保证在当前回合内重算。

## 故障排查

### 模型已发现但选择器里没有

带 `agents.defaults.modelPolicy.allow` 的 OpenClaw 版本会优先使用该显式策略，而非旧的 `agents.defaults.models` 条目。登录会把 `sub2api-provider/*` 追加进已有默认策略并保留其条目。若 agent 自带 `modelPolicy.allow`，该策略优先，必须同样允许 sub2api-provider 模型。反复重启 Gateway 不会改变模型可见性策略。

### sync 报告成功但不退出

OpenClaw `2026.8.1` / `2026.8.2` 在 prepared 目录发布完成后可能留存宿主 worker。需要一次性 sync 命令正常退出时，请用已验证的 `2026.9.3` 宿主。若必须保留这两个 8 月版本，见单独的[宿主补丁与回滚说明](https://github.com/sagemoyi/openclaw-sub2api-provider/tree/main/patches/openclaw)；插件更新不会自动应用这些补丁。

### provider 或登录方式缺失

检查 `openclaw plugins list`，确认 `plugins.allow` 含 `sub2api-provider`。安装或更新后，运行中的 Gateway 必须加载新插件代码。

若登录在提示前就失败，且原因是 CLI 与已装 Gateway 使用不同的状态目录或配置路径，说明宿主拒绝了写入不一致的存储。检查命令是否指向目标 Gateway 配置；隔离测试请用独立配置。这个错误不能证明 sub2api key 无效。

### 发现成功，但选择器显示旧模型

运行 `openclaw sub2api sync` 并检查结果。带旧版选择器缓存的 OpenClaw 版本可能需要：

```bash
openclaw gateway restart
```

存在刷新 API 不保证每个宿主版本、agent 和既有会话都免重启更新。

### 认证或连接失败

核对 URL scheme、反代路由、凭据来源与 Gateway 服务环境。错误密钥返回 HTTP 401。绝不要把密钥放进 URL、issue 或公开日志。

### Reasoning 或上下文上限看起来不对

用 `openclaw sub2api catalog` 检查来源与警告。sub2api manifest 无 `max_tokens`，输出上限在 bundled 元数据或显式覆盖之外保守回退 4096。bundled 元数据是 CLIProxyAPI 衍生且默认关闭；可切换 `useBundledMetadata` 对比行为，或使用标准模型覆盖。

### anthropic-messages 模型返回 404

更新到 0.1.3 或更高：`anthropic-messages` 行现在携带去掉尾部 `/v1` 的 per-model `baseUrl`，更早的请求可能拼出 `/v1/v1/messages`。若你自己钉过 per-model `baseUrl`，请为 anthropic 协议行去掉 `/v1` 后缀。见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

## 实测记录（2026-09-17）

- 目录形态：**`data[]`**（不是 `models[]`）。行字段：`id`、`display_name`、`created_at`、`type`。无 `owned_by`。上游新版行可能新增 `owned_by`/`created`；解析器只按 `id` 建索引，保持兼容。
- 错误密钥：**HTTP 401**。
- 推理：`POST /v1/chat/completions` → 200；`/v1/responses` 与 `/v1/messages` 经显式 per-model `api` 验证。
- 空目录：线上未观测；代码可解析空数组并视为权威结果。
- 探测改发非空 `client_version=1` 以取 sub2api 的 Codex manifest（**空值**在 sub2api 等同无此参数，返回普通列表）——**live 已验**。manifest 无 `max_tokens` 字段，输出上限仍保守回退。忽略该参数的服务器会被识别为非 rich。

完整矩阵：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

## 限制

- 不覆盖 sub2api 管理后台 / 多租户计费。
- 不要沿用 CPA 的 `owned_by` → responses 启发式；本插件按 ID 线索推断 per-model `api`。
- gemini 线索映射到 completions 只对 OpenAI/Grok 平台组有把握；Gemini 平台组可能仅服务 `/v1beta/models/{model}:generateContent`——若出现 404 请显式覆盖 `models[].api`。
- 旧版 OpenClaw 可能仍缓存 Gateway 选择器，可能需要重启。见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

## 开发

见[测试与开发指南](docs/TESTING.md)和[架构与兼容性](docs/RESEARCH.md)。

## 相关项目与许可

发现与刷新设计参考了官方 [pi-sub2api-provider-provider](https://github.com/router-for-me/pi-sub2api-provider-provider)。本项目是独立的 OpenClaw 集成，不是该插件的 fork，也不提供其 TUI、Fast、暂停或压缩功能。移植自同一作者的 [openclaw-cliproxyapi-provider](https://github.com/sagemoyi/openclaw-cliproxyapi-provider)。

以 [MIT License](LICENSE) 许可。随包元数据的归属与许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

## 链接

[Linux.do](https://linux.do/)

[nodeseek](https://www.nodeseek.com/)
