# SkillsFanApp Hosted Subagent 产品化实施方案

更新时间：2026-03-10

## 文档目的

这份文档回答两个问题：

1. 当前 `SkillsFanApp` 的 hosted subagent runtime 已经做到什么程度。
2. 如果要把它做成“用户可感知、可控、可恢复、可复用”的正式能力，接下来还差什么，以及应该怎么做。

这不是底层设计复述文档。底层设计和 OpenClaw 借鉴关系已经写在：

- `docs/subagent-runtime-design.zh-CN.md`

这份文档更偏向：

- 产品能力差距
- 用户体验差距
- 下一阶段实施顺序
- 每阶段的技术方案
- 验收标准

---

## 一、当前状态

截至当前版本，hosted subagent runtime 已经具备以下能力：

1. 宿主层 `spawn / list / wait / kill`
2. 本地 MCP 工具：
   - `mcp__local-tools__subagent_spawn`
   - `mcp__local-tools__subagents`
3. 子 agent 的宿主级 registry
4. 父会话下的 hosted subagent 运行卡片展示
5. 子 agent 结束后的宿主 auto-announce
6. `subagents(wait/info/list)` 的去重确认，避免重复汇报
7. 停止父会话时，自动停止 hosted subagents 并抑制 auto-announce
8. run metadata 持久化到 app data，并在应用重启后恢复显示

当前它已经不是“模型碰巧会用的技巧”，而是一个真实存在的宿主能力。

---

## 二、当前还差什么

差距主要分成两类：

1. 用户体验层差距
2. 功能能力层差距

### 2.1 用户体验层差距

#### A. 没有真正的一等操控界面

现在用户能看到 hosted subagent 的状态，但还没有一套完整的操作面板。

当前缺少：

- `重试`
- `重新运行`
- `打开子会话`
- `查看完整结果`
- `复制结果`
- `查看运行参数`
- `查看 token / cost / duration`

问题本质：

- 现在用户能“看见它”，但还不能真正“控制它”。

#### B. 父子链路不够清晰

现在前端能展示 run 卡片，但“父消息 -> 触发哪个 hosted subagent -> 哪个结果被汇总进最终答复”这条链路不够直观。

用户难以快速回答：

- 这个最终回答来自哪些子 agent？
- 哪个子 agent 失败了？
- 哪个子 agent 的结果被采用了？

#### C. 重启恢复体验还不够平滑

现在应用重启后：

- run metadata 会恢复
- 未完成 run 会被标成“因应用重启中断”

这比“假装还在运行”强很多，但对用户来说还不够理想。

用户更希望看到的是：

- 明确提示“此 run 因应用关闭中断”
- 一键重新运行
- 如果父任务仍然有意义，支持重新汇总

#### D. 缺少设置入口

当前并发、超时、默认模型、是否自动汇总等行为主要是代码内策略。

用户侧没有配置面板去控制：

- hosted subagent 默认超时
- 默认并发上限
- 是否自动向父会话回灌
- 默认是否允许模型覆盖子 agent 模型

---

### 2.2 功能能力层差距

#### A. 还不能 steer/send

当前 hosted subagent 支持：

- `spawn`
- `list`
- `wait`
- `kill`

但不支持：

- 对运行中的 child run 追加指令
- 对已完成 child run 要求补充内容
- 对 child run 发新的子任务轮次

这意味着它还不是完整的“通用子 agent 会话”。

#### B. 还没有标准化 retry / rerun 语义

当前如果一个 run 失败，更合理的产品动作其实是：

- 以同样任务参数重新启动一个新 run

但现在这还没有被包装成正式动作。

缺少：

- `retry` 按钮
- `rerun with edits`
- `rerun on another model`

#### C. 还不能跨重启恢复底层子 session

当前恢复的是：

- registry
- UI 可见状态
- 可解释错误结果

当前不能恢复的是：

- child Claude session 进程本身
- child session 的 in-memory context
- 已在执行中的中间 tool 状态

这意味着当前恢复能力属于：

- “状态恢复”

而不是：

- “执行恢复”

#### D. 还没有 nested subagents

当前明确只支持一层 hosted subagent。

这是一种正确的 MVP 约束，但如果未来要支持更复杂的编排，还需要：

- run depth
- parent run id
- nested auto-announce 策略
- 更严格的并发和死锁控制

#### E. 还没有批次语义

现在 runtime 是按 `parentConversationId` 聚合。

这已经够用，但当父会话连续多轮发起 hosted subagent 时，会有一个产品问题：

- 哪些 run 属于同一次 fan-out？
- 哪一次汇总对应哪一批子 agent？

建议后续引入：

- `batchId`

这样可以更清晰地区分：

- 第 1 批 hosted subagents
- 第 2 批 hosted subagents
- 每批的最终汇总结果

---

## 三、目标状态

最终想要达到的不是“又多了两个工具”，而是下面这种能力：

1. 用户把 hosted subagent 当成正式产品能力使用
2. 主 agent 能稳定调用 hosted subagent 完成拆解任务
3. 用户可以可视化地看到每个子 run 的状态、结果和归属
4. 用户可以干预每个子 run
5. 失败后有明确恢复路径
6. provider 差异被尽可能压缩到最低

一句话：

把 hosted subagent 从“runtime feature”升级成“可控的产品功能”。

---

## 四、分阶段实施路线

建议分 5 个阶段做，不要一次性上所有能力。

### 阶段 1：一等 UI 化

这是最该优先做的阶段。

目标：

- 让 hosted subagent 成为前端的一等对象

#### 1.1 新的 UI 抽象

建议新增：

- `HostedSubagentCard`
- `HostedSubagentDetailSheet`

不要继续把它混在 SDK `Task` 卡片语义里。

建议展示字段：

- `label`
- `task`
- `status`
- `latestSummary`
- `resultSummary`
- `error`
- `spawnedAt`
- `startedAt`
- `endedAt`
- `durationMs`
- `model`
- `modelSource`
- `thinkingEffort`
- `tokenUsage`
- `announcedAt`

#### 1.2 卡片交互

每个 run 卡片至少要有：

- `查看详情`
- `终止`
- `重新运行`
- `复制结果`

完成态额外支持：

- `在新消息中插入结果`
- `打开子会话`

#### 1.3 父子链路展示

每个 hosted subagent card 需要展示：

- 是由哪个 tool use 触发
- 属于哪一批 run
- 最终是否已被 announce / consumed

建议新增字段：

- `batchId?: string`
- `originToolUseId?: string`
- `consumedByParentTurnId?: string`

#### 1.4 Detail Sheet

详情抽屉中展示：

- 完整任务内容
- 完整结果
- 错误栈摘要
- token / cost / duration
- 子会话 id
- 父会话 id
- 重试入口

#### 1.5 技术落点

前端建议新增：

- `src/renderer/components/subagent/HostedSubagentCard.tsx`
- `src/renderer/components/subagent/HostedSubagentDetailSheet.tsx`
- `src/renderer/components/subagent/HostedSubagentList.tsx`

当前文件改造：

- `src/renderer/components/chat/LinearStream.tsx`
- `src/renderer/components/chat/MessageList.tsx`
- `src/renderer/stores/chat.store.ts`

#### 1.6 验收标准

- 用户能一眼看出 hosted subagent 的状态
- 用户能直接对 run 执行 `终止 / 重试 / 查看详情`
- 用户能看出某个最终答复来自哪些 hosted subagents

---

### 阶段 2：标准化 retry / rerun

这是最重要的功能增强。

目标：

- 让失败和中断 run 有明确恢复路径

#### 2.1 区分三种动作

建议明确区分：

1. `retry`
   - 同参数重新跑
2. `rerun_with_patch`
   - 编辑 task 后重新跑
3. `rerun_on_model`
   - 改模型后重新跑

这三者不要混在一个按钮里。

#### 2.2 后端实现方式

不要尝试复活旧 run。

正确方式是：

- 旧 run 保持终态
- 新建一个新 run
- 在新 run 上记录：
  - `replacesRunId`
  - `retryOfRunId`

建议扩展数据结构：

```ts
retryOfRunId?: string
replacesRunId?: string
batchId?: string
```

#### 2.3 Tool / IPC / UI

建议新增后端能力：

- `rerunSubagentRun(runId, overrides?)`

前端新增动作：

- `Retry`
- `Edit and Rerun`
- `Run on Another Model`

#### 2.4 验收标准

- 用户可以从失败 run 一键发起新 run
- UI 能看出新旧 run 关系
- 父会话不会把 retry 结果和旧结果混淆

---

### 阶段 3：steer / send

这是 hosted subagent 成为“通用子 agent”必须补的部分。

目标：

- 允许父 agent 或用户给 child run 继续下指令

#### 3.1 建议语义

给 `subagents` 增加：

- `action=send`

入参建议：

```ts
{
  action: 'send'
  runId: string
  message: string
}
```

#### 3.2 两种实现路径

##### 路径 A：继续复用 child conversation session

如果 child session 还活着：

- 直接向 child session 追加新消息

优点：

- 语义更像真正的子 agent 会话

缺点：

- 会显著增加状态复杂度
- 要处理 child run 正在跑、等待中、已完成但 session 仍存活等问题

##### 路径 B：steer 视为创建新 follow-up run

也就是：

- 不往旧 child session 续消息
- 而是创建一个新的 child run
- 它引用旧 run 的结果作为上下文

优点：

- 更稳
- 更容易恢复

缺点：

- 严格来说它不是“同一个 session”

建议：

- 第一版采用路径 B
- 真正的 thread-bound child session 续聊留到更后面

#### 3.3 UI 设计

在详情面板中增加：

- `继续追问`
- `要求补充`
- `要求改写`

#### 3.4 验收标准

- 用户能针对某个 run 补一条新指令
- 新 run 与原 run 关系清晰
- 不破坏父会话已有总结

---

### 阶段 4：批次语义与汇总体验

目标：

- 把“同一轮 fan-out”做成正式概念

#### 4.1 为什么要做 batch

没有 batch 时，父会话如果在第 1 轮启动 4 个子 agent，第 2 轮再启动 2 个，就容易混淆：

- 哪些 run 属于哪一次分解？
- 哪次 announce 对应哪批结果？

#### 4.2 建议新增字段

```ts
batchId: string
batchLabel?: string
originParentTurnId?: string
```

#### 4.3 批次展示

UI 上建议按 batch 分组：

- Batch A
- Batch B

每个 batch 展示：

- run 数
- 完成数
- 失败数
- 汇总输出是否已生成

#### 4.4 汇总动作

给 batch 层增加：

- `等待全部完成`
- `立即汇总当前结果`
- `重新汇总`

这会大幅提升复杂任务体验。

#### 4.5 验收标准

- 多批次 hosted subagent 不会在 UI 和汇总上互相污染
- 用户能对一整批 run 做管理和重新汇总

---

### 阶段 5：设置面板与策略层

目标：

- 让 runtime 行为从代码常量变成产品配置

#### 5.1 建议新增配置项

建议新增：

```ts
subagents?: {
  enabled: boolean
  defaultTimeoutMs: number
  maxConcurrentGlobal: number
  maxConcurrentPerConversation: number
  autoAnnounce: boolean
  autoAnnounceRetryCount: number
  allowModelOverride: boolean
  allowNested: boolean
}
```

#### 5.2 设置页入口

建议在设置里单独增加：

- `Subagents`

至少允许用户改：

- 默认超时
- 默认并发
- 是否自动汇总
- 是否允许模型覆盖 child model

#### 5.3 权限策略

目前权限基本是代码内规则，后续要明确成产品策略：

- 是否允许 hosted subagent 执行命令
- 是否允许使用 AI Browser
- 是否允许访问联网工具
- 是否允许自动 rerun

#### 5.4 验收标准

- 非开发者用户也能理解并调整 hosted subagent 行为
- 不同使用场景下可以通过设置收敛策略风险

---

## 五、暂时不建议优先做的东西

下面这些不是不能做，而是不建议先做。

### 5.1 跨重启恢复 child Claude session

这是成本最高、收益不一定最优的部分。

原因：

- Claude session 恢复不只是恢复元数据
- 还涉及进程、流状态、tool state、resume token、上下文一致性

当前更务实的做法是：

- 恢复 registry
- 把运行中 run 标成中断失败
- 提供一键 rerun

### 5.2 nested subagents

第一阶段不要做。

原因：

- 容易导致无限 fan-out
- 容易引入复杂锁与批次传播问题
- 前端也难以展示

### 5.3 与 TeamCreate 双轨深度融合

当前建议是：

- 保留 TeamCreate 兼容
- 但正式能力优先 hosted subagent

不要先做“Team 和 Hosted Subagent 混编”的复杂 orchestrator。

---

## 六、建议的数据模型增量

在当前 `SubagentRun` 基础上，建议后续逐步增加：

```ts
export interface SubagentRun {
  runId: string
  parentConversationId: string
  parentSpaceId: string
  childConversationId: string
  status: 'queued' | 'running' | 'waiting_announce' | 'completed' | 'failed' | 'killed' | 'timeout'

  task: string
  label?: string

  model?: string
  modelSource?: string
  thinkingEffort?: string

  spawnedAt: string
  startedAt?: string
  endedAt?: string
  announcedAt?: string

  latestSummary?: string
  resultSummary?: string
  error?: string

  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalCostUsd?: number
  }

  toolUseId?: string

  // 建议新增
  batchId?: string
  batchLabel?: string
  retryOfRunId?: string
  replacesRunId?: string
  originParentTurnId?: string
  consumedByParentTurnId?: string
}
```

---

## 七、建议的模块落点

### 7.1 后端

建议新增或拆分：

- `src/main/services/agent/subagent/runtime.ts`
- `src/main/services/agent/subagent/persistence.ts`
- `src/main/services/agent/subagent/announce.ts`
- `src/main/services/agent/subagent/rerun.ts`
- `src/main/services/agent/subagent/batch.ts`

当前 `runtime.ts` 已经承担较多职责，后续继续扩展会变重。建议逐步拆分：

- `runtime.ts`
  - 外部 API
- `persistence.ts`
  - 持久化
- `announce.ts`
  - auto-announce
- `batch.ts`
  - fan-out / fan-in 语义

### 7.2 前端

建议新增：

- `src/renderer/components/subagent/HostedSubagentCard.tsx`
- `src/renderer/components/subagent/HostedSubagentDetailSheet.tsx`
- `src/renderer/components/subagent/HostedSubagentBatch.tsx`

当前 store 扩展：

- `src/renderer/stores/chat.store.ts`

建议增加：

- selected run
- selected batch
- detail sheet state
- rerun form state

---

## 八、建议的 API / IPC 增量

当前已有事件：

- `agent:subagent-update`

后续建议增加：

- `agent:subagent-batch-update`
- `agent:subagent-consumed`

后端 API 建议增加：

1. `rerunSubagentRun(runId, overrides?)`
2. `sendSubagentMessage(runId, message)`
3. `getSubagentRunDetail(runId)`
4. `summarizeSubagentBatch(batchId)`

---

## 九、测试计划

### 9.1 必测场景

1. 单个 hosted subagent 成功完成
2. 多个 hosted subagents 并发完成
3. 一个成功一个失败
4. 父会话停止时 hosted subagents 一起停止
5. 父 agent 主动 `wait/info/list` 后不重复 auto-announce
6. 应用重启后 registry 恢复
7. 重启后未完成 run 被标记为中断失败
8. rerun 后新旧 run 关系正确
9. 同一父会话多批次 run 不串线

### 9.2 回归风险

重点回归：

- lane queue 是否被 internal message 搞乱
- `agent:complete` 是否会再次出现“已结束但前端还在生成”
- 前端 conversation reload 是否会覆盖 hosted subagent 运行态
- auto-announce 和手动 `wait` 是否重复

---

## 十、推荐优先级

如果你只做接下来三件事，建议顺序是：

1. 一等 UI 化
2. retry / rerun
3. steer / send

原因：

- 这三件事最直接提升用户感知
- 它们会让 hosted subagent 从“底层能力”变成“日常可用功能”
- 相比恢复 child Claude session，这三件事投入产出更高

---

## 十一、最终建议

### 11.1 短期建议

接下来一轮开发建议做：

1. `HostedSubagentCard + DetailSheet`
2. `rerun / retry`
3. `batchId`

这会立刻把当前 runtime 变成一个像样的可用功能。

### 11.2 中期建议

第二轮建议做：

1. `subagents(action=send)` 或 follow-up run
2. 设置面板
3. 批次汇总动作

### 11.3 长期建议

最后再考虑：

1. nested subagents
2. 真正跨重启恢复 child execution
3. TeamCreate 与 hosted subagent 的高级编排融合

---

## 十二、结论

当前 hosted subagent runtime 的“底层骨架”已经基本成立。

接下来缺的不是再造一个 runtime，而是把它产品化：

- 能看
- 能控
- 能恢复
- 能重跑
- 能解释

真正最值得继续投的方向，不是“更复杂的底层编排”，而是：

- 一等 UI
- rerun / retry
- steer / send
- batch 化管理

把这几层做完，hosted subagent 才会从“工程实现”变成“用户真正会依赖的能力”。
