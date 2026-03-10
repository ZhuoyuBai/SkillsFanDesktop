# SkillsFanApp 通用子 Agent Runtime 设计方案

## 文档目的

这份文档给出一套适配 `SkillsFanApp` 当前架构的“通用子 Agent 调用”方案。方案借鉴 `openclaw` 的实现思路，但会结合当前项目的实际限制来落地，不直接照搬。

目标不是让模型“更会用 TeamCreate”，而是在应用层补上一层宿主编排，让子 Agent 能力尽量从“模型技巧”变成“平台能力”。

## 一、先说结论

如果你要在 `SkillsFanApp` 里做一套通用子 Agent 能力，推荐路线是：

1. 不再把“多 agent 编排”主要建立在 Claude Code 内建的 `TeamCreate / TaskCreate / SendMessage` 上。
2. 在宿主层新增一套自己的子 Agent runtime，核心抽象对齐 OpenClaw 的：
   - `spawn`
   - `list`
   - `wait`
   - `send/steer`
   - `kill`
   - `auto-announce`
3. 模型通过本地 MCP 工具使用这套 runtime，而不是直接依赖 provider 对 team tools 的执行质量。
4. 主会话与子会话之间的结果汇总、等待策略、完成回推、恢复、UI 展示、权限控制，都由应用控制。

一句话概括：

当前项目是“模型驱动 team”；建议升级为“宿主驱动 subagent，模型只负责做子任务内容”。

## 二、当前项目现状

### 2.1 当前 agent 运行方式

当前 `SkillsFanApp` 的 agent 主体在：

- `src/main/services/agent/send-message.ts`
- `src/main/services/agent/session-manager.ts`
- `src/main/services/agent/permission-handler.ts`
- `src/main/services/local-tools/sdk-mcp-server.ts`

核心特征：

1. 每个用户会话以 `conversationId` 为主键复用一个 Claude Agent SDK V2 session。
2. `sendMessage()` 强绑定“用户消息持久化 + assistant placeholder + 流式渲染 + 完成态落库”。
3. 当前对子 agent 的支持主要来自 Claude Code SDK 自带的 `Task` 工具，以及实验性的 Agent Teams 工具：
   - `Task`
   - `TeamCreate`
   - `TeamDelete`
   - `SendMessage`
   - `TaskCreate`
   - `TaskUpdate`
   - `TaskList`
   - `TaskGet`
4. 主进程只是在接 SDK 回来的 `task_started / task_progress / task_notification` 事件后，把它们转发给前端显示。

这意味着：

- 当前系统能“展示”子 agent / team 的过程。
- 但当前系统还没有“宿主自己编排子 agent 生命周期”的能力。

### 2.2 当前痛点

当前痛点不是“没有工具”，而是“调度权不在宿主”。

典型问题：

1. 模型可能提早结束回合。
2. 模型可能把“请稍候”“正在准备”当成最终输出。
3. 主 agent 是否等待子 agent 结果、等待多久、如何汇总，主要靠模型自己决定。
4. 子 agent 没有宿主级 registry，缺少稳定的 `list / wait / kill / steer` 控制面。
5. 当前 `sendMessage()` 和 conversation 持久化耦合过重，不适合拿来直接复用为“内部子会话执行引擎”。

## 三、OpenClaw 借鉴点

OpenClaw 相关实现主要在：

- `openclaw/docs/tools/subagents.md`
- `openclaw/src/agents/subagent-spawn.ts`
- `openclaw/src/agents/tools/subagents-tool.ts`
- `openclaw/src/agents/subagent-announce.ts`

它真正值得借鉴的不是某个 prompt，而是这 4 个机制。

### 3.1 宿主创建独立子 session

OpenClaw 不是让模型“想象一个子 agent”，而是宿主真正起一个新的 agent session。

关键点：

- 子 agent 有独立 session key。
- 它是后台 run，不直接交付给用户。
- 宿主知道谁是父会话、谁是子会话、谁在等待谁。

### 3.2 宿主维护 subagent registry

OpenClaw 会记录：

- runId
- childSessionKey
- requesterSessionKey
- task
- startedAt / endedAt
- cleanup policy
- outcome

于是主会话可以稳定执行：

- list
- steer
- kill
- wait

### 3.3 子 agent 完成后主动 announce

OpenClaw 的关键不是“父 agent 去轮询结果”，而是子 agent 完成后触发 announce flow，把结果主动推回 requester。

这会显著降低：

- 主 agent 忘记等待
- 主 agent 提前结束
- 主 agent 误判子 agent 状态

### 3.4 宿主注入“等待剩余子任务”规则

OpenClaw 在 announce 阶段会告诉父 agent：

- 如果还有其他 active subagents，就先不要给用户发最终结果。
- 如果没有剩余子任务，再汇总并交付。

这条规则非常关键，因为它把“fan-in 汇总”从模型自发行为变成了宿主约束。

## 四、对 SkillsFanApp 的总体设计

## 4.1 设计目标

设计目标：

1. Provider 无关。
2. 模型无关。
3. UI 可见。
4. 支持恢复。
5. 支持控制。
6. 与当前 conversation / session 体系兼容。

非目标：

1. 第一版不追求完全复刻 OpenClaw 的 thread-bound subagent session。
2. 第一版不追求和 Claude Code Team tools 并存的复杂编排。
3. 第一版不做群聊/飞书/远程会话的跨会话路由 announce。

## 4.2 推荐架构

建议引入一套新的“宿主层 subagent runtime”，与当前主 agent 并列，但复用现有 agent runner 能力。

建议架构分为 5 层：

1. `Agent Runner` 层
   - 负责真正跑一次 agent turn
   - 这是对现有 `send-message.ts` 的抽象重构
2. `Subagent Runtime` 层
   - 负责 spawn / wait / kill / steer / announce
3. `Registry + Persistence` 层
   - 负责存储 run metadata 与恢复
4. `Tool Surface` 层
   - 暴露给模型的 MCP 工具
5. `Renderer/UI` 层
   - 可视化主会话下的子 agent 生命周期

## 五、核心设计原则

### 5.1 不依赖 TeamCreate

如果目标是“通用子 agent”，不建议以 `TeamCreate` 为核心。

原因：

1. `TeamCreate` 是 Claude Code 的实验性 team 编排能力。
2. 它本质上仍然是模型主导的工作流，不是宿主主导。
3. 你要的是“稳定的产品能力”，不是“模型偶尔会自己完成的能力”。

建议：

- 保留 `Task` / `TeamCreate` 作为兼容能力。
- 新增宿主级 subagent 工具后，在 system prompt 里明确优先使用宿主级 subagent runtime。

### 5.2 子 agent 是真实会话，不是普通 tool 事件

每个子 agent 都应该被视作独立 run。

它至少应该有：

- `runId`
- `parentConversationId`
- `childConversationId`
- `status`
- `task`
- `model`
- `thinkingEffort`
- `startedAt`
- `endedAt`
- `summary`
- `resultSummary`
- `error`

### 5.3 push-based completion，避免 busy polling

父 agent 默认不应该通过循环 `list / wait` 轮询。

正确做法：

1. spawn 子 agent
2. 子 agent 结果完成后，由宿主回推
3. 父 agent 只在需要干预时使用 `list / steer / kill`

## 六、建议的数据模型

```ts
export interface SubagentRun {
  runId: string
  parentConversationId: string
  parentSpaceId: string
  childConversationId: string
  childSessionId?: string
  status: 'queued' | 'running' | 'waiting_announce' | 'completed' | 'failed' | 'killed' | 'timeout'
  task: string
  label?: string
  model?: string
  modelSource?: string
  thinkingEffort?: 'low' | 'medium' | 'high'
  requestedBy: 'model' | 'system' | 'user'
  autoAnnounce: boolean
  spawnedAt: string
  startedAt?: string
  endedAt?: string
  latestSummary?: string
  resultSummary?: string
  error?: string
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalCostUsd?: number
  }
  parentToolCallId?: string
}
```

```ts
export interface SubagentRegistryStore {
  runs: Record<string, SubagentRun>
  byParentConversation: Record<string, string[]>
}
```

## 七、建议暴露给模型的工具协议

建议不要直接暴露很多零散工具，第一版用 2 个就够。

### 7.1 `subagent_spawn`

建议加到 `local-tools` MCP server 中，工具名建议：

- `mcp__local-tools__subagent_spawn`

输入建议：

```ts
{
  task: string
  label?: string
  model?: string
  modelSource?: string
  thinkingEffort?: 'low' | 'medium' | 'high'
  autoAnnounce?: boolean
  waitForCompletion?: boolean
  timeoutSeconds?: number
}
```

返回建议：

```ts
{
  status: 'accepted' | 'completed' | 'error'
  runId: string
  childConversationId: string
  note: string
  modelApplied?: boolean
}
```

默认语义：

- `autoAnnounce = true`
- `waitForCompletion = false`

也就是：

- 模型一旦 spawn，立即拿到 runId。
- 不要让模型原地轮询。
- 完成结果由宿主 later push 回来。

### 7.2 `subagents`

建议工具名：

- `mcp__local-tools__subagents`

输入建议：

```ts
{
  action: 'list' | 'wait' | 'send' | 'kill' | 'info'
  target?: string
  message?: string
  timeoutSeconds?: number
}
```

说明：

- `list`：列出当前父会话名下的子 run
- `wait`：按 runId 等待一个子 run 完成
- `send`：对子 agent 发控制消息
- `kill`：终止 run
- `info`：获取详情

第一版不一定要做 `steer`，`send` 足够。

## 八、与当前代码库的结合方式

## 8.1 最重要的前置重构：把 `send-message.ts` 拆出通用 runner

当前 `sendMessage()` 最大的问题是它把这几件事绑死在一起了：

1. 用户消息落库
2. assistant placeholder 创建
3. SDK session 获取
4. 流式处理
5. thought/tool/result 事件转发
6. 完成态落库

如果不先拆，子 agent 只能硬复用用户会话逻辑，会非常别扭。

建议重构：

- 保留 `sendMessage()` 作为面向用户会话的 facade
- 抽出一个新的底层 runner，例如：
  - `src/main/services/agent/runner.ts`

建议接口：

```ts
export interface AgentRunOptions {
  spaceId: string
  conversationId: string
  message: string
  messagePrefix?: string
  resumeSessionId?: string
  images?: ImageAttachment[]
  attachments?: Attachment[]
  aiBrowserEnabled?: boolean
  thinkingEffort?: ThinkingEffort
  persistUserMessage?: boolean
  createAssistantPlaceholder?: boolean
  emitRendererEvents?: boolean
  onEvent?: (event: AgentRunEvent) => void
}

export async function runAgentTurn(
  mainWindow: BrowserWindow | null,
  options: AgentRunOptions
): Promise<AgentRunResult>
```

`sendMessage()` 只负责：

- `persistUserMessage = true`
- `createAssistantPlaceholder = true`
- `emitRendererEvents = true`

而 subagent runtime 调用时可以是：

- `persistUserMessage = false`
- `createAssistantPlaceholder = false`
- `emitRendererEvents = false`
- 通过 `onEvent` 自己接管生命周期

这是整个方案能落地的关键。

## 8.2 建议新增模块

建议在当前仓库新增：

```text
src/main/services/agent/subagent/
  types.ts
  registry.ts
  persistence.ts
  runtime.ts
  announce.ts
  prompt.ts
```

### `types.ts`

定义：

- `SubagentRun`
- `SubagentRunStatus`
- `SubagentSpawnInput`
- `SubagentControlInput`
- `SubagentAnnounceEvent`

### `registry.ts`

负责内存态：

- register
- update
- complete
- fail
- kill
- listByParentConversation
- getRun

### `persistence.ts`

负责磁盘持久化。

建议存储位置不要放在用户 workspace。

建议路径：

- 桌面应用正式环境：`app.getPath('userData')/subagents/<spaceId>/runs.json`
- 临时空间：继续落在当前 app data/temp 树下

原因：

1. 不污染用户项目目录。
2. 与当前 conversation/session 存储风格一致。
3. 更适合恢复。

### `runtime.ts`

负责：

- spawn child run
- run child agent turn
- 聚合 child run event
- 触发 announce
- 提供 `wait / list / send / kill`

### `announce.ts`

负责：

- child run 完成后的回推策略
- 判断是否还有 sibling 在跑
- 给父会话构造 internal completion event

### `prompt.ts`

负责：

- subagent system prompt
- internal announce prompt
- wait/merge policy prompt

## 8.3 建议修改的现有文件

### 主进程

- `src/main/services/agent/send-message.ts`
  - 拆 runner
  - 支持 internal/non-persist message 模式
- `src/main/services/agent/types.ts`
  - 增加 subagent 相关类型
- `src/main/services/agent/index.ts`
  - 导出 subagent runtime API
- `src/main/services/agent/permission-handler.ts`
  - 为 `subagent_spawn / subagents` 加权限控制
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 注册 `subagent_spawn` / `subagents`
- `src/main/services/local-tools/tool-catalog.ts`
  - 把新工具加入 catalog
- `src/main/ipc/agent.ts`
  - 增加 UI 查询 subagent run 的接口

### 渲染层

- `src/preload/index.ts`
  - 新增 `agent:subagent-update` 订阅
- `src/renderer/api/index.ts`
  - 包装 subagent IPC / 事件
- `src/renderer/App.tsx`
  - 监听 `agent:subagent-update`
- `src/renderer/stores/chat.store.ts`
  - 增加 `subagentRunMap`
- `src/renderer/components/chat/LinearStream.tsx`
  - 渲染 subagent run 卡片
- `src/renderer/components/tool/AgentTaskCard.tsx`
  - 可扩展复用为通用 `AgentRunCard`

## 九、关键事件流设计

建议新增事件：

```ts
agent:subagent-update
```

payload 建议：

```ts
{
  spaceId: string
  conversationId: string           // 父会话
  runId: string
  childConversationId: string
  label?: string
  task: string
  status: 'queued' | 'running' | 'waiting_announce' | 'completed' | 'failed' | 'killed' | 'timeout'
  latestSummary?: string
  resultSummary?: string
  error?: string
  tokenUsage?: {...}
  startedAt?: string
  endedAt?: string
}
```

这样前端完全不需要理解 Claude Code 的 team event 格式，只需要理解平台自己的 subagent lifecycle。

## 十、最难的一点：internal auto-announce 怎么做

这是本方案的关键点，也是当前项目里最需要单独设计的地方。

### 10.1 当前限制

当前 `sendMessage()` 默认会：

1. 把输入当用户消息持久化
2. 创建 assistant placeholder

这不适合子 agent completion 回推，因为 completion event 不是用户输入。

### 10.2 建议做法

在 runner 层加入“内部消息模式”：

```ts
persistUserMessage = false
createAssistantPlaceholder = false
internalMessageKind = 'subagent_completion'
```

然后子 agent 完成后：

1. `announce.ts` 生成一个内部 completion payload
2. 把这个 payload 组织成 runtime-only message
3. 通过 parent conversation 的 lane queue 排队送回父 session
4. 父 session 再决定：
   - 继续等待其他子任务
   - 或输出汇总结果

推荐 internal payload 结构：

```xml
<subagent_completion>
  <run_id>...</run_id>
  <task>...</task>
  <status>completed</status>
  <summary>...</summary>
  <result>...</result>
  <active_sibling_runs>2</active_sibling_runs>
</subagent_completion>
```

推荐配套提示词：

1. 如果 `active_sibling_runs > 0`，不要立即给用户最终答复。
2. 如果该子结果只是中间结果，把它当内部编排事件处理。
3. 不要把 XML 原样暴露给用户。

### 10.3 为什么不建议第一版直接“写一条用户可见消息”

如果子 agent 完成后只是直接往聊天里追加一句：

- “子 agent 已完成：xxx”

那这个信息只对用户可见，对主 agent 没有上下文回流价值。

这会让：

- 主 agent 仍然需要主动 list / wait
- 或用户自己手动继续问

这不等价于 OpenClaw 的 announce flow。

所以建议第一版就做 internal announce，不要只做 UI toast。

## 十一、权限与安全策略

建议沿用当前 `permission-handler.ts` 模式。

### 11.1 `subagent_spawn`

建议默认行为：

- `permissions.commandExecution === deny` 时，禁止
- `ask` 时，弹确认
- `trustMode` 或 `allow` 时，自动通过

确认文案建议：

- `Launch hosted sub-agent: ${label || task}`

### 11.2 限制项

建议增加这些限制：

1. 最大并发子 run 数：
   - 全局默认 `4`
   - 每个父会话默认 `4`
2. 最大嵌套深度：
   - MVP 先固定为 `1`
3. 默认禁止子 agent 再 spawn 子 agent：
   - 即先不做 nested subagents
4. 默认子 agent 不允许直接开启 web research 的 hosted server-side tool，仍要求走 app-local MCP web tools

## 十二、UI 设计建议

建议不要把 host-managed subagent 继续塞进 `Task` UI 语义里。

建议前端抽象成：

- `AgentRunCard`

统一展示：

- 当前状态
- 任务描述
- 最新 summary
- 结果摘要
- 用时
- token/cost
- send / kill 操作入口

然后：

- Claude SDK 原生 `Task` 事件可以继续显示为现有 `AgentTaskCard`
- 宿主层 `subagent` 则显示为 `AgentRunCard`

后续如果你决定逐步淘汰 TeamCreate，就只保留 `AgentRunCard` 这一套。

## 十三、推荐实施阶段

## 阶段 0：完成态兜底

已经做过的前端 complete 兜底要保留，但这只是 UI 修复，不是 subagent runtime。

## 阶段 1：抽出通用 runner

目标：

- 让 agent 执行引擎能被用户消息和内部子 run 复用

交付物：

- `runner.ts`
- `send-message.ts` 降级为 facade

这是必做项。

## 阶段 2：实现最小 subagent runtime

目标：

- 能 spawn 一个后台子 run
- 能 list / wait / kill
- 有 registry
- 有 UI 卡片

这阶段先不做 internal announce，也能先验证执行闭环。

交付物：

- `subagent_spawn`
- `subagents(list|wait|kill|info)`
- `agent:subagent-update`

## 阶段 3：实现 internal auto-announce

目标：

- 子 run 完成后自动回推父会话
- 父会话根据 remaining active runs 决定继续等待还是汇总输出

这一步做完，才真正接近 OpenClaw 的体验。

## 阶段 4：实现 send/steer

目标：

- 主会话或用户可以对子 run 发送纠偏指令

交付物：

- `subagents(action=send)`

## 阶段 5：可选做 session 模式

如果以后要做持久 thread/session 绑定，再做：

- `mode = "session"`
- thread-bound subagent session

这一阶段不是当前 MVP 的必须项。

## 十四、建议的最小 MVP 范围

如果按性价比排序，MVP 建议只做下面这些：

1. 抽通用 runner
2. `subagent_spawn`
3. `subagents(list|wait|kill|info)`
4. registry + persistence
5. `agent:subagent-update`
6. UI `AgentRunCard`
7. internal auto-announce

可以不做的：

1. nested subagents
2. thread-bound session
3. steer/send
4. 跨渠道交付路由

## 十五、关键伪代码

### 15.1 spawn

```ts
async function spawnSubagent(parentConversationId, input) {
  const run = registry.create({
    parentConversationId,
    childConversationId: `subagent-${uuid()}`,
    task: input.task,
    status: 'queued'
  })

  emitSubagentUpdate(run)

  queueMicrotask(async () => {
    registry.markRunning(run.runId)
    emitSubagentUpdate(run)

    const result = await runAgentTurn({
      spaceId: run.parentSpaceId,
      conversationId: run.childConversationId,
      message: buildChildTaskMessage(run.task),
      persistUserMessage: false,
      createAssistantPlaceholder: false,
      emitRendererEvents: false,
      onEvent: (evt) => updateSubagentProgress(run.runId, evt)
    })

    registry.complete(run.runId, result)
    emitSubagentUpdate(run)

    if (run.autoAnnounce) {
      await announceSubagentCompletion(run)
    }
  })

  return {
    status: 'accepted',
    runId: run.runId,
    childConversationId: run.childConversationId,
    note: 'Subagent accepted. It will auto-announce on completion.'
  }
}
```

### 15.2 announce

```ts
async function announceSubagentCompletion(run) {
  const siblingActive = registry.countActiveByParent(run.parentConversationId, run.runId)

  await runAgentTurn({
    spaceId: run.parentSpaceId,
    conversationId: run.parentConversationId,
    message: buildSubagentCompletionEvent(run, siblingActive),
    persistUserMessage: false,
    createAssistantPlaceholder: false,
    emitRendererEvents: true
  })
}
```

## 十六、和 OpenClaw 的对应关系

| OpenClaw | SkillsFanApp 建议实现 |
|---|---|
| `sessions_spawn` | `mcp__local-tools__subagent_spawn` |
| `subagents` | `mcp__local-tools__subagents` |
| subagent registry | `src/main/services/agent/subagent/registry.ts` |
| announce flow | `src/main/services/agent/subagent/announce.ts` |
| 独立 child session | internal child `conversationId` + 独立 V2 session |
| push-based completion | internal announce via parent lane queue |

要借鉴的是机制，不是名字。

## 十七、风险与规避

### 风险 1：当前 runner 耦合太深

规避：

- 先抽 runner，再谈 subagent runtime。

### 风险 2：子会话与用户 conversation 存储混淆

规避：

- 子 run 元数据单独存 registry
- child conversation 标记为 internal，不进入普通会话列表

### 风险 3：announce 再次触发可见用户 placeholder

规避：

- internal message 模式必须禁止 `persistUserMessage` 和 assistant placeholder 自动创建

### 风险 4：父会话正在跑，子完成事件插不进去

规避：

- 走当前 `agentQueue` 同 conversation lane
- completion event 入队，而不是直接并发写同一个 V2 session

### 风险 5：模型把 internal event 原样复述给用户

规避：

- internal payload 用结构化 XML
- system prompt 显式禁止暴露内部事件块
- announce prompt 明确要求“改写为正常 assistant voice”

## 十八、最终建议

对 `SkillsFanApp` 来说，真正可行的方案不是“继续调 prompt，让模型更会用 TeamCreate”，而是：

1. 把 Claude Code SDK 当成执行引擎。
2. 把 subagent orchestration 提升到应用宿主层。
3. 用本地 MCP 工具把这套 orchestration 暴露给模型。
4. 用 registry、announce、UI 和权限系统把它产品化。

如果按工程收益排序：

1. 先抽 runner
2. 再做 host-managed subagent runtime
3. 再做 internal announce

这 3 步做完之后，你就有一套真正“通用”的子 Agent 调用能力了。
