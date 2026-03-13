# SkillsFan 最终运行时与自动化架构设计

## 1. 这份文档解决什么问题

这份文档用来明确 SkillsFan 后续长期实现应遵循的最终结构，重点回答 4 个问题：

- `Claude Code SDK` 后续是否保留
- 浏览器与电脑自动操作能力应该归属于哪一层
- `Claude SDK Runtime` 和 `NativeRuntime` 应该如何分工
- 后续实现时，哪些能力必须共享，哪些能力允许分流

这不是阶段性迁移记录，而是后续实现都应尽量对齐的长期架构决策。

---

## 2. 核心结论

结论先说：

1. `Claude SDK Runtime` 不删除，长期保留
2. `NativeRuntime` 继续建设，但不替代 `Claude SDK Runtime`
3. 浏览器、电脑、终端、iTerm 这类自动操作能力，统一放在 SkillsFan 自己的平台层
4. 多 agent、skill、agent team、复杂工具编排，优先走 `Claude SDK Runtime`
5. 非 Claude 模型原生接入、轻量任务、provider-native 体验，优先走 `NativeRuntime`

一句话总结：

**Claude SDK Runtime 负责复杂编排，NativeRuntime 负责原生模型接入，HostRuntime/Tool Runtime 负责共享的手和眼。**

---

## 3. 最终结构

长期目标不是“所有能力都塞进一个 runtime”，而是形成三层分工：

### 3.1 控制层

- `SkillsFan App`
- 聊天 UI
- 设置页
- 任务列表
- 步骤回放
- 诊断入口

这一层负责展示和控制，不负责真正执行自动化。

### 3.2 执行与调度层

- `Gateway`
- `Sessions`
- `Command Runtime`
- `Daemon / Doctor`
- `Route / sessionKey / session store`

这一层负责：

- 持续执行
- 路由
- 状态持久化
- 诊断
- 恢复

### 3.3 运行时与宿主层

- `Claude SDK Runtime`
- `NativeRuntime`
- `HostRuntime`
- `Tool Registry`

这一层负责：

- 真正调用模型
- 真正调用工具
- 真正操作浏览器和电脑

---

## 4. 角色分工

## 4.1 Claude SDK Runtime

`Claude SDK Runtime` 的定位不是“默认模型实现”，而是 **复杂编排运行时**。

它长期负责：

- 多 agent
- subagent
- agent team
- skills
- 复杂工具链组合
- 长链路任务执行
- Claude 风格 coding / orchestration 场景

它应该继续保留，不能因为 `NativeRuntime` 出现就被删除。

原因很明确：

- 当前 `Claude Code SDK` 在多 agent 和 skill 组合上成熟度更高
- 复杂任务的工具编排能力已经经过现有产品验证
- 如果把这层删除，后续会把已经成熟的 orchestration 能力一起删掉

### 长期原则

- `Claude SDK Runtime` 是一条独立 lane
- 复杂任务允许强制路由到这条 lane
- 即使后续 `NativeRuntime` 成熟，也不要求它替代这条 lane

---

## 4.2 NativeRuntime

`NativeRuntime` 的定位不是“重写 Claude SDK”，而是 **provider-native 运行时**。

它长期负责：

- OpenAI / Codex
- Kimi
- GLM
- DeepSeek
- Qwen
- 其他 provider-native 接入

它重点解决的是：

- 非 Claude 模型原生接入
- provider-native 流式返回
- tool-calls 适配
- usage / reasoning / transport 统一
- 简单任务和轻量工具调用

### 长期原则

- `NativeRuntime` 是模型接入扩展面
- 它优先补 provider-native，不优先重造 multi-agent orchestration
- 当能力不足时，应允许 fallback 到 `Claude SDK Runtime`

---

## 4.3 HostRuntime

`HostRuntime` 的定位是 **共享宿主能力层**，也就是“手和眼”。

它统一负责：

- 浏览器自动化
- 桌面自动化
- 终端 / iTerm 自动化
- 截图
- UI tree / perception
- step reporter
- host status

也就是说：

- 浏览器操作不属于 `Claude SDK Runtime`
- 电脑操作不属于 `NativeRuntime`
- 它们都属于 `HostRuntime`

### 长期原则

- 任意 runtime 都不能各自维护一套独立桌面/浏览器自动化实现
- 宿主能力必须是平台公共层
- 更换模型时，不应该重做“会操作电脑”这件事

---

## 4.4 Tool Registry

`Tool Registry` 的定位是 **共享工具层**。

它负责把：

- browser tools
- desktop tools
- local tools
- skill tools
- extension tools

统一成一套 runtime-agnostic 的工具定义。

### 长期原则

- `Claude SDK Runtime` 和 `NativeRuntime` 必须共用同一套工具注册表
- 权限、上下文、结果格式、错误模型要统一
- 不能让每个 runtime 自己拼一套 MCP / tool 注入逻辑

---

## 5. 浏览器和电脑自动操作到底放哪

最终答案很明确：

**放在 SkillsFan 自己的平台层，不放在某个单独 runtime 里。**

也就是：

- 自动操作能力属于 `HostRuntime`
- 对外暴露和权限管理属于 `Tool Registry`
- `Claude SDK Runtime` 与 `NativeRuntime` 只是调用者

### 为什么不能直接绑在 Claude SDK 上

如果绑死在 `Claude SDK Runtime` 上，会出现 3 个问题：

1. `NativeRuntime` 无法自然复用
2. 工具平台和 Claude orchestration 耦合过深
3. 后续做混合路由时返工会很大

### 为什么也不能直接全塞给 NativeRuntime

因为当前强项不是 NativeRuntime 编排，而是 Claude SDK 的复杂任务 orchestration。

如果现在把浏览器和电脑自动化完全押在 NativeRuntime 上，会导致：

- complex workflow 回退
- skills / multi-agent 调用能力下降
- 用户最成熟的那条链路失去稳定性

### 所以正确做法是

- 自动操作能力统一放平台层
- 复杂调用优先由 `Claude SDK Runtime` 调
- 轻任务和非 Claude provider 可由 `NativeRuntime` 调

---

## 6. 任务路由原则

后续 RuntimeOrchestrator 应按“任务类型”路由，而不是只按“用户选了什么模型”路由。

建议长期采用下面这组原则。

### 6.1 优先走 Claude SDK Runtime 的任务

- subagent
- agent team
- skills
- 多阶段工具编排
- 长链路任务
- 复杂 coding 任务
- 需要稳定 orchestration 的浏览器/电脑自动化任务

这些任务的共同点是：

- 不只是调用一个模型
- 不只是单次 tool call
- 更依赖任务编排能力，而不是 provider-native transport

### 6.2 优先走 NativeRuntime 的任务

- 普通聊天
- 简单问答
- 单步或短链路工具调用
- 非 Claude 模型原生调用
- 对 provider-native 体验敏感的任务

这些任务的共同点是：

- 任务结构简单
- 编排复杂度低
- 更看重模型原生体验和接入范围

### 6.3 必须 fallback 到 Claude SDK Runtime 的情况

- NativeRuntime 不支持所需工具能力
- NativeRuntime 不支持所需多 agent / team / skill 流程
- NativeRuntime 不支持当前 provider 所需行为
- 当前任务被显式标记为复杂编排任务

---

## 7. 从用户视角看，后续该怎么理解

用户不需要理解 runtime 名字，但产品行为上应该体现为：

### 7.1 对用户可见的产品能力

- AI 能操作浏览器
- AI 能操作电脑和终端
- AI 能在复杂任务里调动 subagent / skill / team
- AI 能在不同模型之间切换

### 7.2 对用户不可见但必须成立的原则

- 换模型不应该导致浏览器/电脑自动化能力丢失
- 复杂任务不应该因为切到 native provider 就失去 orchestration
- 同一个工具调用在不同 runtime 下应尽量表现一致

---

## 8. 最终建议的代码边界

建议长期保持下面这组模块边界：

```text
src/gateway/
  runtime/
    claude-sdk/
    native/
    orchestrator.ts
  host-runtime/
    browser/
    desktop/
    perception/
    step-reporter/
    status/
  tools/
    registry/
    providers/
    permissions/
  sessions/
  server/
  automation/
  commands/
  daemon/
  doctor/
```

### 各层职责

- `runtime/claude-sdk`
  - Claude SDK lane
- `runtime/native`
  - provider-native lane
- `host-runtime/*`
  - 浏览器 / 电脑 / perception / steps
- `tools/*`
  - 共享工具注册和权限
- `sessions/*`
  - route / sessionKey / store
- `server/*`
  - gateway 执行宿主

---

## 9. 长期不变的技术决策

下面这些原则建议定成长期约束。

### 9.1 不删除 Claude SDK Runtime

原因：

- 它是当前最成熟的 orchestration lane
- 它承担多 agent / skill / team 能力
- 它不应该因为 provider-native 的推进而被替换掉

### 9.2 不复制两套浏览器/桌面自动化

原因：

- 复制能力会导致维护成本倍增
- runtime 更替时会反复返工
- 行为一致性会越来越差

### 9.3 不要求 NativeRuntime 先实现 Claude SDK 的全部 orchestration

原因：

- 目标不一致
- NativeRuntime 的首要任务是 provider-native
- 如果强行追求一比一替代，会拖慢整体演进

### 9.4 Runtime 负责编排，HostRuntime 负责执行

原因：

- 边界清晰
- 调用者和执行者可分离
- 更适合后续做缓存、回放、诊断、权限控制

---

## 10. 后续实施顺序

如果按这份最终结构实现，建议顺序如下：

1. 保持 `Claude SDK Runtime` 为长期保留 lane
2. 继续完成 `M5` 当前的 `Terminal / Chrome / iTerm` 产品化
3. 实现 `Tool Registry`
4. 开始做 `NativeRuntime v1`
5. 让 `NativeRuntime` 调用共享工具层
6. 引入任务级 runtime 路由策略
7. 再扩 `Finder / SkillsFan` 和后续更多 app adapter

### 当前阶段的实际建议

在当前仓库阶段，不要做：

- 删除 `claude-sdk` runtime
- 把 browser/desktop tools 迁成 native-only
- 为 NativeRuntime 单独再复制一套 tool 注入链

当前更应该做的是：

- 先把共享工具层做出来
- 再让 NativeRuntime 接入
- 复杂任务继续保留走 Claude SDK lane

---

## 11. 简单决策表

| 场景 | 建议 runtime | 原因 |
| --- | --- | --- |
| 普通聊天 | NativeRuntime 或 Claude SDK Runtime | 两者都可，按模型与成本决定 |
| OpenAI / Codex 原生体验 | NativeRuntime | provider-native 优先 |
| skills | Claude SDK Runtime | orchestration 更成熟 |
| subagent / agent team | Claude SDK Runtime | 复杂编排优先 |
| 浏览器单步操作 | 任一 runtime，经 HostRuntime 调用 | 能力属于平台层 |
| 电脑 / 终端单步操作 | 任一 runtime，经 HostRuntime 调用 | 能力属于平台层 |
| 复杂桌面自动化流程 | 优先 Claude SDK Runtime | 编排能力更稳 |
| NativeRuntime 不支持当前任务 | fallback 到 Claude SDK Runtime | 避免能力断层 |

---

## 12. 最终一句话版本

SkillsFan 的最终形态不应该是“用 NativeRuntime 替掉 Claude SDK”，而应该是：

**保留 Claude SDK Runtime 作为复杂编排 lane，建设 NativeRuntime 作为 provider-native lane，并让浏览器、电脑、终端自动化统一沉到 SkillsFan 自己的 HostRuntime / Tool Runtime 平台层。**
