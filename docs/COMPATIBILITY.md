# Compatibility — openclaw-sub2api-provider

> 维护：礼部。相对 CPA 差异、bundled metadata 去留、已知限制。  
> **状态：按模型选协议文档已定稿（2026-09-17）。** A–H 脱敏曾过刑部；本段定稿后请刑部复审再 push。钉 OpenClaw 2026.9.3。  
> 依据：兵部 A–H 矩阵与协议矩阵（隔离工作区，不入库）。实现：`bingbu/per-model-api`。  
> 真实基址与密钥一律占位，禁止入文。

占位符：

| 用途 | 占位 |
| --- | --- |
| 文档中的 HTTP 基址 | `https://s2a.example.com/v1` |
| 登录默认示例 | `http://127.0.0.1:8080/v1` |
| 密钥 | `${SUB2API_API_KEY}` |

## 0. 身份（改名已落地）

| 项 | CPA（旧） | 本插件（实测） |
| --- | --- | --- |
| 插件 ID / provider ID | `cliproxyapi` | `sub2api-provider` |
| npm | `@sagemoyi/openclaw-cliproxyapi-provider` | `@sagemoyi/openclaw-sub2api-provider` |
| CLI | `openclaw cpa {sync,catalog}` | `openclaw sub2api {sync,catalog}`（无 `cpa` 别名） |
| 环境变量 | `CPA_API_KEY` | `SUB2API_API_KEY` |
| 配置键 | `models.providers.cliproxyapi` | `models.providers.sub2api-provider` |
| 模型引用 | `cliproxyapi/<id>` | `sub2api-provider/<id>` |
| 登录默认示例 | CPA 示例 | `http://127.0.0.1:8080/v1` |

实测环境：OpenClaw `2026.9.3` · Node `v24.19.0` · 隔离前缀 `oc-sub2api-2026.9.3`。


## 1a. 按模型选择协议（钉 OpenClaw 2026.9.3）— 已定稿

全文：[PROTOCOL.md](./PROTOCOL.md)。

**分叉（必须）**：本插件 provider 默认 `openai-responses`；OpenClaw 在目录行也没有 `api` 时默认 `openai-completions`。写入点共用 `inferNativeApiForModelId`（`catalog.run` / `mergeExplicit` / `inferredUnknownModel`），否则未知 ID 会掉回宿主 completions。

| 线索 | `api` |
| --- | --- |
| `claude` | `anthropic-messages` |
| `gpt` / `o1` / `o3` / `o4` / `codex` / `chatgpt` | `openai-responses` |
| `gemini` 等稳定线索 | `openai-completions` |
| 未知 ID | provider 默认 `openai-responses`（**非官方穷尽表**） |

显式 `models[].api` 优先。第一版无前缀覆盖表。

Live（目录 7 条，全为 `openai-responses`，无 claude / gpt-family / gemini）：P3/P4/P5-responses/P5-completions/P6 **PASS**；**P1/P2/P3a live 待验**；**P5-messages FAIL-UPSTREAM**（`baseUrl` 含 `/v1` 时宿主可能请求 `/v1/v1/messages` → 404）。插件只写 `api`，不改宿主 URL。

## 1. 相对 CPA 的差异（实测）

| 面 | CPA 习惯 | sub2api 实测 | 结论 |
| --- | --- | --- | --- |
| 目录端点 | `/v1/models` + 可选 rich `?client_version=` | 直连 `/v1/models` HTTP 200；catalog 仍报 `rich=true`（兼容探测，**应收紧**，勿沿用 CPA rich query） | 优先普通列表；`client_version` **不适用** |
| 目录形态 | 常 `models[]` / 富目录 | 顶层键 `data`+`object`；列表为 **`data[]`**（非 `models[]`） | **有差异** |
| 行字段 | `id` / `owned_by` / `created` / `object` | 样例：`id`, `display_name`, `created_at`, `type`；**无** `owned_by` / 行内 `object` / 经典 `created` | **有差异** |
| 空目录 | — | 本次线上 7 条，**未观测**空 `data[]`；代码可解析空数组；业务是否当成功 **待补测** | 待验 |
| 鉴权 | API key | 错 key → **HTTP 401**（体 `code`/`message`，无 models/data） | 对齐常见 OpenAI 形 |
| 协议投影 | `owned_by` → responses 启发式 | **按模型写原生 `api`**（见 §1a / PROTOCOL.md）；A–H 单次 F 曾走 completions | CPA 启发式 **不适用**；未知 ID 走默认 responses，**非穷尽表** |
| thinking / reasoning | CPA 预算表 | 默认关 bundled；不把 CPA thinking 表当真源 | 保守投影 |
| 推理传输 | 标准 openai-compatible | F：`POST /v1/chat/completions` → 200；choices=1；finish=`stop` | 不自写 SSE |
| 可选 `/backend-api/codex/models` | — | 本次未作为必测面 | **未测 / 不默认开** |

## 2. bundled metadata 去留

| 项 | 决定 | 实测 |
| --- | --- | --- |
| `useBundledMetadata` 默认 | **false** | **DONE**（改名已落地） |
| `data/cpa-models.json` / CPA thinking 预算表 | **不得原样沿用** | 文件仍在树内，**默认不启用** |
| 随包快照 | 若保留须按 sub2api `/v1/models` 实测重写 | 当前以关闭 bundled 为准 |

## 3. 本地测项 A–H

隔离前缀；凭据仅本地注入。文中无真实基址/密钥。

| 项 | 通过标准 | 结果 | 备注 |
| --- | --- | --- | --- |
| A 安装 | `--link`；`plugins list` 见 `sub2api-provider` | **PASS** | 需 `--accept-capabilities` |
| B login | 写入 endpoint+key；失败可辨 | **PASS** | 非交互：`baseUrl` + `paste-api-key`；profile `sub2api-provider:manual` |
| C catalog | `openclaw sub2api catalog` | **PASS** | exit 0；7 models；`rich=true`（探测策略待收紧） |
| D sync | `openclaw sub2api sync` | **PASS** | `synced=true`；models=7；mode≈prepared |
| E list | `models list --provider sub2api-provider` | **PASS** | count=7 |
| F 推理 | 一次真实补全或记失败类 | **PASS** | `POST /v1/chat/completions` → 200 |
| G 负例 | 错 key / 坏 URL / 无凭据 | **PASS** | 401；坏 URL exit 1；logout 后 catalog：`No API key found for provider "sub2api-provider"` |
| H 静态 | 无真实基址/key | **PASS（有夹具备注）** | 真实 host/key **0**；测试夹具含 `127.0.0.1:8317`（非生产）；文档占位 `s2a.example.com` |

过程：早期合并脚本 Aborted / 分项脚本语法问题已拆步重跑，不改 A–H 终态。

## 4. 脱敏 push 闸（刑部终审）

以下**全部**满足才可 `git push`（默认私有仓 `sagemoyi/openclaw-sub2api-provider`）：

1. 本地 A–H 记录在案（本文 + 兵部矩阵）  
2. 工作区与拟推 git history：**无**真实基址、**无** apikey、**无** `.env` 密钥  
3. README / 示例 / 默认值 / fixture 均为占位符（仓根 README 待替换为 `docs/README.*.sub2api.md`）  
4. 本文写明相对 CPA 差异、bundled 默认关、已知限制  
5. 拟推历史若含真实基址/key：重写或新仓，禁止强推脏历史  

刑部已通过。仓根 README 已替换为脱敏版。push 由工部执行私有仓 `sagemoyi/openclaw-sub2api-provider`。

## 5. 已知限制

| # | 限制 |
| --- | --- |
| 1 | 空目录合法性线上未观测；代码可解析空数组，业务成功与否待补测 |
| 2 | catalog 仍报 `rich=true`；应优先普通 `/v1/models`，勿沿用 CPA `client_version` |
| 3 | 无 `owned_by`，不能用 CPA responses 启发式；当前偏 completions |
| 4 | `cpa-models.json` 仍在树内但默认关；勿当 sub2api 真源 |
| 5 | 单元测试改名后未以全绿为 P0 闸 |
| 6 | 文档基址仅为占位；登录默认 `http://127.0.0.1:8080/v1` |
| 7 | 与 learning-agent P0 隔离：独立 OpenClaw 前缀，不抢派 |
| 8 | 不测管理后台 / 不测多用户计费；不改 OpenClaw / sub2api 上游核心 |

## 6. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-09-17 | 礼部骨架：身份表、CPA 差异、bundled 去留、占位基址、A–H 空矩阵 |
| 2026-09-17 | 礼部据兵部 A–H 填实：`data[]`、错 key 401、F=chat/completions 200、bundled 默认 false；空目录待补测；禁 push |
