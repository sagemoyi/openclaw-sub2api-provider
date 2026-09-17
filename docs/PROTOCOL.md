# 按模型选择传输协议

> 维护：礼部。钉定宿主：**真 OpenClaw `2026.9.3`**。  
> **状态：修订（2026-09-17）。** provider 默认改为 `openai-completions`，与宿主无 `api` 时对齐；推断表与显式覆盖保留。本地文档，脱敏过闸前禁 push。  
> 占位：`https://s2a.example.com/v1`、`${SUB2API_API_KEY}`、`http://127.0.0.1:8080/v1`。  
> 不写真实基址/密钥。插件**不自写 SSE/HTTP 客户端**，只给目录每条模型写 OpenClaw 原生 `api`。

## 1. 三协议是什么

OpenClaw 原生 `MODEL_APIS`（宿主 `provider-transport-stream` 分发）：

| `api` 值 | 宿主请求路径 | 含义 |
| --- | --- | --- |
| `openai-completions` | `/v1/chat/completions` | Chat Completions |
| `openai-responses` | `/v1/responses` | Responses |
| `anthropic-messages` | `/v1/messages` | Anthropic Messages |

对不上则记待验，不猜，不在插件里再写第三套传输。

## 2. 默认对齐（原分叉已关闭）

| 层 | 没有显式 `api` 时的默认 |
| --- | --- |
| **本插件 provider 默认** | `openai-completions` |
| **OpenClaw 宿主**（目录行也没有 `api`） | `openai-completions` |

**两者已对齐。** 不再把 provider 默认写成 `openai-responses`。

目录发布、`resolveDynamicModel`、`prepareDynamicModel` 仍须用同一套推断 `inferNativeApiForModelId` 把**按模型**的 `api` 写到行上（claude → messages，gpt/o*/codex → responses 等），以便非默认协议能切换。未知 ID 则落到与宿主一致的 completions。

本文与实现以 **OpenClaw 2026.9.3** 为准。代码侧默认值由兵部改；本文先改说明。

## 3. 映射表（Copilot 启发式对齐）

解析顺序（先匹配先生效）：

1. **用户显式覆盖**（已有 `models[].api`）→ **不覆盖**
2. **插件推断**（模型 ID，大小写不敏感，子串/前缀）；第一版**无**前缀覆盖表

| 模型 ID 线索 | 写入的 `api` | 期望路径 |
| --- | --- | --- |
| 含 `claude` | `anthropic-messages` | `/v1/messages` |
| 含 `gpt` / `o1` / `o3` / `o4` / `codex` / `chatgpt` | `openai-responses` | `/v1/responses` |
| 含 Gemini 稳定线索（如 `gemini`） | `openai-completions` | `/v1/chat/completions` |
| 其余 / 未知 ID | provider 默认 → **`openai-completions`** | `/v1/chat/completions` |

**未知 ID 走默认，不是官方穷尽表。** 不要把上表当成 sub2api 或 OpenAI 的完整型号清单。

Gemini：按 Copilot 写成 completions，可被显式 `api` 覆盖；目录若无此类 ID，live 测项记「待验」，不得造假模型。

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
        // 可选：provider 级默认，仍低于模型级 api；现默认即为 completions
        // api: "openai-completions",
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

错协议 / 不支持的组合：失败应可观察，**不静默改写**用户显式 `api`（P6 已覆盖）。

非默认路径可用**已有目录 ID + 显式 `models[].api`** 切换，不必伪造目录行。

## 5. 测项结果（OpenClaw 2026.9.3）

下列为**改默认前**矩阵（当时 providerDefault=`openai-responses`）。**改默认后复测**见工作区外矩阵（不入库）：D1/DISCOVER/P4 口径 → completions；P1/P2/P3a live 仍待验。

Live 目录（改默认前）：7 条；`api` 分布全为 `openai-responses`；**无** claude / gpt-family / gemini 子串（样例族：composer* / deep* / grok-* / kimi-* / k3*）。

| 项 | 结果（改默认前） | 备注 |
| --- | --- | --- |
| DISCOVER | PASS | count=7；当时 providerDefault=`openai-responses` |
| P1-unit / P2-unit / P3a-unit | PASS | 合成 ID |
| **P1** | **待验** | 目录无 `claude` 线索 ID |
| **P2** | **待验** | 目录无 gpt-family ID |
| P3 | PASS | 显式 `models[].api` 优先 → `openai-completions` |
| **P3a** | **待验** | 目录无 Gemini 线索 ID；不得造假模型 |
| P4 | PASS（旧默认） | 当时未知 ID → `openai-responses`；**新默认下应复测**为 completions |
| P5-responses | PASS | `POST …/v1/responses` → 200 |
| P5-completions | PASS | `POST …/v1/chat/completions` → 200 |
| **P5-messages** | **FAIL-UPSTREAM** | 见下 |
| P5 | PASS | 已完成 responses + completions；messages 已尝试 |
| P6 | PASS | 显式 `api` 保留；失败可观察 |

### P5-messages 与宿主 `/v1` 双前缀

当 `baseUrl` 已含 `/v1`（登录默认示例 `http://127.0.0.1:8080/v1`）且 `api=anthropic-messages` 时，宿主可能拼出：

`POST https://s2a.example.com/v1/v1/messages` → **404**

插件只写 `api`，未自定义 HTTP。记 **FAIL-UPSTREAM**。用户若需 Messages，须自行核对宿主路径拼接，或等上游修正；本插件不绕过。

## 6. 已知限制

- P1 / P2 / P3a **live 待验**（当前目录无对应线索 ID）；单元已覆盖。目录变更后应复测。
- `anthropic-messages` + 已含 `/v1` 的 `baseUrl` 可能双前缀 404；不在插件里改写宿主 URL。
- 某分组若实际只吃 completions，靠显式覆盖 + 测项暴露。
- Gemini 映射第一版保守，不假装已穷尽。
- 第一版无前缀覆盖表。
- provider 默认已与宿主对齐为 `openai-completions`；改默认后的 P4 / DISCOVER 需复测。
- 不改 OpenClaw 核心。
