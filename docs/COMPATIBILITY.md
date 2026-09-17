# Compatibility — openclaw-sub2api-provider

> 维护：礼部。相对 CPA 差异、bundled metadata 去留、已知限制。  
> **状态：0.1.3 修订（2026-09-17 基稿）。** provider 默认 `openai-completions`（仅决定插件推断兜底）。依据 `bingbu/default-completions` @ `a03a7d9`，并据宿主 2026.9.3 dist 复核更正宿主默认口径。脱敏过闸前禁 push。钉 OpenClaw 2026.9.3。  
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


## 1a. 按模型选择协议（钉 OpenClaw 2026.9.3）

全文：[PROTOCOL.md](./PROTOCOL.md)。

**宿主默认并非单一**（2026.9.3 dist 实测）：动态 provider 默认解析路径落到 `openai-completions`；静态目录行是 `row.api ?? "openai-responses"`，请求链末端 fallback 也是 `openai-responses`。本插件**给每条目录模型显式写 `api`**，因此不依赖宿主任何一种默认；`PROVIDER_DEFAULT_API = "openai-completions"` 只决定插件自己的推断兜底。写入点仍共用 `inferNativeApiForModelId`。

| 线索 | `api` |
| --- | --- |
| `claude` | `anthropic-messages` |
| `gpt` / `codex` / `chatgpt`，或按 token 边界出现 `o1` / `o3` / `o4` | `openai-responses` |
| `gemini` 等稳定线索 | `openai-completions` |
| 未知 ID | provider 默认 `openai-completions`（**非官方穷尽表**） |

显式 `models[].api` 优先。第一版无前缀覆盖表。

Live（默认 completions @ `a03a7d9`）：DISCOVER / D1 / P3 / P5-default-completions / P5-responses-explicit **PASS**；**P1/P2/P3a live 待验**。**P5-messages PASS（0.1.3 live 复测）**：显式 `anthropic-messages` → `/v1/messages` 200；根因 A/B 实证为双 `/v1` 前缀（强制旧行为实测 `…/v1/v1/messages` → 404），分组路由假说排除。


## 1. 相对 CPA 的差异（实测）

| 面 | CPA 习惯 | sub2api 实测 | 结论 |
| --- | --- | --- | --- |
| 目录端点 | `/v1/models` + 可选 rich `?client_version=` | `/v1/models` HTTP 200；**非空** `client_version=1` 选 sub2api Codex manifest（`models[]`），**空值等同无参数**返回普通 `data[]` | 0.1.3 起探测发非空值；manifest **live 已验（2026-09-17）** |
| 目录形态 | 常 `models[]` / 富目录 | 顶层键 `data`+`object`；列表为 **`data[]`**（非 `models[]`） | **有差异** |
| 行字段 | `id` / `owned_by` / `created` / `object` | 实测 2026.9.3 环境下**普通列表**行：`id`, `display_name`, `created_at`, `type`；**无** `owned_by` / 行内 `object` / 经典 `created`。上游当前 main 的普通行带 `owned_by`/`created`；解析器两者兼容（只按 `id` 建索引） | **有差异（owned_by 漂移）；解析器兼容** |
| manifest 行字段 | `slug` / `context_window` / `max_tokens` | sub2api manifest 行：`slug`、`display_name`、`default_reasoning_level`、`supported_reasoning_levels[{effort}]`、`input_modalities`、`context_window`、`max_context_window`；**无** `max_tokens` | 输出上限仍保守回退 4096；manifest 行为 **live 已验（2026-09-17）** |
| 空目录 | — | 本次线上 7 条，**未观测**空 `data[]`；代码可解析空数组；业务是否当成功 **待补测** | 待验 |
| 鉴权 | API key | 错 key → **HTTP 401**（体 `code`/`message`，无 models/data） | 对齐常见 OpenAI 形 |
| 协议投影 | `owned_by` → responses 启发式 | **按模型写原生 `api`**；provider 默认 **completions**（仅决定插件推断兜底；宿主静态行/末端 fallback 是 responses） | CPA 启发式 **不适用**；**非穷尽表** |
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
| C catalog | `openclaw sub2api catalog` | **PASS** | exit 0；7 models；旧空 `client_version` 探测曾误报 `rich`（0.1.3 改发 `client_version=1` 后 `rich=true` 为真，live 已验） |
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
| 2 | 0.1.3 探测改发非空 `client_version=1` 取 Codex manifest（**live 已验** 2026-09-17：`rich=true` 为真，真实 context_window 272k–1M 与逐模型 reasoning 档位生效）；空值在 sub2api 等同无参数（返回普通 `data[]`）。manifest 无 `max_tokens`，输出上限仍 4096 保守回退 |
| 3 | 实测普通行无 `owned_by`，不能用 CPA responses 启发式；改按 ID 线索推断；上游 main 行含 `owned_by`，解析器兼容但不使用该字段 |
| 4 | `cpa-models.json` 仍在树内但默认关；勿当 sub2api 真源 |
| 5 | 单元测试全绿已作为提闸条件（`npm run check && npm test`）；CI 见 `.github/workflows/ci.yml` |
| 6 | 文档基址仅为占位；登录默认 `http://127.0.0.1:8080/v1` |
| 7 | 与 learning-agent P0 隔离：独立 OpenClaw 前缀，不抢派 |
| 8 | 不测管理后台 / 不测多用户计费；不改 OpenClaw / sub2api 上游核心 |
| 9 | gemini → completions 只对 OpenAI / Grok 平台组有把握；Gemini 平台组可能仅原生服务 `/v1beta/models/{model}:generateContent`，`/v1/chat/completions` 若 404 需用 `models[].api` 显式覆盖；live 断言待目录出现 gemini ID 后补 |


## 5a. 宿主版本矩阵（2026.9.3 实测口径）

| 宿主范围 | 目录发布路径 | 备注 |
| --- | --- | --- |
| `2026.7.1-2` – `2026.8.x` | legacy（`loadModelCatalog`） | 一次性 CLI sync 需 `patches/` 的 worker-ref 补丁才能退出进程；Gateway picker 另有一层缓存，通常需重启/重载 |
| `2026.9.1+` | prepared（`loadPreparedModelCatalog`） | 由宿主刷新已发布目录，无需合成 legacy 视图；公开 `models.list` RPC 可验证无需重启的更新 |

协议行为按 **2026.9.3** dist 实测钉定（anthropic 传输 URL 拼接、静态行/末端 fallback 默认值、动态 provider 默认解析）。npm `latest` 已到 **2026.9.4**，尚未复测；复测节奏：宿主升版后重跑 `npm test`（纯逻辑）+ `npm run test:host` / `npm run test:gateway`（隔离宿主），协议相关改动再补 live 项。

`peerDependencies.openclaw` 保持 `>=2026.7.1-2`：legacy 路径在该版本仍可用，prepared 路径按 API 探测自动选择，因此无需抬高下限。
## 6. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-09-17 | 礼部骨架：身份表、CPA 差异、bundled 去留、占位基址、A–H 空矩阵 |
| 2026-09-17 | 礼部据兵部 A–H 填实：`data[]`、错 key 401、F=chat/completions 200、bundled 默认 false；空目录待补测；禁 push |
| 2026-09-17 | 0.1.3 审查修复：anthropic-messages 行 baseUrl 去 `/v1`（`stripV1Suffix`，live 复测待验）、rich 探测改非空 `client_version=1`（manifest live 待验）、o 系列改 token 边界、宿主默认 api 表述更正、新增宿主版本矩阵 |
| 2026-09-17 | live 复测（真实端点，凭据仅注入环境）：P5-messages **PASS**（显式 `anthropic-messages` → `/v1/messages` 200；A/B 实证根因为双 `/v1` 前缀）；`client_version=1` manifest **已验**（`rich=true` 为真）；reasoning_effort 上线被服务端接受（high/xhigh）；P1/P2/P3a 仍待验（目录无对应线索 ID） |
| 2026-09-17 | 0.1.3 发布 ClawHub（`@sagemoyi/openclaw-sub2api-provider`，安全检查已过）；仓库转 public 并收敛到 `main` 单分支；README 双语重写为发布后形态（ClawHub 安装/更新、故障排查），DEVELOPMENT/TESTING 增加发布小节 |
