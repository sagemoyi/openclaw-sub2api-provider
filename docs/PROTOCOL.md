# 按模型选择传输协议

> 维护：礼部。钉定宿主：**真 OpenClaw `2026.9.3`**。  
> **状态：0.1.3 修订（2026-09-17 基稿）。** provider 默认 `openai-completions`；按模型映射与显式覆盖保留。依据兵部 `bingbu/default-completions` @ `a03a7d9`，并据宿主 2026.9.3 dist 复核补齐：宿主默认并非单一，anthropic-messages 行 baseUrl 去 `/v1`（`stripV1Suffix`）。  
> **未 live 复测的事项一律记「待验」**，不复用旧结论。  
> 占位：`https://s2a.example.com/v1`、`${SUB2API_API_KEY}`、`http://127.0.0.1:8080/v1`。  
> 不写真实基址/密钥。插件**不自写 SSE/HTTP 客户端**，只给目录每条模型写 OpenClaw 原生 `api`。

## 1. 三协议是什么

OpenClaw 原生 `MODEL_APIS`（宿主 `provider-transport-stream` 分发）：

| `api` 值 | 宿主请求路径 | 含义 |
| --- | --- | --- |
| `openai-completions` | `${baseUrl}/chat/completions` | Chat Completions（需 baseUrl 带 `/v1`） |
| `openai-responses` | `${baseUrl}/responses` | Responses（需 baseUrl 带 `/v1`） |
| `anthropic-messages` | `${baseUrl}/v1/messages`（baseUrl 已以 `/v1` 结尾则 `${baseUrl}/messages`） | Anthropic Messages。**本插件对这类行剥离 baseUrl 尾部 `/v1`** |

对不上则记待验，不猜，不在插件里再写第三套传输。

## 2. 默认对齐（原分叉已关闭）

| 层 | 没有显式 `api` 时的默认 |
| --- | --- |
| **本插件 provider 默认** | `openai-completions`（`PROVIDER_DEFAULT_API`，原 `openai-responses`） |
| **OpenClaw 动态 provider 解析路径**（实测 2026.9.3 dist） | `openai-completions` |
| **OpenClaw 静态目录行**（`row.api ?? …`） | `openai-responses` |
| **OpenClaw 请求链末端 fallback** | `openai-responses` |

**注意：宿主并非只有一种默认。** 动态 provider 的默认解析路径实测落到 `openai-completions`；但静态目录行是 `row.api ?? "openai-responses"`，请求链末端 fallback 也是 `openai-responses`。本插件**给每条目录模型显式写 `api`**，因此不依赖宿主任何一种默认；`PROVIDER_DEFAULT_API` 只决定插件自己的推断兜底。

目录发布、`resolveDynamicModel`、`prepareDynamicModel` 仍用同一套推断 `inferNativeApiForModelId` 把**按模型**的 `api` 写到行上（claude → messages，gpt/o*/codex → responses 等）。`o1`/`o3`/`o4` 按 token 边界匹配（`o1-pro`/`o3-mini`/`o4-mini` 命中，`hero12b-instruct` 这类子串不命中）。未知 ID 落到插件默认 completions。

本文与实现以 **OpenClaw 2026.9.3** 为准。

## 3. 映射表（Copilot 启发式对齐）

解析顺序（先匹配先生效）：

1. **用户显式覆盖**（已有 `models[].api`）→ **不覆盖**
2. **插件推断**（模型 ID，大小写不敏感；`claude`/`gpt`/`codex` 等按子串，`o1`/`o3`/`o4` 按 token 边界）；第一版**无**前缀覆盖表

| 模型 ID 线索 | 写入的 `api` | 期望路径 |
| --- | --- | --- |
| 含 `claude` | `anthropic-messages` | `/v1/messages` |
| 含 `gpt` / `codex` / `chatgpt`，或按 token 边界出现 `o1` / `o3` / `o4` | `openai-responses` | `/v1/responses` |
| 含 Gemini 稳定线索（如 `gemini`） | `openai-completions` | `/v1/chat/completions` |
| 其余 / 未知 ID | provider 默认 → **`openai-completions`** | `/v1/chat/completions` |

**未知 ID 走默认，不是官方穷尽表。** 不要把上表当成 sub2api 或 OpenAI 的完整型号清单。

Gemini：按 Copilot 写成 completions，可被显式 `api` 覆盖。**风险（待验）**：只对 OpenAI / Grok 平台组有把握；Gemini 平台组可能仅原生服务 `/v1beta/models/{model}:generateContent`，`/v1/chat/completions` 是否可用未验证。若实测 404，用 `models[].api` 显式覆盖或记失败。目录若无此类 ID，live 测项记「待验」，不得造假模型。

### anthropic-messages 行的 per-model `baseUrl`（0.1.3）

宿主有两条 anthropic 请求路径（2026.9.3 dist 实测）：**托管传输**（provider-transport-stream 分发 → `createAnthropicMessagesTransportStreamFn`）经 `resolveAnthropicMessagesUrl` 拼接 URL——baseUrl 已以 `/v1` 结尾时只加 `/messages`，**本无双前缀**；**pi-ai 谱系 providers 路径**（plugin-sdk `stream`/`streamSimple` → 官方 Anthropic SDK 以 `baseURL` 直接拼接）则无条件加 `/v1/messages`，baseUrl 以 `/v1` 结尾时会拼出 `/v1/v1/messages`；onboard 诊断 ping 同样无条件 `${baseUrl}/v1/messages`。`normalizeBaseUrl()` 强制端点以 `/v1` 结尾，因此 0.1.3 起插件在 `catalog.run`（`CatalogClient.get`）与 `runtimeModel` 两处，对最终 api 为 `anthropic-messages` 的行剥离尾部 `/v1`（`stripV1Suffix`）：SDK/诊断拼接路径因此得到正确 URL，托管传输路径结果不变（殊途同归，均为 `<host>/v1/messages`）。provider 级 `baseUrl` 仍保留 `/v1` 供 openai 系端点使用。用户显式 per-model `baseUrl` 优先。

实现写入点：`projectModel` / `catalog.run`、`mergeExplicit`（resolve / prepare / normalize）、`inferredUnknownModel`，均调用同一 `inferNativeApiForModelId`。

## 4. 显式覆盖方式

用户配置里给该模型写 `api`，推断不得改写：

```json5
{
  models: {
    providers: {
      "sub2api-provider": {
        baseUrl: "http://127.0.0.1:8080/v1",
        apiKey: "${SUB2API_API_KEY}",
        // 可选：provider 级默认。**仅对不在目录中的未知 ID 生效**；
        // 目录行总带推断出的 api，模型级 models[].api 才是目录模型的唯一覆盖途径。
        // 现默认即为 completions
        models: [
          { id: "some-odd-id", api: "openai-responses" }
        ]
      }
    }
  }
}
```

模型引用：`sub2api-provider/<id>`。

登录 / sync 后生效。改映射需再 sync 或重启 Gateway。

错协议 / 不支持的组合：失败应可观察，**不静默改写**用户显式 `api`（P6 / P3 已覆盖）。

非默认路径可用**已有目录 ID + 显式 `models[].api`** 切换，不必伪造目录行。

## 5. 测项结果（OpenClaw 2026.9.3 · 默认 completions）

Live 目录：7 条；`api` 分布全为 `openai-completions`；providerDefault=`openai-completions`；**无** claude / gpt-family / gemini 子串（样例族：composer* / deepseek* / grok-* / k3*）。0.1.3 起 `client_version=1` 探测到真实 Codex manifest（live 已验）：`rich=true` 为真，context_window 272k–1M、逐模型 reasoning 档位（如 grok-* 的 low/medium/high/xhigh、k3* 的 low/high/max）、input_modalities 均为真值；manifest 无 `max_tokens`，输出上限仍保守回退 4096。

| 项 | 结果 | 备注 |
| --- | --- | --- |
| CODE-DEFAULT | PASS | `PROVIDER_DEFAULT_API=openai-completions` |
| DISCOVER | PASS | count=7；providerDefault=`openai-completions`；`client_version=1` manifest 已验，`rich=true` 为真 |
| D1-unit | PASS | 合成未知 ID → completions |
| **D1** | **PASS** | live 未知族 ID → `/v1/chat/completions` 200 |
| P1-unit / P2-unit / P3a-unit | PASS | 合成 ID |
| **P1** | **待验** | 目录无 `claude` 线索 ID |
| **P2** | **待验** | 目录无 gpt-family ID |
| P3 | PASS | 显式 `models[].api` 优先 |
| **P3a** | **待验** | 目录无 Gemini 线索 ID；不得造假模型 |
| P5-default-completions | PASS | 默认路径 200 |
| P5-responses-explicit | PASS | 显式 `openai-responses` → `/v1/responses` 200 |
| **P5-messages** | **PASS（0.1.3 live 复测）** | 显式 `anthropic-messages` → `/v1/messages` 200；根因 A/B 实证，见下 |
| P6 | PASS | 显式 `api` 保留（沿用前序） |

### P5-messages 与 `/v1` 双前缀（0.1.3 已修并 live 实证）

双前缀发生在以 `baseURL` 直接拼接的路径（pi-ai providers 路径的官方 Anthropic SDK、onboard 诊断 `${baseUrl}/v1/messages`）：baseUrl 已含 `/v1` 时拼出 `/v1/v1/messages`。托管传输 `resolveAnthropicMessagesUrl` 对 `/v1` 结尾只加 `/messages`，本不受影响。

**根因 A/B 实证（2026-09-17，真实端点）**：同一目录 ID 显式 `anthropic-messages`——剥离修复后 `POST /v1/messages` → **200**；强制旧行为（per-model baseUrl 保留 `/v1`）→ 实测请求 URL `…/v1/v1/messages` → **404**。原 FAIL-UPSTREAM 的根因即双前缀；sub2api 分组路由假说排除（本部署 `/v1/messages` 正常服务）。

**0.1.3 修复**：插件侧按模型剥离 `anthropic-messages` 行的尾部 `/v1`（`stripV1Suffix`），并把结果写进该行的 `baseUrl`；provider 级 `baseUrl` 保留 `/v1`。两条宿主路径最终都拼出 `<host>/v1/messages`。不改 OpenClaw 核心。

注：自动推断路径（目录出现 `claude` 线索 ID → messages）仍未 live 覆盖——当前目录无此类 ID；本次以文档规定的「已有目录 ID + 显式 `models[].api`」路径完成实证。

## 6. 已知限制

- P1 / P2 / P3a **live 待验**（当前目录无对应线索 ID）；单元已覆盖。目录变更后应复测。（P5-messages 已移出待验：0.1.3 起 live PASS。）
- `anthropic-messages` 双前缀：已修复并 live 实证（`stripV1Suffix`，0.1.3）；托管传输本就 `/v1` 感知，剥离对其中性。
- 某分组若实际只吃 responses，靠显式覆盖 + 测项暴露。
- gemini → completions 只对 OpenAI / Grok 平台组有把握；Gemini 平台组可能仅服务 `/v1beta/models/{model}:generateContent`，若 404 需显式覆盖；live 断言待目录出现 gemini ID 后补。
- 第一版无前缀覆盖表。
- provider 默认 `openai-completions` 只决定插件推断兜底；宿主静态目录行与请求链末端 fallback 是 `openai-responses`，本插件每行显式写 `api` 故不依赖。
- 不改 OpenClaw 核心。
