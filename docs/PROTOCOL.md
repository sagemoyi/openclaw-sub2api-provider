# 按模型选择传输协议

> 维护：礼部。钉定宿主：**真 OpenClaw `2026.9.3`**。  
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

## 2. 必须写明的分叉

| 层 | 没有显式 `api` 时的默认 |
| --- | --- |
| **本插件 provider 默认** | `openai-responses` |
| **OpenClaw 宿主**（目录行也没有 `api`） | `openai-completions` |

这两套默认**不一致**。因此目录发布、`resolveDynamicModel`、`prepareDynamicModel` 必须用**同一套推断**把 `api` 写到模型上；否则未知 ID 会掉回宿主 completions，和 provider 默认 responses 分叉。

本文与实现以 **OpenClaw 2026.9.3** 为准。

## 3. 映射表（Copilot 启发式对齐）

解析顺序（先匹配先生效）：

1. **用户显式覆盖**（已有 `models[].api`）→ **不覆盖**
2. **可选前缀覆盖表**（若配置；优先级低于用户显式）
3. **插件推断**（模型 ID，大小写不敏感，子串/前缀）：

| 模型 ID 线索 | 写入的 `api` |
| --- | --- |
| 含 `claude` | `anthropic-messages` |
| 含 `gpt` / `o1` / `o3` / `o4` / `codex` / `chatgpt` | `openai-responses` |
| 含 Gemini 稳定线索（如 `gemini`） | `openai-completions` |
| 其余 / 未知 ID | provider 默认 → **`openai-responses`** |

**未知 ID 走默认，不是官方穷尽表。** 不要把上表当成 sub2api 或 OpenAI 的完整型号清单。

Gemini：第一版按 Copilot 写成 completions，并在 compatibility 标明「可被显式覆盖」；目录若无此类 ID，测项记「待验」，不得造假模型。

## 4. 显式覆盖方式

用户配置里给该模型写 `api`，推断不得改写：

```json5
{
  models: {
    providers: {
      "sub2api-provider": {
        baseUrl: "http://127.0.0.1:8080/v1",
        apiKey: "${SUB2API_API_KEY}",
        // 可选：provider 级默认，仍低于模型级 api
        // api: "openai-responses",
        models: [
          { id: "some-odd-id", api: "openai-completions" }
        ]
      }
    }
  }
}
```

模型引用：`sub2api-provider/<id>`。

登录 / sync 后生效。改映射需再 sync 或重启 Gateway（与旧版 picker 缓存现象一致则记入测项）。

错协议 / 不支持的组合：失败应可观察，**不静默改写**用户显式 `api`。

## 5. 测项（文档对照，P1–P6 / P3a）

| 项 | 期望 |
| --- | --- |
| P1 | ID 含 `claude` → Messages（`anthropic-messages`） |
| P2 | ID 含 `gpt` → Responses |
| P3 | 显式 `models[].api` 不被推断覆盖 |
| P3a | 不得造假模型冒充 Gemini |
| P4 | 未知 ID 走默认 `openai-responses`，不崩溃 |
| P5 | 各路径至少一次真实补全（凭据不入库） |
| P6 | 错协议可观察；不静默改写用户显式 `api` |

## 6. 已知限制

- 某分组若实际只吃 completions，靠显式覆盖 + 测项暴露，不在插件里再写第三套传输。
- Gemini 映射第一版保守，不假装已穷尽。
- 不改 OpenClaw 核心。
