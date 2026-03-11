# SkillsFan 整体对标 OpenClaw 技术方案

## 1. 文档目标

本文给出一套完整的技术迁移方案，目标不是“局部抄 OpenClaw”，而是让 SkillsFan 在长期演进上具备与 OpenClaw 同等级别的平台能力：

- 本地常驻 Gateway / Daemon
- 独立于 Electron 的 Agent Runtime
- Provider-native 的模型与认证层
- 会话路由、会话存储、渠道接入的统一控制平面
- 可演进的插件 / Hook / Tool Runtime
- 自动化、子代理、远程接入、健康检查、运维能力

本文同时约束一个现实前提：

- 不能为了对标 OpenClaw，直接推翻现有 SkillsFan 的产品优势
- 迁移过程必须保持当前桌面端、远程访问、Feishu、Loop Task、Skill、AI Browser 能持续可用
- 必须允许“先兼容、后原生；先抽象、后替换；先双跑、后切换”

结论先行：

- 如果你要“整体对标 OpenClaw”，这不是一次 SDK 替换，而是一次平台内核重构
- 最合理路径是 7 个阶段
- 前 3 个阶段解决架构边界问题
- 后 4 个阶段解决 runtime、gateway、plugin、ops 的平台问题

如果你没有代码背景，建议先直接看：

- 第 12 节：最终建议
- 第 13 节：推荐下一步执行清单
- 第 14 节：产品经理版详细改动点说明

---

## 2. OpenClaw 的关键架构抽象

### 2.1 OpenClaw 的本质

OpenClaw 不是“套了 UI 的 Claude SDK 应用”，而是一套本地 AI Gateway 平台。它的核心分层可以概括为：

1. 接入层
   - CLI
   - Gateway HTTP / WS
   - 多渠道消息入口
   - Companion app / Node / WebChat

2. 控制平面
   - Gateway server
   - Session route / session key
   - Channel manager
   - Presence / health / cron / config reload / restart

3. Agent Runtime
   - `getReplyFromConfig()`
   - `runPreparedReply()`
   - `runEmbeddedPiAgent()`
   - `pi-ai + pi-coding-agent`

4. Model / Auth / Registry
   - Provider model APIs
   - Auth profile store
   - Model registry
   - Failover / fallback / compatibility

5. Plugin / Tool Runtime
   - Hook runner
   - Plugin runtime
   - Plugin SDK
   - Channel / Provider / Gateway extension points

6. 运维层
   - daemon service
   - doctor
   - gateway lock
   - restart / drain / health

### 2.2 值得借鉴的 OpenClaw 代码点

#### A. Runtime 是平台核心，不依附 UI

OpenClaw 的 Agent run 入口经过以下链路：

- `src/auto-reply/reply/get-reply.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`

这说明它不是从“聊天窗口”出发，而是从“消息进入平台 -> 找到 session / route / agent -> 调 runtime”出发。

#### B. 模型层是 provider-native 的

OpenClaw 在 `src/config/types.models.ts` 里把模型 API 类型显式建模为：

- `openai-completions`
- `openai-responses`
- `openai-codex-responses`
- `anthropic-messages`
- `google-generative-ai`
- `bedrock-converse-stream`
- `ollama`

这意味着它不是“把所有模型都兼容成一个 Claude 运行时”，而是允许不同 provider 走最合适的协议。

#### C. Gateway 是单独的长期存在进程

OpenClaw 的 `src/gateway/server.impl.ts`、`src/cli/gateway-cli/run.ts`、`src/cli/gateway-cli/run-loop.ts`、`src/daemon/service.ts` 共同说明：

- Gateway 是独立的运行时边界
- 支持 daemon 化
- 支持重启、drain、健康检查、锁、配置热更新
- UI 不是 agent 的宿主本体，只是平台客户端之一

#### D. 路由和会话模型是平台级对象

OpenClaw 的 `src/routing/resolve-route.ts` 与 `src/config/sessions/session-key.ts` 把下面这些概念固化了：

- `agentId`
- `channel`
- `accountId`
- `peer`
- `sessionKey`
- `mainSessionKey`
- direct / group / thread 的不同 session bucket

这点对你尤其重要，因为它决定了“Electron 会话”是不是唯一真实会话。

#### E. 插件不是轻量装饰，而是平台扩展层

OpenClaw 的：

- `src/plugins/hooks.ts`
- `src/plugins/hook-runner-global.ts`
- `src/plugins/types.ts`
- `src/plugin-sdk/*`

共同构成一套有生命周期、上下文、优先级和运行时能力的插件系统。这套系统既能扩展工具，也能扩展 provider、gateway method、channel、CLI、service。

---

## 3. SkillsFan 当前架构总结

### 3.1 当前优势

SkillsFan 当前已经具备很强的产品层能力：

- Electron 桌面产品体验成熟
- Remote Web 与 HTTP server 已有实现
- Feishu / Electron / Remote Web 渠道已经抽象成 Channel
- Loop Task、Skill、AI Browser、Local Tools、Web Tools 都已产品化
- AI Source Manager 支持多 provider 和 OAuth / custom API
- Claude SDK V2 session 的 warm / reuse / interruption / hosted subagent 都已经比较完善

### 3.2 当前关键边界

当前 SkillsFan 的真实架构核心是：

1. `src/main/services/agent/*`
   - 这是当前内核
   - 基于 `@anthropic-ai/claude-agent-sdk`
   - 会话创建通过 `unstable_v2_createSession()`

2. `src/main/services/ai-sources/*`
   - 当前 provider 管理层
   - 负责拿到 backend config
   - 但最终并不直接驱动 provider-native runtime

3. `src/main/openai-compat-router/*`
   - 非 Anthropic provider 通过 compat router 伪装给 Claude runtime

4. `src/main/http/*` + `src/main/services/remote.service.ts`
   - 远程访问层已存在
   - 但仍依附 Electron 主进程

5. `src/main/services/channel/*`
   - 渠道抽象已存在
   - 但仍是 UI / 远程同步导向，不是平台路由导向

6. `src/main/services/extension/*`
   - 扩展系统存在
   - 但 hook 面较窄，更像功能插件，不是平台插件

### 3.3 当前和 OpenClaw 的核心差别

当前 SkillsFan 是：

- Electron-first
- Claude-runtime-first
- provider 通过 compat 接入
- 渠道和远程是 UI/交互扩展

OpenClaw 是：

- Gateway-first
- Runtime-first
- provider-native
- 渠道是控制平面的第一公民

这个差异决定了：如果只是换 SDK，不会变成 OpenClaw。

---

## 4. 总体迁移策略

## 4.1 总原则

必须遵循以下 6 条：

1. 先抽象运行时，再替换运行时
2. 先把 Gateway 从 Electron 中拆出来，再做 provider-native
3. 先保留 Claude runtime 作为一个实现，再引入第二实现
4. 先统一 session / route / state，再统一 channel
5. 先用双跑和 feature flag 验证，再切正式流量
6. 先兼容现有 SkillsFan 产品能力，再追求 OpenClaw 式平台纯度

## 4.2 不建议的做法

不要直接做下面这些事：

- 不要先删掉 `openai-compat-router`
- 不要先把所有 `src/main/services/agent/*` 彻底改成新 runtime
- 不要在 runtime 还没抽象前就拆远程服务和渠道
- 不要同时重写 Electron、Gateway、Provider、Plugin 四层
- 不要追求一次性“完全像 OpenClaw”

---

## 5. 目标架构

建议 SkillsFan 演进到如下分层：

```text
Electron App / Remote Web / Feishu / Future Mobile
                |
                v
        Local SkillsFan Gateway
                |
    +-----------+-----------+
    |                       |
    v                       v
Runtime Orchestrator     Gateway Services
    |                    (HTTP/WS/Auth/Health/Cron/Channel)
    |
    +-------------------------------+
    |                               |
    v                               v
ClaudeSdkRuntime              NativeRuntime
(现有 Claude SDK)            (未来 provider-native)
    |
    +-------------------------------+
    | Model Registry / Auth Profiles |
    | Route Resolver / Session Store |
    | Tool Registry / Plugin Runtime |
    +-------------------------------+
```

## 5.1 推荐目录重构

建议最终新增并迁移到以下目录：

```text
src/gateway/
  index.ts
  server/
  daemon/
  channels/
  routing/
  runtime/
    types.ts
    orchestrator.ts
    claude-sdk/
    native/
  providers/
  sessions/
  tools/
  plugins/
  automation/
  doctor/
  storage/

src/main/
  app-shell/
  ipc/
  renderer-bridge/
```

其中：

- `src/gateway/*` 是未来平台核心
- `src/main/*` 退化成 Electron 壳层

---

## 6. 分阶段实施方案

## Phase 0：基线整理与防抖阶段

### 目标

在不改架构边界的前提下，先把后续重构需要的观测、测试、配置开关补齐。

### 要做什么

1. 建立迁移 feature flags
   - `gateway.enabled`
   - `gateway.mode = embedded | external`
   - `runtime.mode = claude-sdk | hybrid | native`
   - `providers.mode = compat | mixed | native`
   - `plugins.v2.enabled`
   - `channels.v2.enabled`

2. 为现有主链路建立基线测试
   - 发送消息
   - 会话 warm / reuse
   - Remote access
   - Feishu 渠道
   - Loop Task
   - Subagent
   - Skill MCP
   - AI Browser

3. 补齐运行指标
   - session create latency
   - first token latency
   - tool roundtrip latency
   - per-provider success rate
   - queue wait time
   - subagent completion rate
   - remote reconnect success rate

### 当前代码改动点

- `src/main/services/agent/*` 增加埋点
- `src/main/http/*` 增加 request / ws metrics
- `src/main/services/channel/*` 增加 routed event metrics
- `tests/unit` / `tests/e2e` 增加基线 case

### 完成标准

- 有一套可以回归的测试矩阵
- 有 feature flag，不会一改全坏
- 能量化后续每个阶段的收益和回归

---

## Phase 1：抽象 Runtime 边界

### 目标

把现有 `Claude SDK` 方案封装成一个 runtime 实现，让平台上层不再直接依赖 `claude-agent-sdk`。

### 这是整个迁移的第一关键步

如果这一步不做，后面所有改造都会被 `send-message.ts` / `session-manager.ts` / `sdk-options.ts` 绑死。

### 设计

新增接口：

```ts
export interface RuntimeEndpoint {
  provider: string
  api: string
  model: string
  baseUrl?: string
  headers?: Record<string, string>
  authMode?: 'api-key' | 'oauth' | 'token' | 'custom'
  credentialsRef?: string
}

export interface RuntimeSessionHandle {
  sessionId: string
  setModel?(model: string): Promise<void>
  setThinking?(level: string): Promise<void>
  abort(): Promise<void>
  close(): Promise<void>
}

export interface AgentRuntime {
  kind: 'claude-sdk' | 'native'
  createSession(input: CreateSessionInput): Promise<RuntimeSessionHandle>
  send(input: SendInput): Promise<void>
  stream(session: RuntimeSessionHandle, input: StreamInput): AsyncIterable<RuntimeEvent>
  warm?(input: WarmSessionInput): Promise<void>
  compact?(input: CompactInput): Promise<CompactResult>
}
```

### 实施步骤

1. 新增目录
   - `src/gateway/runtime/types.ts`
   - `src/gateway/runtime/orchestrator.ts`
   - `src/gateway/runtime/claude-sdk/*`

2. 把现有逻辑迁移为 `ClaudeSdkRuntime`
   - `src/main/services/agent/send-message.ts`
   - `src/main/services/agent/session-manager.ts`
   - `src/main/services/agent/sdk-options.ts`
   - `src/main/services/agent/message-utils.ts`

3. 让上层入口改为调 `RuntimeOrchestrator`
   - 现有 `agent.controller.ts`
   - 现有 IPC `src/main/ipc/agent.ts`
   - 现有 channel inbound handler

4. `AISourceManager` 不再只输出 backend config
   - 新增 `resolveRuntimeEndpoint()`
   - 保留 `getBackendConfig()` 供兼容层使用

### 借鉴 OpenClaw 的点

- 借鉴 OpenClaw 把 runtime 入口放在平台层，而不是 UI 层
- 借鉴其对 `provider + model + auth + route + session` 的显式建模
- 但此阶段仍保留 Claude SDK，不做 provider-native 改造

### 这一步结束后的状态

你仍然是 Claude SDK 内核，但不再是 Claude SDK 直连应用。

---

## Phase 2：拆出 Local Gateway

### 目标

把当前 Electron 主进程里的平台功能拆成一个本地 Gateway 进程，Electron 退化为客户端壳层。

### 为什么这一步必须早做

对标 OpenClaw 的关键不是“支持更多 provider”，而是“平台内核独立存在”。如果 runtime 继续绑定 Electron：

- Remote、Feishu、Loop Task、HTTP、Scheduler 都无法成为真正平台服务
- App 一关，平台即灭
- 你无法做 daemon、restart drain、gateway lock、doctor

### 实施步骤

1. 新增 Gateway 入口
   - `src/gateway/index.ts`
   - `src/gateway/server/index.ts`
   - `src/gateway/server/ws.ts`
   - `src/gateway/server/http.ts`

2. 把现有服务迁入 Gateway
   - `src/main/http/*` -> `src/gateway/server/*`
   - `src/main/services/remote.service.ts` -> `src/gateway/server/remote.ts`
   - `src/main/services/channel/*` -> `src/gateway/channels/*`
   - `src/main/services/scheduler.service.ts` -> `src/gateway/automation/scheduler.ts`

3. Electron 改为 Gateway client
   - 本地 IPC 或 loopback WS 调 Gateway
   - renderer 不再直接依赖主进程 agent service

4. 定义 Gateway 协议
   - `session.send`
   - `session.subscribe`
   - `route.resolve`
   - `task.create`
   - `task.list`
   - `plugin.list`
   - `health.get`

5. 第一阶段先做 embedded gateway
   - Gateway 仍由 Electron 拉起
   - 但已经是独立模块与进程边界

### 借鉴 OpenClaw 的点

- `src/gateway/server.impl.ts`
- `src/cli/gateway-cli/run.ts`
- `src/cli/gateway-cli/run-loop.ts`
- `src/daemon/service.ts`

### 完成标准

- Electron 可以作为 Gateway client 启动和连接
- Remote Web / Feishu / Loop Task 都通过 Gateway 工作
- 关闭聊天窗口不影响平台中的任务与会话

---

## Phase 3：重构 Route / Session / State 模型

### 目标

把现有“conversationId 为中心”的状态，升级成“route + agent + sessionKey 为中心”的平台状态模型。

### 为什么

OpenClaw 的强大来自会话不是 UI 对象，而是平台对象。你如果要真正支持：

- Feishu / Remote / Electron 同时接入
- 多账号 / 多渠道 / 多 peer
- 同一 agent 的 direct 与 group 隔离
- 后续 daemon 化和平台路由

就必须把 session 从 conversation UI 解耦。

### 新对象模型

```ts
type ResolvedRoute = {
  agentId: string
  channel: string
  accountId: string
  peerType: 'direct' | 'group' | 'thread'
  peerId: string
  sessionKey: string
  mainSessionKey: string
  workspaceId: string
}
```

### 状态存储建议

新增：

- `src/gateway/routing/resolve-route.ts`
- `src/gateway/routing/session-key.ts`
- `src/gateway/sessions/store.ts`
- `src/gateway/sessions/state.ts`
- `src/gateway/storage/*`

### 迁移策略

1. conversationId 继续保留给 UI
2. 新增 `sessionKey`
3. 所有 runtime、task、subagent、channel dispatch 逐步改用 `sessionKey`
4. conversation 只是某个 route/session 的前端视图

### 借鉴 OpenClaw 的点

- `src/routing/resolve-route.ts`
- `src/config/sessions/session-key.ts`

### 完成标准

- 同一个 route 在 Electron、Remote Web、Feishu 看到的是同一个平台 session
- UI conversation 不再决定 runtime session 生命周期

---

## Phase 4：Provider-native 模型层

### 目标

从“所有 provider 兼容给 Claude runtime”，演进到“provider-native 优先，compat 为兜底”。

### 这是第二个关键阶段

这个阶段做完，SkillsFan 才开始真正接近 OpenClaw 的平台能力。

### 设计原则

1. 保留 Claude runtime
   - Anthropic 继续走 ClaudeSdkRuntime
   - 这是你的产品稳定器

2. 新增 NativeRuntime
   - 支持 OpenAI Responses
   - 支持 OpenAI Codex
   - 后续支持更多 provider-native adapter

3. Compat Router 退化为 fallback
   - 不是主路径
   - 只给长尾 provider 或未完成 native 支持的 provider 用

### 实施步骤

1. 新增模型层模块
   - `src/gateway/providers/model-registry.ts`
   - `src/gateway/providers/auth-profiles.ts`
   - `src/gateway/providers/endpoint-resolver.ts`
   - `src/gateway/providers/api-types.ts`

2. 把 `AISourceManager` 变成上层 facade
   - 输入：user config / oauth / api key / skillsfan proxy
   - 输出：`RuntimeEndpoint`

3. 定义 provider API 类型
   - `anthropic-messages`
   - `openai-responses`
   - `openai-codex-responses`
   - `openai-completions`
   - `skillsfan-proxy`
   - `custom-openai-compatible`

4. 新增 `NativeRuntime`
   - 初期可先支持文本与工具调用
   - 第二阶段再补 thinking、usage、tool-result replay、multi-turn compaction

5. 切换策略
   - Anthropic: ClaudeSdkRuntime
   - OpenAI / Codex: NativeRuntime
   - 自定义 OpenAI-compatible: 初期 compat，后期 native
   - 国内平台代理: 初期保留现状

### 借鉴 OpenClaw 的点

- `src/config/types.models.ts`
- `src/agents/model-auth.ts`
- `src/agents/pi-embedded-runner/model.ts`

### 完成标准

- OpenAI / Codex 不再绕 `openai-compat-router`
- provider 行为差异可以在 adapter 层解决，而不是在 Claude transport 层打补丁

---

## Phase 5：统一 Tool Runtime 与 Plugin Runtime

### 目标

把现有 MCP / skill / local-tools / ai-browser / extension，统一成 runtime-agnostic 的工具与插件平台。

### 当前问题

当前 SkillsFan 的工具能力很强，但绑定 Claude SDK 比较重：

- Skill 通过 skill MCP
- local-tools / web-tools 通过 SDK MCP server
- extension hooks 面窄
- 工具体系更像 Claude runtime 配件，不是平台通用 runtime

### 目标设计

拆成两层：

1. Tool Registry
   - 统一工具定义
   - 统一权限模型
   - 统一调用结果格式
   - 可以输出给 Claude runtime，也可以输出给 NativeRuntime

2. Plugin Runtime
   - 生命周期 hooks
   - Tool factory
   - Provider / Channel / Gateway 扩展
   - Config schema
   - Service 扩展

### 实施步骤

1. 新增目录
   - `src/gateway/tools/registry.ts`
   - `src/gateway/tools/types.ts`
   - `src/gateway/plugins/types.ts`
   - `src/gateway/plugins/hooks.ts`
   - `src/gateway/plugins/runtime.ts`

2. 迁移工具提供者
   - `src/main/services/local-tools/*` -> `src/gateway/tools/local/*`
   - `src/main/services/web-tools/*` -> `src/gateway/tools/web/*`
   - `src/main/services/skill/*` -> `src/gateway/tools/skills/*`
   - `src/main/services/ai-browser/*` -> `src/gateway/tools/browser/*`

3. 迁移扩展系统
   - `src/main/services/extension/*` -> `src/gateway/plugins/*`
   - 将当前 hook 扩展为：
     - before_model_resolve
     - before_prompt_build
     - before_tool_call
     - after_tool_call
     - before_message_send
     - message_received
     - session_start / end
     - gateway_start / stop
     - subagent events

4. MCP 的定位调整
   - MCP 作为一种 tool transport
   - 不是唯一工具模型

### 借鉴 OpenClaw 的点

- `src/plugins/hooks.ts`
- `src/plugins/types.ts`
- `src/plugin-sdk/*`

### 完成标准

- ClaudeSdkRuntime 和 NativeRuntime 都能共用同一套 Tool Registry
- 插件可以扩展 gateway/channel/provider/tool，而不是只能拼 prompt 和拦工具

---

## Phase 6：自动化与长期运行能力

### 目标

把 Loop Task、Scheduler、Hosted Subagent、Retry、Compaction 这些能力平台化。

### 当前优势

这一块其实是 SkillsFan 的强项之一，尤其是：

- `loop-task.service.ts`
- `scheduler.service.ts`
- `agent/subagent/runtime.ts`

这些基础已经比很多桌面 agent 强。

### 要解决的问题

目前这些能力还是偏“应用服务”，需要变成“Gateway 平台服务”：

- app 重启后的恢复
- route/sessionKey 级别调度
- 子代理生命周期与父任务解耦
- daemon 模式下持续运行

### 实施步骤

1. 把任务与调度迁入 Gateway
   - `src/main/services/loop-task.service.ts` -> `src/gateway/automation/loop-task.ts`
   - `src/main/services/scheduler.service.ts` -> `src/gateway/automation/scheduler.ts`

2. Hosted subagent 平台化
   - `src/main/services/agent/subagent/runtime.ts` -> `src/gateway/automation/subagents/*`
   - 建立 run registry
   - 建立 restart recovery
   - 建立 parent/child route 绑定

3. 增加失败恢复与幂等
   - task execution journal
   - subagent run journal
   - queue drain on restart
   - retry policy by task type

4. 增加 doctor / health
   - task stuck
   - queue blocked
   - session lock
   - channel unhealthy
   - auth expired
   - tunnel broken

### 借鉴 OpenClaw 的点

- Gateway drain / restart loop
- session-based queue and subagent event model
- doctor / health / state integrity 的思路

### 完成标准

- SkillsFan 关闭 UI 后，平台服务仍可延续
- 任务、子代理、调度在 daemon 模式下可恢复

---

## Phase 7：Daemon、Doctor、运维闭环

### 目标

让 SkillsFan 拥有和 OpenClaw 同层级的常驻进程与运维能力。

### 实施步骤

1. Daemon 服务管理
   - macOS: launchd
   - Windows: Task Scheduler / service wrapper
   - 后续 Linux: systemd

2. Gateway Lock
   - 单实例保护
   - 端口冲突治理
   - restart drain

3. Doctor 命令与 UI
   - provider auth
   - route config
   - skill / tool health
   - browser runtime
   - remote access
   - scheduler / tasks / subagents

4. 运维命令
   - `skillsfan gateway status`
   - `skillsfan gateway restart`
   - `skillsfan doctor`
   - `skillsfan tasks repair`

### 借鉴 OpenClaw 的点

- `src/daemon/service.ts`
- `src/cli/gateway-cli/run-loop.ts`
- `src/commands/doctor*.ts`

### 完成标准

- Gateway 可以常驻
- 出问题可以诊断
- 可以安全升级和重启

---

## 7. 现有模块到目标模块的迁移映射

| 当前模块 | 目标模块 | 迁移方式 |
|---|---|---|
| `src/main/services/agent/*` | `src/gateway/runtime/claude-sdk/*` | 整体封装，不先重写 |
| `src/main/services/ai-sources/*` | `src/gateway/providers/*` | 保留 facade，底层重构 |
| `src/main/openai-compat-router/*` | `src/gateway/providers/compat/*` | 从主路径降级为 fallback |
| `src/main/http/*` | `src/gateway/server/*` | 拆到独立 Gateway |
| `src/main/services/remote.service.ts` | `src/gateway/server/remote.ts` | 功能迁移 |
| `src/main/services/channel/*` | `src/gateway/channels/*` | 从 UI 路由改为平台路由 |
| `src/main/services/skill/*` | `src/gateway/tools/skills/*` | 接入 Tool Registry |
| `src/main/services/local-tools/*` | `src/gateway/tools/local/*` | 接入 Tool Registry |
| `src/main/services/web-tools/*` | `src/gateway/tools/web/*` | 接入 Tool Registry |
| `src/main/services/ai-browser/*` | `src/gateway/tools/browser/*` | 接入 Tool Registry |
| `src/main/services/extension/*` | `src/gateway/plugins/*` | 升级为平台插件系统 |
| `src/main/services/loop-task.service.ts` | `src/gateway/automation/loop-task.ts` | 平台化 |
| `src/main/services/scheduler.service.ts` | `src/gateway/automation/scheduler.ts` | 平台化 |
| `src/main/services/agent/subagent/*` | `src/gateway/automation/subagents/*` | run registry + recovery |

---

## 8. 具体落地顺序建议

推荐的真实执行顺序如下：

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. 先做 Phase 5 的 Tool Registry 基础
6. 再做 Phase 4 的 NativeRuntime
7. 再做 Phase 6
8. 最后做 Phase 7

原因：

- 如果先做 NativeRuntime，没有统一 Tool Registry，会很痛苦
- 如果不先拆 Gateway，自动化与多渠道会一直绑在 Electron 上
- 如果不先做 route/session 模型，多渠道和 daemon 都会反复返工

---

## 9. 里程碑与时间预估

### 里程碑 M1：Runtime 抽象完成

- 预计 2 到 3 周
- 产出：
  - `AgentRuntime`
  - `ClaudeSdkRuntime`
  - RuntimeOrchestrator
  - feature flags

### 里程碑 M2：Embedded Gateway 跑通

- 预计 3 到 4 周
- 产出：
  - Gateway server
  - Electron 作为 client
  - Remote/Feishu/Loop Task 接 Gateway

### 里程碑 M3：Session/Route 平台化

- 预计 2 到 3 周
- 产出：
  - route resolver
  - session key model
  - session store

### 里程碑 M4：Tool / Plugin Runtime v2

- 预计 3 到 5 周
- 产出：
  - Tool Registry
  - Plugin Runtime
  - MCP adapter

### 里程碑 M5：OpenAI/Codex NativeRuntime

- 预计 3 到 4 周
- 产出：
  - OpenAI native path
  - Codex native path
  - compat fallback

### 里程碑 M6：Daemon + Doctor + Recovery

- 预计 3 到 4 周
- 产出：
  - daemon
  - health
  - doctor
  - restart recovery

总周期：16 到 23 周

这是一个中大型平台重构，不建议压成 4 到 6 周。

---

## 10. 风险清单

### 高风险

1. Claude SDK 与 NativeRuntime 双栈长期并存导致复杂度激增
2. Tool Registry 抽象不当，造成 Claude 路径和 Native 路径都不好用
3. Gateway 拆出后，Electron 与 Gateway 状态同步复杂度上升
4. 现有 conversation 模型和新 sessionKey 模型冲突
5. Remote / Feishu / Loop Task 在迁移期出现状态不一致

### 缓解方案

1. 强制上层只通过 RuntimeOrchestrator
2. 先做统一 RuntimeEvent / ToolCall / ToolResult 类型
3. 用 feature flag 保证双栈灰度
4. 所有新对象先旁路写入，不马上替代 UI 主键
5. 每阶段都保留 fallback path

---

## 11. 测试策略

必须建立 4 层测试：

### 11.1 单元测试

- route resolution
- session key normalization
- provider endpoint resolver
- tool registry dispatch
- plugin hook ordering
- queue overflow / drain

### 11.2 集成测试

- ClaudeSdkRuntime end-to-end
- NativeRuntime end-to-end
- Remote Web through Gateway
- Feishu through Gateway
- Loop Task through Gateway
- subagent spawn / recover

### 11.3 兼容回归测试

- 现有聊天
- 现有技能
- 现有 AI Browser
- 现有 remote access
- 现有 task scheduling

### 11.4 故障注入测试

- provider timeout
- provider auth expired
- gateway restart during task
- websocket reconnect
- queue saturation
- session store corruption recovery

---

## 12. 最终建议

如果你的目标是“整体对标 OpenClaw”，正确答案不是“把 Claude SDK 换掉”，而是：

1. 先把 SkillsFan 从“桌面应用”提升为“本地 AI Gateway 平台”
2. 再把 Claude SDK 从“唯一内核”降级为“一个 runtime 实现”
3. 再把 provider-native、plugin runtime、daemon、doctor 补齐

对于 SkillsFan 来说，最优路线不是复制 OpenClaw 的产品形态，而是复制它的平台分层方法，再保留你自己的产品优势：

- 更强的桌面体验
- 更好的国内 provider 适配
- 更强的任务编排与产物展示

一句话总结：

- 短期：不要先重写模型层
- 中期：先拆 Gateway，再抽 Runtime，再统一 Tool/Plugin
- 长期：再做 provider-native 与 daemon/doctor

---

## 13. 推荐下一步执行清单

建议立刻开始的第一批实际工作如下：

1. 新建 `src/gateway/runtime/types.ts`
2. 新建 `src/gateway/runtime/orchestrator.ts`
3. 把 `src/main/services/agent/*` 包成 `ClaudeSdkRuntime`
4. 给 `AISourceManager` 新增 `resolveRuntimeEndpoint()`
5. 给 `src/main/http/*` 外面加一层 Gateway API 抽象
6. 新建 `src/gateway/routing/session-key.ts`
7. 新建 feature flags 与迁移埋点

这 7 件事做完，项目就进入了正确演进轨道。

---

## 14. 产品经理版详细改动点说明

## 14.1 先用一句话理解整个方案

这次方案不是“把一个模型换成另一个模型”，而是把 SkillsFan 从：

- 一个很强的桌面 AI App

升级成：

- 一个本地长期运行的 AI 平台，桌面端、远程网页、飞书、未来手机端都只是这个平台的入口

更通俗一点：

- 现在像“一个店里前台、厨房、外卖都混在一起”
- 目标像“先建中央厨房和调度中心，再让不同前台都接进来”

## 14.2 你作为产品经理真正要看懂的 4 件事

| 你最关心的问题 | 现在的情况 | 改完后的情况 | 对产品意味着什么 |
|---|---|---|---|
| 核心能力跑在哪里 | 主要跑在桌面 App 里 | 跑在本地 Gateway / 后台中枢里 | 平台更稳定，入口更多 |
| 多模型怎么接 | 很多模型本质是兼容接入 | 越来越多模型会原生接入 | 多模型质量更稳，扩展更强 |
| 会话怎么理解 | 更偏聊天窗口和 conversation | 更偏平台 session 和 route | 飞书、网页、桌面更容易共享同一任务 |
| 自动化怎么运行 | 还是比较依赖 App 本体 | 更像后台长期运行服务 | 定时任务、长任务、恢复能力更强 |

## 14.3 为什么不能只做“换 SDK”

因为 OpenClaw 的优势并不只是“用了别的代码库”，而是它有一套平台底座：

- 后台中枢
- 会话路由
- 多模型原生适配
- 插件运行时
- 守护进程
- 健康检查和诊断

如果只换 SDK：

- 你还是一个桌面 App
- 还是会被单一内核约束
- 还是很难做好多入口协同
- 还是做不出真正的平台级稳定性

所以这次方案的核心不是“换零件”，而是“换底盘”。

## 14.4 分阶段详细改动点说明

下面每个阶段都按同一套语言来解释：

- 是什么：实际会改哪类东西
- 为什么：为什么必须改
- 做完的效果：技术和产品上分别得到什么
- 用户是否感知：普通用户会不会立刻感觉到变化

---

### Phase 0：基线整理与防抖

这一阶段不是做新能力，而是先把后面的大改造变得可控。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| 加 feature flag | 给新架构加开关，允许旧逻辑和新逻辑并存 | 否则一改就是全量切换，风险太高 | 可以灰度、回滚、对照测试 | 基本无感知 |
| 补基线测试 | 把聊天、远程、飞书、任务、技能等现有能力固定成回归用例 | 后面重构非常大，没有基线就不知道哪里被改坏了 | 后续每次重构都能快速验证 | 无感知 |
| 补运行指标 | 记录首 token 延迟、会话创建耗时、工具往返耗时、排队时间等 | 不然你只知道“感觉慢了/快了”，无法量化收益 | 以后每个阶段都能算清楚成本和效果 | 无感知 |

这一步的产品意义：

- 它不创造卖点
- 但它决定后面的大改会不会失控

---

### Phase 1：抽象 Runtime 边界

这一阶段是把现在“绑在 Claude SDK 上的能力”先包起来，变成一个可替换模块。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| 定义 `AgentRuntime` 接口 | 用统一接口描述“创建会话、发消息、流式返回、终止、压缩上下文”等能力 | 以后要同时支持 Claude 内核和原生多模型内核，没有统一接口就无法并存 | 上层代码不再直接依赖 Claude SDK 细节 | 无感知 |
| 把当前逻辑封成 `ClaudeSdkRuntime` | 现在的 agent/session/send-message 逻辑整体包装成一种 runtime 实现 | 先保留稳定能力，避免一开始就重写 | 现有体验不丢，后续可以并行加第二种 runtime | 无感知 |
| 新增 Runtime 调度层 | 所有发消息入口都先走 RuntimeOrchestrator，再决定调用哪个内核 | 后续切 Anthropic、OpenAI、Codex、代理模型时都需要统一调度 | 为后续多 runtime 共存打基础 | 无感知 |
| AI Source 从“返回配置”升级成“返回可执行终点” | 不再只告诉系统 URL 和 Key，而是告诉系统这是什么模型类型、该走哪种协议、用什么认证方式 | 这是从“兼容接入”转向“原生接入”的第一步 | 后续模型选择不再被单一 SDK 绑死 | 用户暂时无感知，但后续是多模型能力提升的起点 |

这一步的产品意义：

- 你还是原来的产品
- 但内核开始“松绑”
- 相当于先把发动机从车架上改成可拆装结构

---

### Phase 2：拆出 Local Gateway

这一阶段是整个方案里最容易被产品忽视、但最重要的一步。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| 新建本地 Gateway | 把 HTTP、WebSocket、任务调度、渠道接入、运行时调度从 Electron 主进程里拆出来 | 只要核心能力还绑在桌面 App 上，就很难变成真正平台 | SkillsFan 有了“后台中枢”，不再只是一个桌面窗口 | 间接感知，主要体现在稳定性和扩展性 |
| Electron 改成 Gateway 客户端 | 桌面端只负责 UI 和交互，不再承载全部业务内核 | 让桌面端可以轻、后台可以稳 | 后续网页、飞书、桌面可以接同一个后台 | 用户不会马上看到界面变化，但多端一致性会更好 |
| Remote / Feishu 接到同一个 Gateway | 远程网页和飞书不再各自绕路，而是统一接中枢 | 这样不同入口才可能看到同一个真实状态 | 跨入口协同更自然 | 中期开始可感知 |
| 定义 Gateway 协议 | 给平台规定“发消息、订阅会话、创建任务、查健康状态”的统一接口 | 没有统一协议，就只是把代码搬家，不是平台化 | 后续手机端、企业端、外部控制台都能接入 | 用户无感知，团队收益大 |

这一步的产品意义：

- 现在是“桌面 App 在干活”
- 做完后会变成“后台中枢在干活，桌面 App 只是窗口”

这是从“工具”走向“平台”的转折点。

---

### Phase 3：重构 Route / Session / State 模型

这一阶段是把“聊天窗口思维”升级成“平台会话思维”。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| 引入 `route` 概念 | 用 agent、channel、account、peer、sessionKey 来定义一次真实会话 | 现在很多状态还是以 conversation 为中心，不利于多入口协同 | 同一任务可以跨桌面、飞书、网页统一识别 | 中期会感知到“同一任务更连贯” |
| 引入 `sessionKey` | 给每种真实会话一个统一主键，而不是只靠 UI 的 conversationId | UI 会话和平台会话不是一回事 | 后台可以真正理解 direct、group、thread 等不同会话桶 | 用户不直接看到，但会话行为会更稳定 |
| Conversation 降级为“前端视图” | 聊天窗口不再等于真实运行会话，而只是某个 session 的展示方式 | 这是多入口、多端、多渠道统一的关键 | 后续换入口不会丢上下文那么严重 | 中期会感知到跨端更顺 |
| 建立统一 session store | 会话状态、任务状态、运行状态进入统一存储层 | 为恢复、守护、远程协同做准备 | 后续重启恢复和长期任务更可靠 | 中后期感知明显 |

这一步的产品意义：

- 从“我打开了一个聊天窗口”
- 变成“我进入了一个平台会话”

这听起来像技术细节，但对长期任务、多端协作、飞书远控都非常关键。

---

### Phase 4：Provider-native 模型层

这一阶段开始，SkillsFan 才真正逐步拥有 OpenClaw 式的多模型底层能力。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| 定义模型 API 类型 | 把不同模型协议显式区分，比如 Anthropic、OpenAI Responses、Codex 等 | 现在很多模型本质是被绕成同一种运行方式 | 模型层更清晰，后续能按原生协议优化 | 初期无感知 |
| 新增认证档案和模型注册中心 | 不同模型的认证、可用模型列表、协议能力都统一收口管理 | 以后模型越来越多，必须有总控台 | 多模型接入和维护成本显著下降 | 无感知 |
| 新增 `NativeRuntime` | 为 OpenAI / Codex 等模型做原生运行路径 | 如果所有模型都绕到 Claude runtime，长期很难做好 | 多模型的质量、延迟、工具调用、兼容性会更稳 | 中期开始明显感知 |
| Compat Router 从主路径变成兜底 | 兼容层仍保留，但不再是默认方案 | 兼容层适合兜底，不适合长期做主干 | 主流模型体验更原生，长尾模型仍可接入 | 用户会感知到非 Claude 模型更稳定 |

这一步的产品意义：

- 现在是“很多模型都能用”
- 以后会变成“很多模型不只是能用，而是真的用得好”

---

### Phase 5：统一 Tool Runtime 与 Plugin Runtime

这一阶段解决的是：工具很多，但是否真正形成平台能力。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| 建立 Tool Registry | 把本地工具、网页工具、技能、浏览器能力统一注册 | 现在这些能力分散在不同模块，和当前 Claude 运行方式耦合较深 | 不同 runtime 都能复用同一套工具 | 中期开始会感知到模型间工具表现更一致 |
| 扩展插件系统 | 把当前轻量 extension 升级成平台插件机制 | 以后不仅要扩 prompt，还要扩 provider、tool、channel、gateway | 平台扩展性大幅提升 | 用户可能不会直接看到，但生态能力会变强 |
| MCP 变成一种接入方式，而不是唯一方式 | 把 MCP 视为工具的 transport 之一 | 否则你会被某一种工具接法限制住 | Tools 可以更灵活接入，历史资产也能复用 | 用户无感知 |
| Skill / AI Browser / Local Tools 统一接 Tool Registry | 让现有最强的产品能力进入统一平台 | 避免这些能力以后只能在某一种 runtime 下工作 | 保住 SkillsFan 现有优势，同时让它们更易扩展 | 中期会体现在稳定性与可复用性上 |

这一步的产品意义：

- 不是新增 1 个工具
- 而是把现有很多工具变成“平台公共能力”

这样以后接新模型、新插件、新入口才不会重复造轮子。

---

### Phase 6：自动化与长期运行能力

这一阶段会把你现在已经很强的任务能力，升级成真正的后台服务能力。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| Loop Task 平台化 | 让任务编排从“App 功能”变成“Gateway 服务” | 这样任务就不一定要依附某个打开着的窗口 | 长任务更稳，更适合长期运行 | 明显可感知 |
| Scheduler 平台化 | 定时调度迁入后台中枢 | 定时能力天然应该属于后台平台，不该只属于前台界面 | 定时任务更可靠，可恢复性更强 | 可感知 |
| Hosted subagent 平台化 | 子代理不再只是某次会话内的临时逻辑，而是可追踪、可恢复的后台 run | 多代理协作需要更强的生命周期管理 | 团队协作、复杂任务、自动化更稳 | 中期会感知到 |
| 增加恢复机制和执行日志 | 任务、子代理、队列、会话在重启后可继续修复或恢复 | 长期运行系统必须考虑失败和恢复 | 稳定性大幅提升 | 用户最能感知的是“没那么容易半路死掉” |

这一步的产品意义：

- 它会把 SkillsFan 从“会帮你做任务”
- 变成“可以持续替你跑任务”

这一步对自动化产品价值很大。

---

### Phase 7：Daemon、Doctor、运维闭环

这一阶段解决的是：平台能不能长期稳定跑、出问题能不能被定位和修复。

| 改动点 | 是什么 | 为什么要做 | 做完有什么效果 | 用户是否能直接感知 |
|---|---|---|---|---|
| Daemon 化 | 支持系统启动后台服务、自启动、常驻 | 如果平台不能常驻，就还是偏单次工具 | 任务、远程、飞书、自动化更像真正平台 | 明显可感知 |
| Gateway Lock 与安全重启 | 防止多实例冲突，支持优雅重启与排队任务排空 | 长期运行系统一定会遇到重启、升级、冲突 | 升级和恢复更安全 | 用户会感知到“更稳，不容易莫名出错” |
| Doctor 诊断 | 做一套“哪里坏了”的检测和提示 | 平台复杂后，排错不能靠猜 | 运维效率高很多，问题能被定位 | 用户和客服、运营都会受益 |
| 运维命令和健康检查 | 可以看状态、重启、修复、查配置、查 auth、查 task | 没有运维面板和命令，平台就难以长期维护 | 更适合企业场景、团队场景和长期交付 | 普通用户间接受益，团队直接受益 |

这一步的产品意义：

- 产品从“能跑”
- 升级为“能长期稳定跑、能被维护、能被诊断”

---

## 14.5 每个阶段对用户的真实感知强弱

| 阶段 | 用户短期感知强度 | 主要收益归属 |
|---|---|---|
| Phase 0 | 很低 | 技术团队 |
| Phase 1 | 很低 | 技术团队 |
| Phase 2 | 中等 | 产品长期能力 |
| Phase 3 | 中等 | 多端协同体验 |
| Phase 4 | 中高 | 多模型体验 |
| Phase 5 | 中等 | 平台扩展性 |
| Phase 6 | 高 | 自动化和长期任务 |
| Phase 7 | 高 | 稳定性、企业化、运维能力 |

可以这样理解：

- 前两阶段更像“打地基”
- 中间三阶段更像“搭主结构”
- 后两阶段更像“把这栋楼变成真正可长期运营的商业设施”

## 14.6 作为产品经理，你应该怎么向团队解释这件事

可以直接用下面这段话：

> 我们不是单纯要多接几个模型，也不是单纯换一个 SDK。  
> 我们要把 SkillsFan 从一个很强的桌面 AI 工具，升级成一个本地 AI 平台。  
> 这个平台以后要能同时承载桌面端、远程网页、飞书、定时任务、长任务、多模型和未来更多入口。  
> 所以前期我们做的是底座升级，中期做的是平台统一，后期做的是原生多模型和长期稳定运行。  
> 这件事短期不一定立刻带来很多新按钮，但会决定产品未来 1 到 2 年的扩展上限。  

## 14.7 你最该盯的产品结果指标

如果你不想盯技术指标，可以盯下面这些产品结果：

| 指标 | 为什么重要 |
|---|---|
| 长任务完成率 | 衡量平台化是否真的提高了长期任务能力 |
| 任务中断恢复率 | 衡量后台化和恢复机制是否真的有效 |
| 多模型稳定完成率 | 衡量 provider-native 改造是否成功 |
| 远程入口和桌面入口状态一致率 | 衡量 Gateway 与 session 路由是否统一 |
| 自动化任务准时执行率 | 衡量 scheduler 与 daemon 是否成熟 |
| 故障定位耗时 | 衡量 doctor 和运维能力是否起作用 |

## 14.8 如果只允许你记住 3 件事

1. 这不是“换模型接法”，而是“换平台底座”
2. 真正关键的不是多模型，而是先把后台中枢独立出来
3. 前期用户感知不强，但中后期会决定产品上限
