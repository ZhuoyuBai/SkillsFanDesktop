# Gateway 迁移记录

> 说明：这份记录当前采用“历史汇总 + 逐步追加”的方式维护。  
> `Step 1` 到 `Step 13` 是对已完成阶段的整理版摘要；从 `Step 14` 开始继续按增量记录。

## 历史汇总

### Step 1

- `Phase 0 / Phase 1` 启动
- 补 gateway 迁移开关：
  - `gateway.enabled`
  - `gateway.mode`
  - `providers.mode`
  - `plugins.v2.enabled`
  - `channels.v2.enabled`
- 建立 `RuntimeOrchestrator`
- 建立 `HostRuntime` 基础边界

### Step 2

- `Phase 2`
- 把 remote/http 调用边界收口到 `src/gateway/server/*`
- 主进程开始通过 gateway facade 访问 remote 能力

### Step 3

- `Phase 2`
- 增加 embedded gateway lifecycle：
  - `startEmbeddedGateway`
  - `stopEmbeddedGateway`
  - `getEmbeddedGatewayStatus`

### Step 4

- `Phase 2`
- 增加 gateway health / services 聚合入口
- 主进程增加：
  - `gateway:health`
  - `gateway:services`

### Step 5

- `Phase 2`
- 增加 gateway bootstrap
- channels 初始化开始经由 gateway runtime 收口

### Step 6

- `Phase 2`
- automation lifecycle 收口到 gateway
- hosted subagent、loop-task crash recovery、scheduler/retry 关闭路径不再散落在 `main/*`

### Step 7

- `Phase 2` 完成
- loop-task、Ralph、ws、channel manager、host-step channel dispatch 进一步收口
- 形成：
  - embedded gateway
  - channel runtime
  - automation runtime
  - health/services facade

### Step 8

- `Phase 3`
- 建立 route/session 平台对象：
  - `session-key`
  - `resolve-route`
  - `gateway session types`

### Step 9

- `Phase 3`
- 实现内存态 `gateway session store`
- 提供：
  - `create/get/upsert/update/list/delete`
  - `conversationId` 查找与优先 session 选择

### Step 10

- `Phase 3`
- 在 runtime agent 入口增加兼容桥
- `conversationId -> route/sessionKey` 开始写入 gateway session store

### Step 11

- `Phase 3`
- gateway 内部读取侧开始感知 session store
- channel routing 和 host-step metadata 都开始读 `sessionKey / mainSessionKey`

### Step 12

- `Phase 3`
- automation session bridge 完成第一轮接入
- loop-task、hosted subagent、Ralph route hint 开始进入统一 session 模型

### Step 13

- `Phase 3` 完成
- 读取侧继续收口：
  - `agent control session state`
  - `subagent query/list`
  - `loop task diagnostics`
  - `automation diagnostics`
- 阶段结论：
  - gateway session store 已被主要平台路径写入和读取
  - `conversationId` 仍是 UI 主键
  - gateway 内部已具备完整 `sessionKey` 视图

## 2026-03-12 Step 14

### 阶段

- `Product Priority Kickoff`
- 覆盖：
  - `M1` 外部 Gateway Launcher
  - `M2` Session / Step 持久化
  - `M3` Daemon / Doctor v1

### 本次范围

- 把产品优先级实施路线正式落到仓库文档
- 开始第一批基础设施代码：
  - gateway process / lock / heartbeat 状态层
  - gateway session store persistence
  - gateway doctor 报告

### 已完成

- 新增路线文档：
  - `docs/product-priority-implementation-roadmap.zh-CN.md`
- 新增：
  - `src/gateway/process/runtime.ts`
  - `src/gateway/process/index.ts`
  - `src/gateway/sessions/persistence.ts`
  - `src/gateway/doctor/report.ts`
  - `src/gateway/doctor/index.ts`
- `src/gateway/bootstrap.ts`
  - bootstrap 时初始化 gateway process runtime
  - bootstrap 时配置并 hydrate gateway session store
- `src/gateway/sessions/store.ts`
  - create/update/delete 时自动落盘
  - 新增 session persistence 配置与 hydration 入口
- `src/gateway/server/health.ts`
  - 新增：
    - `process`
    - `sessionStore`
- `src/gateway/server/services.ts`
  - 新增 service descriptor：
    - `gateway-process`
    - `session-store`
- `src/main/ipc/gateway.ts`
  - 新增：
    - `gateway:doctor`
    - `gateway:process-status`
- `src/preload/index.ts`
  - 暴露：
    - `getGatewayDoctor`
    - `getGatewayProcessStatus`
- `src/renderer/api/index.ts`
  - 增加 desktop mode 下的 doctor/process API 包装
- `src/gateway/host-runtime/step-reporter/runtime.ts`
  - 增加 step journal persistence status

### 这一小步的定位

- `M1`
  - 先做进程元数据、锁文件、heartbeat 的状态层
  - 暂未实现真正 external process launcher
- `M2`
  - 先做 session store 持久化与恢复
  - step journal 先补状态视图，不做完整 journal 平台化
- `M3`
  - 先做 doctor 聚合检查协议
  - 暂未做 LaunchAgent / systemd / Task Scheduler 安装管理

### 验证

```bash
npm run test:unit -- tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/sessions/store.test.ts tests/unit/gateway/sessions/persistence.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts

npm run test:unit -- tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/config.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/gateway/runtime/orchestrator.test.ts
```

### 结果

- 通过
- 第一组：`7` 个测试文件，`17` 个测试通过
- 第二组：`5` 个测试文件，`56` 个测试通过

### 下一步

- 继续 `M1`
  - 开始做 external gateway launcher / reconnect
- 继续 `M2`
  - 给 session persistence 增加 corruption recovery / richer snapshot metadata
- 继续 `M3`
  - 补 daemon status、doctor checks、health panel 所需字段

## 2026-03-12 Step 15

### 阶段

- `M1` 第二步
- 目标：
  - external gateway launcher
  - reconnect
  - gateway-only process mode

### 本次范围

- 增加 external gateway launcher
- 增加 gateway-only 子进程运行模式
- 在 `gateway.mode=external` 时让主进程跳过 deferred gateway runtime，避免 optional channels / automation 双份初始化
- 扩展 health / doctor / IPC，暴露 launcher 状态

### 已完成

- 新增：
  - `src/gateway/process/launcher.ts`
- `src/gateway/process/runtime.ts`
  - 支持 external gateway 进程发布 heartbeat / owner 状态
- `src/gateway/bootstrap.ts`
  - `initializeGatewayCore()` 新增 `processRole`
  - main app 在 external mode 下会调用 launcher
  - main app 在 external mode 下会跳过 deferred runtime 初始化
- `src/gateway/channels/runtime.ts`
  - 允许 gateway-only process 在没有 `BrowserWindow` 的情况下初始化 core channels
- `src/main/index.ts`
  - 新增 gateway-only 启动模式：
    - `SKILLSFAN_GATEWAY_ROLE=external`
    - `SKILLSFAN_GATEWAY_ONLY=1`
    - `--gateway-external`
  - gateway-only process 不创建窗口、不参与单实例 UI 锁
  - gateway-only process 会直接初始化 gateway core + deferred
- `src/gateway/server/health.ts`
  - 新增 `launcher`
- `src/gateway/server/services.ts`
  - 新增 `gateway-launcher`
- `src/gateway/doctor/report.ts`
  - 新增 launcher 检查
- `src/main/ipc/gateway.ts`
  - 新增 `gateway:launcher-status`
- `src/preload/index.ts`
  - 暴露 `getGatewayLauncherStatus`
- `src/renderer/api/index.ts`
  - 增加 launcher status API

### 这一小步的定位

- 这一步解决的是：
  - external mode 不再只是配置位
  - main app 具备“拉起外部 gateway-only 子进程并观察 heartbeat”的能力
  - 外部子进程退出后，launcher 会进入 reconnect 状态并尝试重拉
- 这一步还没有解决的是：
  - main app 与 external gateway 之间的完整业务流量切换
  - agent / loop-task / tool invocation 全面迁移到 external process
  - daemon installer / service manager

## 2026-03-12 Step 16

### 阶段

- `M1` 第三步
- 目标：
  - external gateway 状态快照
  - desktop 主进程读取 external health / doctor
  - 为后续 query handoff 打底

### 本次范围

- 增加 gateway snapshot store
- 增加 external gateway 周期性 snapshot sync
- 让 desktop 主进程在 `gateway.mode=external` 时优先读取 external gateway 的 health / doctor 快照
- 保留 launcher / process 的本地观察视角，避免被 external 子进程状态误覆盖

### 已完成

- 新增：
  - `src/gateway/server/snapshots.ts`
  - `src/gateway/server/snapshot-sync.ts`
- `src/gateway/bootstrap.ts`
  - bootstrap 时配置 gateway snapshot store
  - external gateway deferred init 后启动 snapshot sync
  - shutdown 时关闭 snapshot sync
- `src/gateway/server/health.ts`
  - 拆分：
    - `collectLocalGatewayHealth()`
    - `getGatewayHealth()`
  - external mode 且当前进程不拥有 gateway 时，优先读取 external health 快照
  - services 重新按 “external snapshot + local launcher/process” 组合构建
- `src/gateway/doctor/report.ts`
  - 拆分：
    - `collectLocalGatewayDoctorReport()`
    - `getGatewayDoctorReport()`
  - external mode 下优先读取 doctor 快照
  - `gateway-launcher / gateway-process` 两项仍使用 desktop 主进程本地视角
- `src/gateway/server/index.ts`
  - 导出：
    - `snapshots`
    - `snapshot-sync`
- `src/gateway/process/launcher.ts`
  - gateway-only 子进程中 launcher 自动禁用，避免 external 子进程把自己误判成 launcher owner

### 这一小步的定位

- 这一步解决的是：
  - main app 在 external mode 下，不再只能看到 launcher 和本地空壳状态
  - renderer / IPC 的 `gateway:health`、`gateway:doctor` 开始能读到 external gateway 的真实聚合状态
  - 后续把更多 query path 切到 external process 时，可以继续复用 snapshot / shared-state 模式
- 这一步还没有解决的是：
  - agent / tool / automation 的写路径和执行路径还没有真正跨进程 handoff
  - automation diagnostics 还没有变成 shared snapshot / RPC 查询
  - external process 的正式 RPC / command bus 还没建立

### 验证

```bash
npm run test:unit -- tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/process/launcher.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/snapshots.test.ts tests/unit/gateway/server/snapshot-sync.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/sessions/persistence.test.ts
```

### 结果

- 通过
- `8` 个测试文件，`22` 个测试通过

### 下一步

- 继续 `M1`
  - 先切 query path：
    - automation diagnostics
    - loop-task / subagent query
    - 其他只读 gateway state
  - 再切 command path：
    - health/doctor 之外的 gateway write 操作
- 为真正的 external RPC / command bus 做接口收口

## 2026-03-12 Step 17

### 阶段

- `M1` 第四步
- 目标：
  - external observer 读取最新 session / subagent 查询
  - 把只读 query path 从“本地旧内存”切到“external 持久化状态”

### 本次范围

- 让 gateway session store 在 external observer 模式下按需读取最新持久化 snapshot
- 增加 gateway subagent observer facade，读取 persisted subagent registry
- 把主进程内两个纯读消费点切到 gateway facade：
  - `agent:get-subagent-detail`
  - `agent:get-session-state` 里的 subagent runs

### 已完成

- `src/gateway/sessions/store.ts`
  - 新增 observer read 逻辑
  - 当 `gateway.mode=external` 且当前进程不是 gateway owner 时：
    - `get/list/find/count/has` 会按需读取 session-store snapshot
- `src/gateway/automation/subagents/index.ts`
  - 新增：
    - `getGatewaySubagentRun`
    - `listGatewaySubagentRunsForConversation`
    - `listGatewaySubagentRunsBySessionKey`
  - external observer 模式下直接读取 `subagents/*/runs.json`
  - owner 模式下继续走 legacy runtime
- `src/main/ipc/agent.ts`
  - `agent:get-subagent-detail` 改为走 gateway subagent facade
- `src/main/services/agent/control.ts`
  - `getSessionState()` 的 subagent runs 改为走 gateway subagent facade
  - 仍然保留 stop/kill/interrupt 这些写路径走 legacy runtime，不在本步改动

### 这一小步的定位

- 这一步解决的是：
  - external mode 下，主进程恢复/详情查询不再依赖自己启动时那份旧内存
  - 聊天恢复态和 subagent detail 能看到 external gateway 进程持续写入的最新结果
- 这一步还没有解决的是：
  - host step replay 仍然主要依赖本地内存，不是完整 external query handoff
  - stop / kill / wait / tool invocation 这些写或半写路径还没有切到 external command path
  - loop-task/automation 的统一 RPC 查询接口还没建立

### 验证

```bash
npm run test:unit -- tests/unit/gateway/sessions/store.test.ts tests/unit/gateway/sessions/store.external.test.ts tests/unit/gateway/automation/diagnostics.test.ts tests/unit/gateway/automation/subagents.test.ts tests/unit/services/agent/control.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/snapshot-sync.test.ts tests/unit/gateway/server/snapshots.test.ts
```

### 结果

- 通过
- `10` 个测试文件，`32` 个测试通过

### 下一步

- 继续 `M1`
  - 开始收口 write/control path：
    - `kill-subagent`
    - `stopGeneration`
    - `wait/info/list` 类 subagent tool 控制
  - 再决定 command bus 是先走 file-backed queue，还是直接上 local RPC

## 2026-03-12 Step 18

### 阶段

- `M1` 第五步
- 目标：
  - 把 subagent 工具的只读链路统一到 gateway facade
  - observer 模式下支持 wait/list/info，不再硬依赖本地 runtime 内存

### 本次范围

- 给 gateway subagent facade 增加 wait 能力
- `mcp__local-tools__subagents` 的 `list / info / wait` 改走 gateway facade
- `kill` 继续保留在 legacy runtime 路径，不在本步切换

### 已完成

- `src/gateway/automation/subagents/index.ts`
  - 新增：
    - `waitForGatewaySubagentRun`
    - `waitForGatewayConversationSubagents`
  - observer 模式下通过 persisted registry 轮询等待终态
  - owner 模式下继续回退到 legacy runtime wait
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - `subagents` 工具的：
    - `list`
    - `info`
    - `wait`
    改为走 gateway subagent facade
  - `kill` 仍走 legacy runtime

### 这一小步的定位

- 这一步解决的是：
  - external mode 下，subagent 工具的查询和等待语义开始和 gateway observer 状态一致
  - agent/UI/tool 三条读取路径不再各读各的内存副本
- 这一步还没有解决的是：
  - `kill-subagent` 仍不是 external command path
  - `stopGeneration` 仍然没有跨进程控制能力
  - 真正的 external command bus / local RPC 还没建立

### 验证

```bash
npm run test:unit -- tests/unit/gateway/automation/subagents.test.ts tests/unit/services/local-tools/sdk-mcp-server.subagents.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/gateway/sessions/store.external.test.ts tests/unit/services/agent/control.test.ts tests/unit/gateway/automation/diagnostics.test.ts
```

### 结果

- 通过
- `6` 个测试文件，`25` 个测试通过

### 下一步

- 继续 `M1`
  - 真正开始切 write/control path：
    - `kill-subagent`
    - `stopGeneration`
- 需要先确定 command path 选型：
  - file-backed queue
  - 或 local RPC / IPC bridge

## 2026-03-12 Step 19

### 阶段

- `M1` 第六步
- 目标：
  - 落第一版 external gateway command path
  - 把第一批 write/control 操作真正切到 external gateway

### 本次范围

- 新增 file-backed gateway command bus
- external gateway 进程增加 command runtime
- 接入两条命令：
  - `subagent.kill`
  - `agent.stop`
- 把 IPC 和本地工具里的对应控制链路接过去

### 已完成

- 新增：
  - `src/gateway/commands/bus.ts`
  - `src/gateway/commands/runtime.ts`
  - `src/gateway/commands/index.ts`
- `src/gateway/bootstrap.ts`
  - bootstrap 时配置 `gateway/commands` 目录
  - external gateway deferred init 时启动 command runtime
  - shutdown 时停止 command runtime
- `src/gateway/automation/subagents/index.ts`
  - 新增：
    - `killGatewaySubagentRun`
  - observer 模式下无本地 run 时，走 `subagent.kill` command
  - owner 模式或本地 run 存在时，继续走 legacy runtime
- `src/main/ipc/agent.ts`
  - `agent:kill-subagent` 改走 `killGatewaySubagentRun`
- `src/main/services/agent/control.ts`
  - `stopGeneration()` 现在会在 observer 模式下追加发送 `agent.stop` command
  - 保留本地 stop 逻辑，形成“先停本地，再停 external”的混合迁移策略
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - `subagents` 工具的 `kill` 现在也走 gateway facade

### 这一小步的定位

- 这一步解决的是：
  - `M1` 第一次真正不只是 observer/read path，而是开始有 write/control path
  - external mode 下，`kill-subagent` 和 `stopGeneration` 不再只能影响 desktop 主进程本地状态
  - local-tools / IPC / control 三条控制入口开始共用一条 gateway command path
- 这一步还没有解决的是：
  - command path 仍然是 file-backed queue，不是正式 RPC
  - 还没覆盖：
    - send-message
    - interrupt/inject
    - loop-task control
    - host permission / desktop command control
  - external gateway 仍不是“完全唯一执行宿主”

### 验证

```bash
npm run test:unit -- tests/unit/gateway/commands/bus.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/automation/subagents.test.ts tests/unit/services/agent/control.test.ts tests/unit/services/local-tools/sdk-mcp-server.subagents.test.ts tests/unit/gateway/bootstrap.test.ts

npm run test:unit -- tests/unit/gateway/commands/bus.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/automation/subagents.test.ts tests/unit/gateway/automation/diagnostics.test.ts tests/unit/gateway/sessions/store.external.test.ts tests/unit/services/agent/control.test.ts tests/unit/services/local-tools/sdk-mcp-server.subagents.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/snapshot-sync.test.ts tests/unit/gateway/server/snapshots.test.ts
```

### 结果

- 通过
- 第一组：`6` 个测试文件，`22` 个测试通过
- 第二组：`13` 个测试文件，`48` 个测试通过

### 下一步

- 继续 `M1`
  - 扩 command path 覆盖面：
    - `interruptAndInject`
    - `sendMessage` / `ensureSessionWarm`
    - loop-task / ralph control
  - 再决定 file-backed queue 是否继续扩展，还是开始切 local RPC

### 验证

```bash
npm run test:unit -- tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/process/launcher.test.ts tests/unit/gateway/sessions/store.test.ts tests/unit/gateway/sessions/persistence.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts

npm run test:unit -- tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/config.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/gateway/runtime/orchestrator.test.ts
```

### 结果

- 通过
- 第一组：`8` 个测试文件，`21` 个测试通过
- 第二组：`5` 个测试文件，`56` 个测试通过

### 下一步

- 继续 `M1`
  - 做 main app 与 external gateway 的更明确 reconnect / handoff 协议
  - 开始考虑把一部分 gateway read/write 调用从 main app 迁到 external process
- `M2 / M3`
  - 暂不新增代码面，先复用现有 persistence / doctor 能力支撑 external mode

## 2026-03-12 Step 20

### 阶段

- `M1` 第七步
- 目标：
  - 把 external gateway 从“可观察 / 可部分控制”推进到“可接管主执行链”
  - 补齐 external interactive flow 所需的事件回传和审批/问答 command path

### 本次范围

- 新增 external channel relay
- 把主执行链委托到 external gateway：
  - `agent.send-message`
  - `agent.ensure-session-warm`
  - `agent.interrupt-inject`
- 把 interactive control 委托到 external gateway：
  - `agent.tool-approval`
  - `agent.question-answer`
- 让 host-step 也能跟随 external relay 回到 desktop 主进程

### 已完成

- 新增：
  - `src/gateway/channels/relay.ts`
- `src/gateway/bootstrap.ts`
  - bootstrap 时配置 `gateway/channel-relay` 目录
  - desktop app 在 `gateway.mode=external` 下启动 relay consumer
  - shutdown 时停止 relay runtime
- `src/gateway/channels/runtime.ts`
  - channel status 增加 relay 状态
- `src/gateway/server/health.ts`
  - external snapshot 模式下保留本地 relay 观察面
- `src/gateway/server/services.ts`
  - channel runtime 服务摘要开始展示 relay 状态
- `src/main/services/agent/helpers.ts`
  - `sendToRenderer()` / `broadcastToAllClients()` 在 external owner 进程中会额外写入 relay
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - `agent:host-step` 也进入 relay，desktop/remote UI 能收到 external host step
- `src/gateway/commands/bus.ts`
  - 增加命令：
    - `agent.send-message`
    - `agent.ensure-session-warm`
    - `agent.interrupt-inject`
    - `agent.tool-approval`
    - `agent.question-answer`
- `src/gateway/commands/runtime.ts`
  - external command runtime 处理以上命令
  - `send-message` / `interrupt-inject` 采用“accepted 后后台执行”的非阻塞策略
- `src/gateway/runtime/orchestrator.ts`
  - observer 模式下：
    - `sendMessage()` 改走 `agent.send-message`
    - `ensureSessionWarm()` 改走 `agent.ensure-session-warm`
- `src/main/services/agent/control.ts`
  - observer 模式下 `interruptAndInject()` 改走 `agent.interrupt-inject`
- `src/main/services/agent/permission-handler.ts`
  - observer 模式下：
    - `handleToolApproval()` 改走 `agent.tool-approval`
    - `handleUserQuestionAnswer()` 改走 `agent.question-answer`

### 这一小步的定位

- 这一步解决的是：
  - external gateway 已经不只是 lifecycle / health / diagnostics 宿主
  - desktop 主进程可以把主聊天执行链委托给 external gateway
  - external gateway 的流式消息、host-step、审批回执、问答回执可以回到 desktop/remote UI
  - external mode 下，用户不再只能“看见 external 状态”，而是可以真正和 external runtime 交互
- 这一步没有试图解决的是：
  - command path 仍然是 file-backed queue，不是正式 RPC
  - `rewind-files` 这类较窄的 active session 控制还没有迁移
  - loop-task / ralph 的特定业务控制接口没有单独改成 command path

### 验证

```bash
npm run test:unit -- tests/unit/gateway/channels/relay.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/services/agent/control.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts

npm run test:unit -- tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/services/agent/control.test.ts tests/unit/gateway/channels/relay.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts

npm run test:unit -- tests/unit/gateway/channels/relay.test.ts tests/unit/gateway/commands/bus.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/automation/subagents.test.ts tests/unit/services/local-tools/sdk-mcp-server.subagents.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/control.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/snapshot-sync.test.ts tests/unit/gateway/server/snapshots.test.ts tests/unit/gateway/sessions/store.external.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts
```

### 结果

- 通过
- 第一组：`8` 个测试文件，`45` 个测试通过
- 第二组：`6` 个测试文件，`54` 个测试通过
- 第三组：`17` 个测试文件，`93` 个测试通过

### 结论

- `M1` 完成
- 当前 external gateway 已满足 `M1` 路线定义：
  - 可独立拉起
  - 可重连 / 可诊断
  - desktop 主进程保留 launcher / health / reconnect
  - 主执行链和关键交互链已经可委托给 external gateway

### 下一步

- `M2 / M3`
  - 继续做 session / step persistence 的产品化收口
  - 再做 daemon / doctor installer / single-instance lock 的平台化
- `M2.5`
  - 补 external command path 的剩余窄控制链路：
    - `rewind-files`
    - `loop-task` 专用 command path
    - `ralph` 专用 command path
- `M4 / M5`
  - 如果优先回到用户体感路线，可以开始桌面动作层和桌面产品化

## 2026-03-12 Step 21

### 阶段

- `M2 / M3` 第一步
- 目标：
  - 把 session store / step journal 的持久化状态补成平台级观测面
  - 给后续 daemon installer / doctor UI 预留统一状态协议

### 本次范围

- 扩展 session store persistence status
- 扩展 host step journal persistence status
- 新增 gateway daemon status 接口
- 把以上状态接入 health / services / doctor / IPC / renderer API

### 已完成

- `src/gateway/sessions/persistence.ts`
  - persistence status 新增：
    - `snapshotSavedAt`
    - `fileExists`
    - `backupExists`
- `src/gateway/host-runtime/step-reporter/runtime.ts`
  - step journal status 新增：
    - `inMemoryTaskCount`
    - `persistedTaskCount`
    - `persistedStepCount`
    - `journalFileCount`
    - `lastRecoveredTaskId`
    - `lastLoadedAt`
    - `lastPersistedAt`
    - `lastLoadError`
    - `lastPersistError`
  - 读取持久化 journal 时会记录恢复 task 和错误状态
- 新增：
  - `src/gateway/daemon/status.ts`
  - `src/gateway/daemon/index.ts`
- `src/gateway/bootstrap.ts`
  - gateway bootstrap 时开始配置 daemon status 文件路径：
    - `gateway/daemon.json`
    - `gateway/daemon.lock`
- `src/gateway/server/health.ts`
  - health 状态新增：
    - `daemon`
    - `stepJournal`
- `src/gateway/server/services.ts`
  - service registry 新增：
    - `gateway-daemon`
    - `step-journal`
  - `session-store` 服务摘要开始展示：
    - hydration 状态
    - snapshotSavedAt
    - file / backup 是否存在
- `src/gateway/doctor/report.ts`
  - doctor checks 新增：
    - `daemon`
  - `session-store` / `step-journal` 自检增强：
    - 能区分未 hydration
    - 能暴露 load/save/persist 错误
- `src/main/ipc/gateway.ts`
  - 新增 `gateway:daemon-status`
- `src/preload/index.ts`
  - 新增 `getGatewayDaemonStatus()`
- `src/renderer/api/index.ts`
  - 新增 `getGatewayDaemonStatus()`

### 这一小步的定位

- 这一步解决的是：
  - `M2` 不再只有“落盘能力”，还具备统一的恢复/错误/文件存在性观测
  - `M3` 不再只有抽象路线图，已经有 daemon status 协议和 doctor 自检入口
  - external / embedded 两种模式下，health 与 doctor 都能返回同一套 persistence / daemon 结构
- 这一步没有试图解决的是：
  - 还没有 daemon installer / LaunchAgent / systemd 集成
  - 还没有 single-instance daemon lock 管理策略
  - step journal 还没有独立查询 UI，只是先把协议打通

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/sessions/persistence.test.ts

npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/sessions/persistence.test.ts tests/unit/gateway/server/snapshots.test.ts tests/unit/gateway/server/snapshot-sync.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/process/launcher.test.ts
```

### 结果

- 通过
- 第一组：`6` 个测试文件，`16` 个测试通过
- 第二组：`11` 个测试文件，`44` 个测试通过

### 下一步

- 继续 `M2`
  - 把 step journal 补成可恢复 session 视角的查询接口
  - 让 automation diagnostics 带出更明确的恢复来源和 journal 关联
- 继续 `M3`
  - 做 daemon installer / register 接口骨架
  - 做 single-instance / lock 视图与 doctor 检查
- `M2.5`
  - 仍然保留：
    - `rewind-files`
    - `loop-task` 专用 command path
    - `ralph` 专用 command path

## 2026-03-12 Step 22

### 阶段

- `M2 / M3` 第二步
- 目标：
  - 把 step journal 从“只有状态”推进到“可按 session 查询和恢复”
  - 把 daemon 从“只有静态状态”推进到“具备 register / lock runtime 骨架”

### 本次范围

- 新增 gateway step journal query facade
- 让 automation diagnostics 带出 step journal 和 recovery source
- 让聊天恢复态改走 session step journal
- 新增 daemon register / unregister / lock runtime
- 把 daemon control/query 透到 IPC / preload / renderer API

### 已完成

- `src/gateway/host-runtime/step-reporter/runtime.ts`
  - 新增：
    - `listTaskIds()`
    - `hasInMemoryTask()`
    - `hasPersistedTask()`
- 新增：
  - `src/gateway/host-runtime/step-reporter/query.ts`
- `src/gateway/host-runtime/index.ts`
  - 导出 step journal query facade
- `src/gateway/automation/diagnostics.ts`
  - diagnostics 新增：
    - `stepJournal`
    - `recovery`
  - `recovery.source` 现在可区分：
    - `none`
    - `session-store`
    - `step-journal`
    - `session-store+step-journal`
- `src/main/services/agent/control.ts`
  - `getSessionState()` 在存在 gateway session 时改走 session step journal，不再只直读 `conversationId -> steps`
- `src/gateway/daemon/status.ts`
  - 新增：
    - `registerGatewayDaemon()`
    - `unregisterGatewayDaemon()`
    - `initializeGatewayDaemonLockRuntime()`
    - `shutdownGatewayDaemonLockRuntime()`
  - daemon status 新增：
    - `registeredAt`
    - `updatedAt`
    - `lockState`
    - `lockOwner`
    - `lockPid`
    - `lockAcquiredAt`
    - `lockLastHeartbeatAt`
    - `lockHeartbeatAgeMs`
- `src/gateway/bootstrap.ts`
  - external gateway process role 初始化时会启动 daemon lock runtime
  - shutdown 时会释放 daemon lock runtime
- `src/gateway/server/services.ts`
  - `gateway-daemon` 服务开始带 lock metadata
- `src/gateway/doctor/report.ts`
  - daemon doctor check 开始识别 stale / unhealthy lock
- `src/main/ipc/gateway.ts`
  - 新增：
    - `gateway:daemon-register`
    - `gateway:daemon-unregister`
    - `gateway:step-journal`
- `src/preload/index.ts`
  - 新增：
    - `registerGatewayDaemon()`
    - `unregisterGatewayDaemon()`
    - `getGatewayStepJournal()`
- `src/renderer/api/index.ts`
  - 新增：
    - `registerGatewayDaemon()`
    - `unregisterGatewayDaemon()`
    - `getGatewayStepJournal()`

### 这一小步的定位

- 这一步解决的是：
  - `M2` 已经具备按 session 恢复 host steps 的能力，不再只能看 persistence status
  - automation diagnostics 已经能说明“恢复信息来自 session store、step journal，还是两者都有”
  - `M3` 已经具备 daemon register / unregister / lock heartbeat 的 runtime 骨架，后续接 LaunchAgent / systemd 时不需要重建状态机
- 这一步没有试图解决的是：
  - 还没有真正的 daemon installer / OS-level registration
  - 还没有独立 step journal UI
  - 还没有把 daemon register / unregister 接进 settings 面板或 doctor 操作按钮

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts tests/unit/gateway/automation/diagnostics.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/agent/control.test.ts

npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts tests/unit/gateway/automation/diagnostics.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/agent/control.test.ts tests/unit/gateway/server/snapshots.test.ts tests/unit/gateway/server/snapshot-sync.test.ts tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/process/launcher.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/sessions/persistence.test.ts

npm run build
```

### 结果

- 通过
- 第一组：`8` 个测试文件，`31` 个测试通过
- 第二组：`14` 个测试文件，`60` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M2`
  - 如果要产品化恢复态，可开始把 step journal query 接进 renderer diagnostics / doctor UI
  - 继续补更多 session 关联线索，例如 loop-task / ralph 的 host-step 任务命名
- 继续 `M3`
  - 做 daemon installer / OS-specific registration 骨架
  - 把 daemon register / unregister 接到可触发入口
  - 继续收口 single-instance 策略
- `M2.5`
  - 仍然保留：
    - `rewind-files`
    - `loop-task` 专用 command path
    - `ralph` 专用 command path

## 2026-03-12 Step 23

### 阶段

- `M3` 第三步
- 目标：
  - 把 daemon 从“只有 register / lock runtime”推进到“有明确的跨平台安装计划”
  - 为后续 settings / doctor 面板和真实 installer 留出统一只读协议

### 本次范围

- 新增 daemon install plan skeleton
- 把 daemon install plan 透到 IPC / preload / renderer API
- 补跨平台 plan 单测
- 回归确认 `M2` 的 step journal / diagnostics 线不回退

### 已完成

- 新增：
  - `src/gateway/daemon/plan.ts`
- `src/gateway/daemon/index.ts`
  - 导出 daemon plan 能力
- `src/main/ipc/gateway.ts`
  - 新增 `gateway:daemon-install-plan`
- `src/preload/index.ts`
  - 新增 `getGatewayDaemonInstallPlan()`
- `src/renderer/api/index.ts`
  - 新增 `getGatewayDaemonInstallPlan()`
- daemon install plan 目前支持生成：
  - macOS `LaunchAgent` plist skeleton
  - Linux `systemd --user` service skeleton
  - Windows `Task Scheduler` XML skeleton
- install plan 会统一返回：
  - service label / task name
  - executable path / args
  - working directory
  - environment variables
  - install / uninstall commands
  - 需要落盘的文件内容
- 顺手修复：
  - `src/main/services/agent/index.ts`
    - 补回 `listSubagentRunsBySessionKey` 导出，避免 `npm run build` 卡在 gateway subagent facade 编译错误

### 这一小步的定位

- 这一步解决的是：
  - `M3` 已经不只是“我知道要接 LaunchAgent / systemd / Task Scheduler”，而是有了统一 plan 协议
  - renderer / doctor / settings 后面想展示“将安装什么、会写什么文件、会跑什么命令”时，不需要再从平台逻辑里现拼
  - 后续做真实 installer 时，只需要在这个 plan 之上加执行层
- 这一步没有试图解决的是：
  - 还没有真的执行 `launchctl / systemctl / schtasks`
  - 还没有把 install plan 接到 UI
  - 还没有做安装失败后的修复流程

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/daemon/plan.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts

npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/daemon/plan.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts tests/unit/gateway/automation/diagnostics.test.ts tests/unit/gateway/bootstrap.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/agent/control.test.ts tests/unit/gateway/server/snapshots.test.ts tests/unit/gateway/server/snapshot-sync.test.ts tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/process/launcher.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/sessions/persistence.test.ts

npm run build
```

### 结果

- 通过
- 第一组：`5` 个测试文件，`18` 个测试通过
- 第二组：`15` 个测试文件，`63` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M3`
  - 把 install plan 接到 renderer settings / doctor 面板
  - 再决定真实 installer 是直接执行系统命令，还是先做 staged file writer + 用户确认
  - 把 single-instance / stale lock 的修复操作补成可触发入口
- 继续 `M2`
  - 如果优先做体感，可把 step journal / recovery source 接进现有对话侧诊断 UI

## 2026-03-12 Step 24

### 阶段

- `M2 / M3` 第四步
- 目标：
  - 把前面已经完成的 gateway diagnostics / recovery / daemon install plan 从“只有底层协议”推进到“设置页可见、可操作”
  - 先做 settings 侧产品化入口，不直接跳到真实 installer 执行

### 本次范围

- 把 gateway diagnostics 接到 `SettingsPage > Advanced`
- 展示 gateway runtime / recovery storage / doctor report / daemon status
- 提供 daemon register / unregister 操作入口
- 提供 install plan 文件与命令的复制入口
- 做 renderer 侧编译回归和 `M2 / M3` 相关单测回归

### 已完成

- `src/renderer/pages/SettingsPage.tsx`
  - 新增 Gateway Diagnostics 区块
  - 展示：
    - gateway runtime 状态
    - session store / step journal recovery 状态
    - doctor checks
    - daemon manager / lock / desired mode
  - 新增：
    - daemon mode register / unregister 按钮
    - install commands / uninstall commands / install file 的复制入口
    - refresh 按钮
- renderer 端现在会按需加载：
  - `getGatewayHealth()`
  - `getGatewayDoctor()`
  - `getGatewayDaemonStatus()`
  - `getGatewayDaemonInstallPlan()`
- 现有复制行为补了统一 toast，便于 settings 内的命令/文件复制反馈

### 这一小步的定位

- 这一步解决的是：
  - `M3` 不再只存在于 IPC / preload / API 层，用户已经能在 settings 里看到 daemon 和 doctor
  - `M2` 的 session store / step journal 恢复状态，已经有第一块产品可见面
  - 后面做真实 installer 或 doctor 面板时，不需要重新想一套 UI 协议
- 这一步没有试图解决的是：
  - 还没有真正执行 `launchctl / systemctl / schtasks`
  - 还没有把 stale lock / single-instance 修复做成一键操作
  - 还没有把 step journal 深度查看嵌到聊天页或专门 diagnostics 页

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/daemon/plan.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts

npm run build
```

### 结果

- 通过
- 测试：`5` 个测试文件，`16` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M3`
  - 做真实 installer 的 staged file writer 和用户确认流
  - 把 daemon install / uninstall plan 执行层接起来
  - 把 stale lock / single-instance 冲突修复做成可触发入口
- 继续 `M2`
  - 把 session step journal query 接到更贴近任务/会话的诊断视图
- 继续 `M2.5`
  - 补 `rewind-files / loop-task / ralph` 的 external command path

## 2026-03-12 Step 25

### 阶段

- `M3` 第五步
- 目标：
  - 把 daemon install plan 从“只读展示”推进到“可生成 staged install bundle”
  - 让 settings 侧不只是能看计划，还能实际生成一份可审阅、可复制、可手动执行的安装包

### 本次范围

- 新增 gateway daemon staged installer
- 新增 IPC / preload / renderer API
- settings 中新增“Prepare Install Files”入口
- 展示 prepared bundle 的目录、manifest、README 和 staged files
- 补 installer 单测和相关构建回归

### 已完成

- 新增：
  - `src/gateway/daemon/installer.ts`
- 能力：
  - 根据 daemon install plan 生成 staged bundle
  - 自动写出：
    - staged install files
    - `manifest.json`
    - `README.md`
    - `install-commands.txt`
    - `uninstall-commands.txt`
- 新增 IPC：
  - `gateway:daemon-prepare-install`
- 新增 preload / renderer API：
  - `prepareGatewayDaemonInstall()`
- `src/renderer/pages/SettingsPage.tsx`
  - install plan 卡片新增：
    - `Prepare Install Files`
    - prepared bundle 展示
    - bundle / manifest / staged file 路径复制

### 这一小步的定位

- 这一步解决的是：
  - `M3` 已经不只是“告诉用户应该装什么”，而是能生成一份具体可检查的 installer bundle
  - 后续真正执行 `launchctl / systemctl / schtasks` 时，不需要再重做 plan 到文件的物化层
  - settings 侧已经具备“先生成、再审阅、再执行”的安全路径
- 这一步没有试图解决的是：
  - 还没有真正执行系统安装命令
  - 还没有做 OS 级确认、权限提升或失败回滚
  - 还没有把 stale lock / single-instance 修复做成按钮

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/daemon/plan.test.ts tests/unit/gateway/daemon/installer.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts

npm run build
```

### 结果

- 通过
- 测试：`6` 个测试文件，`18` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M3`
  - 给 staged bundle 增加真实 install / uninstall 执行层
  - 加用户确认流和失败回滚提示
  - 把 stale lock / single-instance 冲突修复做成 settings / doctor 操作
- 继续 `M2`
  - 把 step journal 的 session 级恢复视图接到更贴近会话的诊断面
- 继续 `M2.5`
  - 补 `rewind-files / loop-task / ralph` 的 external command path

## 2026-03-12 Step 26

### 阶段

- `M3` 第六步
- 目标：
  - 把 staged bundle 从“只能生成”推进到“可以执行 install / uninstall command path”
  - 保持执行结果可回看、失败可诊断，不把设置页做成黑箱

### 本次范围

- 新增 gateway daemon executor
- 新增 install / uninstall IPC 与 renderer API
- settings 中新增 install / uninstall 执行入口
- 展示执行结果、命令输出和错误信息
- 补 executor 单测和构建回归

### 已完成

- 新增：
  - `src/gateway/daemon/executor.ts`
- 能力：
  - 读取 prepared bundle manifest
  - `install` 时先把 staged files 复制到目标路径
  - 顺序执行 install / uninstall commands
  - 返回结构化结果：
    - 命令列表
    - stdout / stderr
    - copied targets
    - error / note
  - install 成功后同步 `registerGatewayDaemon()`
  - uninstall 成功后同步 `unregisterGatewayDaemon()`
- 新增 IPC：
  - `gateway:daemon-run-install`
  - `gateway:daemon-run-uninstall`
- 新增 preload / renderer API：
  - `runGatewayDaemonInstall()`
  - `runGatewayDaemonUninstall()`
- `src/renderer/pages/SettingsPage.tsx`
  - prepared bundle 区块新增：
    - `Run Install Commands`
    - `Run Uninstall Commands`
    - execution result 卡片

### 这一小步的定位

- 这一步解决的是：
  - `M3` 已经具备从 plan -> bundle -> execute 的完整主链路
  - 用户不需要离开 settings 手工拼命令才能完成 daemon 安装/卸载
  - 执行失败后，stdout / stderr 和复制过的 target 文件路径都有结构化结果可看
- 这一步没有试图解决的是：
  - 还没有做真正的权限提升、系统级确认和自动回滚
  - 还没有清理 uninstall 后遗留的 target files
  - 还没有把 stale lock / single-instance 修复做成入口

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/daemon/plan.test.ts tests/unit/gateway/daemon/installer.test.ts tests/unit/gateway/daemon/executor.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts

npm run build
```

### 结果

- 通过
- 测试：`7` 个测试文件，`20` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M3`
  - 加执行前确认流
  - 补失败回滚提示
  - 把 stale lock / single-instance 冲突修复做成 settings / doctor 操作
- 继续 `M2`
  - 把 session step journal recovery 接到更贴近会话的诊断面
- 继续 `M2.5`
  - 补 `rewind-files / loop-task / ralph` 的 external command path

## 2026-03-12 Step 27

### 阶段

- `M3` 第七步
- 目标：
  - 给 daemon install / uninstall command path 增加显式确认流
  - 把 stale lock 修复从“doctor 能识别”推进到“settings 可一键触发”

### 本次范围

- 新增 daemon clear-lock runtime / IPC / renderer API
- settings 中新增 daemon install / uninstall confirm dialog
- settings 中新增 stale lock 清理按钮
- 补 daemon status 单测和构建回归

### 已完成

- `src/gateway/daemon/status.ts`
  - 新增 `clearGatewayDaemonObservedLock()`
  - 非 owner 进程下可清理 observed / stale lock 文件及其备份
  - 当前进程持有 lock 时拒绝清理，并返回明确错误
- 新增 IPC：
  - `gateway:daemon-clear-lock`
- 新增 preload / renderer API：
  - `clearGatewayDaemonLock()`
- `src/renderer/pages/SettingsPage.tsx`
  - `Run Install Commands` 改为先走确认弹窗
  - `Run Uninstall Commands` 改为先走确认弹窗
  - stale / error lock 状态下新增 `Clear Stale Lock`
  - confirm dialog 确认后才真正执行 install / uninstall / clear-lock

### 这一小步的定位

- 这一步解决的是：
  - daemon install / uninstall 不再是“点一下立即执行”的高风险操作
  - stale lock / single-instance 异常已经有产品级修复入口
  - doctor 识别出的 daemon 锁异常，可以直接在 settings 中闭环处理
- 这一步没有试图解决的是：
  - 还没有做 OS 级权限提升或系统确认
  - 还没有做 install / uninstall 自动回滚
  - `rewind-files / loop-task / ralph` 的 external command path 仍未补齐

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/daemon/plan.test.ts tests/unit/gateway/daemon/installer.test.ts tests/unit/gateway/daemon/executor.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts
```

### 结果

- 通过
- 测试：`7` 个测试文件，`22` 个测试通过

### 下一步

- 继续 `M3`
  - 增加 install / uninstall 的失败回滚提示或回滚清单
  - 继续补 single-instance / stale lock 的更细粒度 doctor 修复动作
- 继续 `M2`
  - 把 session step journal recovery 接到更贴近会话的诊断面
- 继续 `M2.5`
  - 补 `rewind-files / loop-task / ralph` 的 external command path

## 2026-03-12 Step 28

### 阶段

- `M3` 第八步
- 目标：
  - 把 daemon install / uninstall 执行结果从“只有成功/失败”推进到“有明确 rollback / cleanup 提示”
  - 让 settings 中的 installer 执行结果具备最基本的运维可操作性

### 本次范围

- executor 新增 rollback / cleanup hints
- settings execution result 卡片展示 rollback / cleanup hints
- 补 executor 单测和构建回归

### 已完成

- `src/gateway/daemon/executor.ts`
  - `GatewayDaemonExecutionResult` 新增：
    - `rollbackHints`
    - `cleanupHints`
  - install 执行结果现在会提示：
    - 如何运行 prepared uninstall commands
    - 哪些 copied target files 需要手动移除以回滚
  - uninstall 执行结果现在会提示：
    - 哪些 target files 可能需要手动清理
  - install 失败且 staged files 已复制时，会明确提示“可能存在部分安装”
- `src/renderer/pages/SettingsPage.tsx`
  - execution result 卡片新增：
    - `Rollback Hints`
    - `Cleanup Hints`
  - 用户不需要只盯着 stdout / stderr 猜下一步该做什么
- `tests/unit/gateway/daemon/executor.test.ts`
  - 补 rollback / cleanup hints 断言

### 这一小步的定位

- 这一步解决的是：
  - `M3` 不再只有“执行能力”，也开始补“执行失败后的恢复提示”
  - daemon installer 的结果更接近产品级运维反馈，而不是调试输出
  - 切到下一阶段前，settings 已经能给用户明确的撤销/清理建议
- 这一步没有试图解决的是：
  - 还没有自动回滚 copied target files
  - 还没有做 OS 级权限提升或系统确认
  - `rewind-files / loop-task / ralph` 的 external command path 仍未补齐

### 验证

```bash
npm run test:unit -- tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/daemon/plan.test.ts tests/unit/gateway/daemon/installer.test.ts tests/unit/gateway/daemon/executor.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/host-runtime/step-journal.test.ts

npm run build
```

### 结果

- 通过
- 测试：`7` 个测试文件，`22` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M3`
  - 继续补 single-instance / stale lock 的更细粒度 doctor 修复动作
  - 评估是否需要自动回滚 copied target files
- 继续 `M2`
  - 把 session step journal recovery 接到更贴近会话的诊断面
- 继续 `M2.5`
  - 补 `rewind-files / loop-task / ralph` 的 external command path

## 2026-03-12 Step 29

### 阶段

- `M2.5` 第一步
- 目标：
  - 先把 external gateway 下最关键的剩余窄控制链路切到 command path
  - 让 observer 进程不再依赖本地 active session 或本地 automation runtime 去完成这些控制动作

### 本次范围

- 新增 `agent.rewind-files` gateway command
- 新增 `loop-task.retry-story / retry-failed / reset-all` gateway commands
- 新增 `ralph.start / stop` gateway commands
- `rewind-files`、loop-task retry/reset、ralph start/stop 接入 external owner delegation
- 补 command runtime、rewind helper、automation facade delegation 单测

### 已完成

- `src/gateway/commands/bus.ts`
  - 新增命令：
    - `agent.rewind-files`
    - `loop-task.retry-story`
    - `loop-task.retry-failed`
    - `loop-task.reset-all`
    - `ralph.start`
    - `ralph.stop`
- `src/gateway/commands/runtime.ts`
  - external command runtime 开始处理以上命令
  - `loop-task` 命令沿用现有错误语义：
    - `Story not found or not in failed state`
    - `Task not found`
    - `Task not found or currently running`
- 新增：
  - `src/gateway/runtime/rewind.ts`
  - 提供：
    - `rewindGatewayFilesLocally()`
    - `rewindGatewayFiles()`
- `src/main/ipc/agent.ts`
  - `agent:rewind-files` 改为走 gateway rewind helper
  - external mode 下不再直接依赖 desktop 主进程本地 `getV2Session()`
- `src/gateway/automation/loop-task.ts`
  - `retryStory / retryFailed / resetAndRerun` 改为在 observer 模式下委托 external owner
  - 同时保留 `Locally` 版本供 owner process 和 command runtime 复用
- `src/main/ipc/loop-task.ts`
  - `retry-story / retry-failed / reset-all` 改为 await gateway facade
- `src/gateway/automation/ralph.ts`
  - `startGatewayRalphTask()` 在 observer 模式下委托 `ralph.start`
  - `stopGatewayRalphTask()` 在 observer 模式下委托 `ralph.stop`
  - 补 `startGatewayRalphTaskLocally()` / `stopGatewayRalphTaskLocally()`
- `src/main/ipc/ralph.ts`
  - `ralph:start` 现在会把 `spaceId` 一起带进 gateway facade，供 external owner 预加载 loop task

### 这一小步的定位

- 这一步解决的是：
  - `rewind-files` 不再卡在 observer 进程本地 session 是否存在
  - `loop-task` 的关键 retry/reset 控制可以命中 external owner
  - `ralph:start / stop` 也具备了和其他 agent/subagent 控制一致的 command path
- 这一步没有试图解决的是：
  - `loop-task` 的完整 CRUD 和所有 HTTP 路径还没有全部切到 external command path
  - `ralph:create-task / generate-stories / import-prd` 这类非关键控制链路还没迁
  - health / doctor 里还没有针对这些命令单独展开 command-level 观测字段

### 验证

```bash
npm run test:unit -- tests/unit/gateway/commands/bus.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/runtime/rewind.test.ts tests/unit/gateway/automation/loop-task.commands.test.ts tests/unit/gateway/automation/ralph.test.ts tests/unit/services/agent/control.test.ts

npm run build
```

### 结果

- 通过
- 测试：`6` 个测试文件，`24` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M2.5`
  - 评估是否要把 `loop-task` 其他高价值控制路径也切到 external owner
  - 评估是否要补 `ralph:create-task / generate-stories` 的 command path
  - 补 command-level 诊断或失败可观测字段
- 继续 `M2`
  - 把 session step journal recovery 接到更贴近会话的诊断面
- 继续 `M3`
  - 继续补 single-instance / stale lock 的更细粒度 doctor 修复动作

## 2026-03-12 Step 30

### 阶段

- `M2.5` 第二步
- 目标：
  - 把 `M2.5` 从“关键控制命令”推进到“Ralph 和 loop-task 的高频入口也能命中 external owner”
  - 减少 observer 进程上残留的 automation 特殊分叉

### 本次范围

- 新增 `loop-task.delete` gateway command
- 新增 `ralph.create-task / generate-stories / import-prd-file` gateway commands
- loop-task delete 接入 external owner delegation
- Ralph create/generate/import 接入 external owner delegation
- 补 command runtime 与 facade delegation 单测

### 已完成

- `src/gateway/commands/bus.ts`
  - 新增命令：
    - `loop-task.delete`
    - `ralph.create-task`
    - `ralph.generate-stories`
    - `ralph.import-prd-file`
- `src/gateway/commands/runtime.ts`
  - external command runtime 开始处理以上命令
  - `loop-task.delete` 失败时沿用 `Task not found` 语义
- `src/gateway/automation/loop-task.ts`
  - 新增 `deleteTaskLocally()`
  - `deleteTask()` 在 observer 模式下委托 `loop-task.delete`
- `src/gateway/automation/ralph.ts`
  - 新增：
    - `createGatewayRalphTaskLocally()`
    - `generateGatewayRalphStoriesLocally()`
    - `importGatewayRalphFromPrdFileLocally()`
  - `createGatewayRalphTask()` 现在本地创建后会直接同步 current task
  - observer 模式下：
    - `createGatewayRalphTask()` 委托 `ralph.create-task`
    - `generateGatewayRalphStories()` 委托 `ralph.generate-stories`
    - `importGatewayRalphFromPrdFile()` 委托 `ralph.import-prd-file`
- `src/main/ipc/ralph.ts`
  - `ralph:create-task` 不再在 IPC 层重复 `setGatewayRalphCurrentTask()`
  - current task 同步职责下沉到 gateway ralph facade

### 这一小步的定位

- 这一步解决的是：
  - observer 进程下，Ralph 的创建、故事生成和 PRD 导入不再只能走本地 runtime
  - `loop-task:delete` 在 external mode 下不会再误操作 observer 侧状态
  - `M2.5` 已经不只是补“少数命令”，而是开始覆盖用户高频的 automation 入口
- 这一步没有试图解决的是：
  - `ralph:get-task / get-current` 这类读路径还没有 observer/shared-state 补强
  - `loop-task` 的完整 CRUD 和 remote HTTP 路由还没有全部切到 external owner
  - command-level 诊断和失败指标还没进 health / doctor

### 验证

```bash
npm run test:unit -- tests/unit/gateway/commands/bus.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/runtime/rewind.test.ts tests/unit/gateway/automation/loop-task.commands.test.ts tests/unit/gateway/automation/ralph.test.ts tests/unit/services/agent/control.test.ts

npm run build
```

### 结果

- 通过
- 测试：`6` 个测试文件，`27` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M2.5`
  - 评估是否要补 `ralph:get-task / get-current` 的 observer 读路径
  - 评估是否要把 `loop-task` 其他高价值更新路径切到 external owner
  - 补 command-level 诊断或失败可观测字段
- 继续 `M2`
  - 把 session step journal recovery 接到更贴近会话的诊断面
- 继续 `M3`
  - 继续补 single-instance / stale lock 的更细粒度 doctor 修复动作

## 2026-03-12 Step 31

### 阶段

- `M2.5` 第三步
- 目标：
  - 把 `loop-task` 剩余高价值写路径一次性切到 external owner
  - 让 command runtime 不只是“能跑”，而且能进入 `health / services / doctor`

### 本次范围

- 新增 `loop-task.create / update / rename / add-story / update-story / remove-story / reorder-stories` gateway commands
- loop-task facade、IPC、remote HTTP 写路径统一走 gateway command delegation
- 新增 command runtime status，并接入 `health / services / doctor`
- 补对应单测与构建回归

### 已完成

- `src/gateway/commands/bus.ts`
  - 新增命令：
    - `loop-task.create`
    - `loop-task.update`
    - `loop-task.rename`
    - `loop-task.add-story`
    - `loop-task.update-story`
    - `loop-task.remove-story`
    - `loop-task.reorder-stories`
- `src/gateway/commands/runtime.ts`
  - external command runtime 开始处理以上 loop-task 命令
  - 新增 `GatewayCommandRuntimeStatus`
  - 记录 processed/failed/pending/lastCommand/lastError 等状态
- `src/gateway/automation/loop-task.ts`
  - 新增：
    - `createTaskLocally()`
    - `updateTaskLocally()`
    - `renameTaskLocally()`
    - `addStoryLocally()`
    - `updateStoryLocally()`
    - `removeStoryLocally()`
    - `reorderStoriesLocally()`
  - observer 模式下：
    - `createTask()` 委托 `loop-task.create`
    - `updateTask()` 委托 `loop-task.update`
    - `renameTask()` 委托 `loop-task.rename`
    - `addStory()` 委托 `loop-task.add-story`
    - `updateStory()` 委托 `loop-task.update-story`
    - `removeStory()` 委托 `loop-task.remove-story`
    - `reorderStories()` 委托 `loop-task.reorder-stories`
- `src/main/ipc/loop-task.ts`
  - loop-task 全部写入口改为 `await` gateway facade
- `src/main/http/routes/index.ts`
  - remote HTTP 的 loop-task 写路径改为 `await` gateway facade
- `src/gateway/server/services.ts`
  - 新增 `command-runtime` 服务视图
- `src/gateway/server/health.ts`
  - health snapshot 新增 `commands`
  - external snapshot 兼容读取 command runtime 状态
- `src/gateway/doctor/report.ts`
  - doctor 新增 `command-runtime` 检查项

### 这一小步的定位

- 这一步解决的是：
  - external mode 下，loop-task 不再只剩 retry/reset/delete 能命中 owner，常见创建与编辑入口也能命中 owner
  - remote HTTP 和 IPC 不再各自绕过 gateway command path
  - command runtime 的 backlog、失败和最近处理状态已经能在 `health / doctor` 里看见
- 这一步没有试图解决的是：
  - loop-task `list/get` 这类读路径还没有独立 shared-state/RPC 化
  - command bus 仍然是 file-backed queue，不是正式 RPC
  - command-level 指标还没有单独做 renderer 面板或更细的失败归因

### 验证

```bash
npm run test:unit -- tests/unit/gateway/automation/loop-task.commands.test.ts tests/unit/gateway/commands/runtime.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts

npm run build
```

### 结果

- 通过
- 测试：`5` 个测试文件，`21` 个测试通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M2.5`
  - 评估是否要把 `loop-task` 的读路径进一步抽成 shared-state/RPC 视图
  - 评估是否要给 command runtime 增加 renderer 侧更直接的诊断入口
- 继续 `M2`
  - 把 session step journal recovery 接到更贴近会话的诊断面
- 继续 `M3`
  - 继续补 single-instance / stale lock 的更细粒度 doctor 修复动作

## 2026-03-12 Step 32

### 阶段

- `M2.5` 第四步
- 目标：
  - 把 command runtime 从“只有 health/doctor 可见”推进到“设置页直接可见”
  - 让 external mode 下的命令积压、处理量和最近错误更容易被定位

### 本次范围

- Settings `Advanced > Gateway Diagnostics` 新增 command runtime 诊断卡
- renderer 侧补 `GatewayHealthStatusView.commands` 类型
- 保持现有 gateway health/doctor 接口不变，只补产品层展示

### 已完成

- `src/renderer/pages/SettingsPage.tsx`
  - `GatewayHealthStatusView` 新增 `commands`
  - Gateway Diagnostics 区域新增 `Command Runtime` 卡片
  - 展示：
    - role
    - pending
    - processed
    - failed
    - last command
    - last activity
    - last success
    - last error

### 这一小步的定位

- 这一步解决的是：
  - external mode 下，命令系统不再只能通过 doctor 文本排障
  - 用户和开发都能在设置页直接看到 command runtime 是否 active、有没有 backlog、最近有没有错误
- 这一步没有试图解决的是：
  - command runtime 还没有单独的专门诊断页面
  - `loop-task` 的读路径是否需要进一步 shared-state 化还没定论

### 验证

```bash
npm run build
```

### 结果

- 通过
- 构建：`npm run build` 通过

### 下一步

- 继续 `M2.5`
  - 评估是否要把 `loop-task` 的读路径进一步抽成 shared-state/RPC 视图
  - 评估是否要给 command runtime 增加更细的失败归因或 metrics 视图
- 继续 `M2`
  - 把 session step journal recovery 接到更贴近会话的诊断面
- 继续 `M3`
  - 继续补 single-instance / stale lock 的更细粒度 doctor 修复动作

## 2026-03-12 Step 33

### 阶段

- `M3` 第七步
- 目标：
  - 给 external gateway 增加一条明确的“恢复 launcher”修复动作
  - 把 stale lock 清理和 launcher 立即重试串成可执行的产品入口

### 本次范围

- `gateway/process` 增加 launcher recover 动作
- main IPC / preload / renderer API 增加 `gateway:launcher-recover`
- Settings `Advanced > Background Gateway` 增加 `Recover External Gateway` 按钮
- 补 launcher recover 的单测

### 已完成

- `src/gateway/process/launcher.ts`
  - 新增 `recoverExternalGatewayLauncher()`
  - recover 时会先清掉 reconnect timer，再立即重试 launcher
- `src/main/ipc/gateway.ts`
  - 新增 `gateway:launcher-recover`
  - 若检测到 stale/error lock，会先清理 observed lock，再触发 launcher recover
- `src/preload/index.ts`
  - 暴露 `recoverGatewayLauncher()`
- `src/renderer/api/index.ts`
  - 新增 `api.recoverGatewayLauncher()`
- `src/renderer/pages/SettingsPage.tsx`
  - external mode 且 launcher/process/lock 处于降级状态时，显示 `Recover External Gateway`
  - 执行后刷新 gateway diagnostics
- `tests/unit/gateway/process/launcher.test.ts`
  - 新增 reconnect-wait 下的立即 recover 测试

### 这一小步的定位

- 这一步解决的是：
  - external mode 下不必只等 reconnect timer，自带一条可手动触发的恢复动作
  - stale lock 和 launcher recover 不再是分离的两个排障动作
- 这一步没有试图解决的是：
  - 还没有做真正的 single-instance 强制接管
  - 还没有做 loop-task 读路径的 shared-state/RPC 化

### 验证

```bash
npm run test:unit -- tests/unit/gateway/process/launcher.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M3`
  - 评估是否还需要 single-instance 的更强修复动作
- 继续 `M2.5`
  - 评估 `loop-task list/get` 是否要进一步 shared-state/RPC 化
- 进入下一阶段前
  - 把第一阶段剩余的收尾项做明确取舍

## 2026-03-12 Step 34

### 阶段

- `M3` 第八步
- 目标：
  - 修正 stale external process metadata 的状态语义
  - 让 launcher recover 不只清 stale lock，也能处理陈旧的 process 观察文件

### 本次范围

- `gateway/process` 增加 observed process 清理动作
- stale external heartbeat 不再继续显示成 `external-observed`
- `gateway:launcher-recover` 串上 stale process 清理
- 补 process runtime 的回归测试

### 已完成

- `src/gateway/process/runtime.ts`
  - stale external heartbeat 现在会回到 `awaiting-external`
  - 新增 `clearGatewayObservedProcessRecord()`
  - 新增 `hasFreshObservedExternalGatewayProcess()`
- `src/gateway/process/launcher.ts`
  - launcher 观察逻辑改复用 fresh-observed helper
- `src/main/ipc/gateway.ts`
  - `gateway:launcher-recover` 在 external observer 模式下会先清 stale process record，再清 stale lock，再触发 launcher recover
- `tests/unit/gateway/process/runtime.test.ts`
  - 新增 stale observed process -> `awaiting-external` 测试
  - 新增 observed process clear 测试

### 这一小步的定位

- 这一步解决的是：
  - stale process metadata 不再被误认为 external gateway 还在线
  - gateway recover 现在能同时处理 process stale + lock stale 两类常见残留状态
- 这一步没有试图解决的是：
  - command path 级别的自动重放
  - 更强的 single-instance 强制接管

### 验证

```bash
npm run test:unit -- tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/process/launcher.test.ts tests/unit/gateway/daemon/status.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M3`
  - 评估是否还需要更强的 single-instance 修复动作
- 继续 `M2.5`
  - 对 `loop-task list/get` 做收尾取舍，决定是否进入下一阶段

## 2026-03-12 Step 35

### 阶段

- `M2.5` 收尾
- 目标：
  - 对 `loop-task list/get/list-scheduled` 做最终取舍
  - 避免为了“形式统一”再引入一层没有必要的 shared-state/RPC

### 本次范围

- 审核 `loop-task` 读路径在 external observer 模式下的真实数据来源
- 用测试锁定“读路径继续走共享磁盘文件”的决策
- 更新路线图，关闭 `M2.5`

### 已完成

- 确认 `src/gateway/automation/loop-task.ts`
  - `listTasks()`
  - `getTask()`
  - `listAllScheduledTasks()`
  都直接读取底层 loop-task 文件/index，而不是依赖 desktop 主进程内存态
- `tests/unit/gateway/automation/loop-task.commands.test.ts`
  - 新增 external observer 模式下的读路径测试
  - 明确 `list/get/list-scheduled` 不会命中 `executeGatewayCommand()`
- `docs/product-priority-implementation-roadmap.zh-CN.md`
  - `M2.5` 标记为已完成
  - 记录最终决策：`loop-task list/get/list-scheduled` 维持本地文件读路径

### 这一小步的定位

- 这一步解决的是：
  - 第一阶段不再挂着一个未决的“要不要给 loop-task 读路径再做一层 RPC”
  - external observer 模式下，loop-task 的写走 command path、读走共享文件的边界被正式固定
- 这一步没有试图解决的是：
  - loop-task 更复杂的实时订阅问题
  - 第二阶段的桌面动作层产品化

### 验证

```bash
npm run test:unit -- tests/unit/gateway/automation/loop-task.commands.test.ts tests/unit/gateway/process/runtime.test.ts tests/unit/gateway/process/launcher.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 第一阶段剩余重点收束到 `M3`
  - 如无新的 single-instance 强需求，可准备转入 `M4 Desktop Action Core`

## 2026-03-12 Step 36

### 阶段

- `M3` 收尾
- `M4` 第一步
- 目标：
  - 正式结束第一阶段后台持续执行/诊断能力收尾
  - 把已存在于 `HostRuntime.desktop` 的核心动作暴露成统一桌面工具

### 本次范围

- 路线图中将 `M3` 标记为已完成
- local-tools MCP server 新增桌面动作工具
- 工具目录补全桌面动作条目
- step reporter 补桌面动作摘要

### 已完成

- `docs/product-priority-implementation-roadmap.zh-CN.md`
  - `M3` 标记为已完成
  - `M4` 标记为进行中，并记录当前进展
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `activate_application`
  - 新增 `desktop_press_key`
  - 新增 `desktop_type_text`
  - 这些工具统一走 `HostRuntime.desktop`
  - 接入 step reporter 与 desktop perception before/after artifact
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增 `desktop` 类别
  - 补齐桌面动作工具目录条目
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `activate_application / desktop_press_key / desktop_type_text` 摘要模板
- `tests/unit/services/local-tools/sdk-mcp-server.test.ts`
  - 新增 activate / press / type 路由测试
- `tests/unit/gateway/host-runtime/tool-reporting.test.ts`
  - 新增桌面动作摘要测试

### 这一小步的定位

- 这一步解决的是：
  - `HostRuntime.desktop` 已实现但还没产品化暴露的动作，开始进入统一桌面动作层
  - tool search / MCP / step reporter 对桌面动作的认知开始统一
- 这一步没有试图解决的是：
  - App-specific desktop adapters
  - 更高层的 element-ref click/type 能力

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 收敛桌面动作命名、错误模型和能力描述
  - 评估是否引入 app adapter registry 雏形

## 2026-03-12 Step 37

### 阶段

- `M4` 第二步
- 目标：
  - 给桌面动作层补齐统一 capability 描述
  - 给桌面自动化失败补结构化错误码，而不只是原始 stderr

### 本次范围

- `HostRuntime.desktop` 增加结构化动作/adapter 能力描述
- `macos-ui` 增加基础错误分类和结构化异常码
- local-tools MCP server 统一桌面错误文案和 metadata

### 已完成

- `src/gateway/host-runtime/types.ts`
  - 新增 `DesktopHostAction`
  - 新增 `DesktopActionCapability`
  - 新增 `DesktopAdapterCapability`
  - `DesktopHostCapabilities` 新增 `backend / actions / adapters / errorCodes`
- `src/gateway/host-runtime/desktop/runtime.ts`
  - `getCapabilities()` 现在会返回结构化桌面动作列表
  - 当前明确声明 `generic-macos` adapter，避免把尚未实现的 app adapter 提前混进能力描述
- `src/main/services/local-tools/macos-ui.ts`
  - 新增 `MacOSAutomationErrorCode`
  - 新增 `classifyMacOSAutomationFailure()`
  - 新增 `getMacOSAutomationErrorCode()`
  - `runProcess()` 结果统一产出 `ok / errorCode / errorMessage`
  - 输入校验和非 macOS 场景统一抛结构化错误
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - `open_application / activate_application / run_applescript / desktop_press_key / desktop_type_text / desktop_click / desktop_move_mouse / desktop_scroll / desktop_list_windows / desktop_focus_window`
  - 统一使用桌面错误码格式化返回文案
  - step metadata 统一补 `errorCode / errorMessage`
- `tests/unit/services/local-tools/macos-ui.test.ts`
  - 新增桌面错误分类纯函数测试
- `tests/unit/gateway/host-runtime/index.test.ts`
  - 补 capability 结构断言
- `tests/unit/services/local-tools/sdk-mcp-server.test.ts`
  - 补 returned failure / thrown failure 的错误码透传测试

### 这一小步的定位

- 这一步解决的是：
  - `M4` 不再只是“有一堆桌面动作工具”，而是开始具备统一的能力描述和失败语义
  - 后续 settings、doctor、app adapter、tool registry 可以直接复用桌面错误码和 capability 元数据
- 这一步没有试图解决的是：
  - App-specific adapter registry
  - 更高层的 element-ref 桌面定位

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/macos-ui.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 补桌面动作权限/前置检查的统一提示
  - 开始收第一批 app adapter 的最小注册骨架，但不提前做完整产品层

## 2026-03-12 Step 38

### 阶段

- `M4` 第三步
- 目标：
  - 给结构化桌面动作补统一 preflight
  - 起第一批 app adapter 的最小 registry 骨架，为 `M5` 做铺垫

### 本次范围

- local-tools MCP server 为桌面动作增加统一前置检查
- `HostRuntime.desktop` 增加 app adapter registry 描述
- 测试覆盖 preflight 短路和 adapter 解析

### 已完成

- `src/gateway/host-runtime/desktop/adapters/registry.ts`
  - 新增桌面 app adapter registry
  - 当前登记：
    - `generic-macos`
    - `finder`
    - `terminal`
    - `chrome`
    - `skillsfan`
  - 其中只有 `generic-macos` 为 active，其他 4 个是 planned skeleton
- `src/gateway/host-runtime/types.ts`
  - `DesktopAdapterCapability` 增加 `displayName / stage / applicationNames / actions`
- `src/gateway/host-runtime/desktop/runtime.ts`
  - `getCapabilities().adapters` 改为来自 adapter registry
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 为 `desktop_press_key / desktop_type_text / desktop_click / desktop_move_mouse / desktop_scroll / desktop_list_windows / desktop_focus_window`
    增加统一 `Accessibility` preflight
  - 前置检查失败时会直接返回结构化 `permission_denied / unsupported_platform`
  - 基于 application name 补 `adapterId / adapterStage` metadata
- `tests/unit/gateway/host-runtime/desktop-adapters.test.ts`
  - 新增 adapter registry 测试
- `tests/unit/services/local-tools/sdk-mcp-server.test.ts`
  - 新增权限缺失短路测试
  - 补齐 desktop host capabilities mock

### 这一小步的定位

- 这一步解决的是：
  - 桌面动作不再“先执行再报权限错”，而是会在入口统一做最小 preflight
  - `M5` 需要的 app adapter 列表和应用名解析边界已经单独收口，不再散落在工具实现里
- 这一步没有试图解决的是：
  - app-specific action 实现
  - 高层 element-ref 或语义化桌面目标定位

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/macos-ui.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 让桌面权限提示和 adapter 信息出现在更直接的产品诊断面
  - 评估是否先把 `Finder / Terminal / Chrome` 的少量高频动作抽成 adapter method 雏形

## 2026-03-12 Step 39

### 阶段

- `M4` 第四步
- 目标：
  - 把桌面 action/adapters 的诊断信息真正接到产品面
  - 让 `doctor / services / settings` 都能看到桌面能力细节，而不是只知道“有权限问题”

### 本次范围

- `HostEnvironmentStatus` 扩展 desktop diagnostics 结构
- `host status / health / services / doctor` 补桌面动作与 adapter 元数据
- Settings `Gateway Diagnostics` 新增 `Desktop Automation` 卡片

### 已完成

- `src/shared/types/host-runtime.ts`
  - 新增 `HostDesktopActionStatus`
  - 新增 `HostDesktopAdapterStatus`
  - `HostEnvironmentStatus.desktop` 现在包含 `backend / actions / adapters / errorCodes`
- `src/gateway/host-runtime/status/runtime.ts`
  - host status 现在会把 desktop capability 映射成诊断数据
  - Accessibility 缺失时，相关 action 会标记 `blockedByPermission`
- `src/gateway/server/services.ts`
  - host-runtime service metadata 补 `desktopBackend / blockedActionIds / activeAdapterIds / plannedAdapterIds`
- `src/gateway/doctor/report.ts`
  - `host-permissions` check metadata 补 blocked actions 和 adapter 信息
- `src/renderer/pages/SettingsPage.tsx`
  - `Gateway Diagnostics` 新增 `Desktop Automation` 卡片
  - 现在可直接看到：
    - desktop backend
    - blocked actions
    - active adapter
    - planned adapters
- `tests/unit/gateway/server/health.test.ts`
  - 补 host desktop diagnostics mock
- `tests/unit/gateway/server/services.test.ts`
  - 补 host desktop diagnostics 输入
- `tests/unit/gateway/doctor/report.test.ts`
  - 补 desktop adapter / blocked action metadata
- `tests/unit/gateway/host-runtime/index.test.ts`
  - 补 host status 的 desktop diagnostics 断言

### 这一小步的定位

- 这一步解决的是：
  - 桌面动作层的 capability/adapters 不再只活在 runtime 内部
  - 现有产品诊断面已经能看见“哪些动作被权限挡住、哪些 adapter 已经 active、哪些只是 planned”
- 这一步没有试图解决的是：
  - app adapter 的真正行为实现
  - 面向用户任务的高层 desktop intent

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 先抽 `Finder / Terminal / Chrome` 的少量 adapter method 雏形
  - 再决定哪些动作直接升成 `M5` 的产品化入口

## 2026-03-12 Step 40

### 阶段

- `M4` 第五步
- 目标：
  - 给 planned desktop adapters 补第一批 method scaffold
  - 让 adapter 不只是“有名字”，而是已有明确的方法边界和诊断可见性

### 本次范围

- 新增 `Finder / Terminal / Chrome / SkillsFan` adapter method descriptors
- 新增少量 helper scaffold builder
- `host status / services / doctor / settings` 透出 adapter methods

### 已完成

- `src/gateway/host-runtime/desktop/adapters/utils.ts`
  - 新增 AppleScript 字符串转义 helper
- `src/gateway/host-runtime/desktop/adapters/finder.ts`
  - 新增 `finder.reveal_path`
  - 新增 `finder.open_folder`
  - 新增 `buildFinderRevealPathScript()`
- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.run_command`
  - 新增 `terminal.new_tab_run_command`
  - 新增 `buildTerminalRunCommandScript()`
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.open_url`
  - 新增 `chrome.focus_tab_by_title`
  - 新增 `buildChromeOpenUrlTarget()`
  - 新增 `buildChromeFocusTabScript()`
- `src/gateway/host-runtime/desktop/adapters/skillsfan.ts`
  - 新增 `skillsfan.focus_main_window`
  - 新增 `skillsfan.open_settings`
  - 新增 `buildSkillsFanOpenSettingsShortcut()`
- `src/gateway/host-runtime/desktop/adapters/registry.ts`
  - planned adapters 现在都带有 `methods`
  - planned action 集补上 `run_applescript`
- `src/shared/types/host-runtime.ts`
  - `HostDesktopAdapterStatus` 补 `methods`
- `src/gateway/host-runtime/status/runtime.ts`
  - host status 现在会映射 adapter methods
- `src/gateway/server/services.ts`
  - `host-runtime` service metadata 补 `desktopScaffoldedMethodIds / desktopPlannedMethodIds`
- `src/gateway/doctor/report.ts`
  - `host-permissions` check metadata 补 `scaffoldedMethodIds / plannedMethodIds`
- `src/renderer/pages/SettingsPage.tsx`
  - `Desktop Automation` 卡片现在能直接看到每个 planned adapter 的 method 列表和 stage
- `tests/unit/gateway/host-runtime/desktop-adapters.test.ts`
  - 补 adapter methods 和 helper scaffold 断言
- `tests/unit/gateway/host-runtime/index.test.ts`
  - 补 desktop capabilities / host status 中的方法断言
- `tests/unit/gateway/server/services.test.ts`
  - 补 host-runtime service method metadata 断言
- `tests/unit/gateway/doctor/report.test.ts`
  - 补 doctor method metadata 断言

### 这一小步的定位

- 这一步解决的是：
  - app adapter 已经从“planned 名字”进入“planned method 边界”
  - 后续 `M5` 做产品化时，不需要再从零决定每个 app 到底暴露哪些动作
- 这一步没有试图解决的是：
  - method 到真实工具入口的绑定
  - Finder / Terminal / Chrome / SkillsFan 的实际执行逻辑

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 优先挑 `Finder / Terminal / Chrome` 各 1 条高频 method，落最小真实执行路径
  - 保持先走 runtime/adapter 内部，不直接扩散新工具入口

## 2026-03-12 Step 41

### 阶段

- `M4` 第六步
- 目标：
  - 让第一批 adapter methods 真正命中执行路径
  - 先在不扩新工具入口的前提下，让 `Finder / Terminal / Chrome` 开始有实际收益

### 本次范围

- 新增 desktop adapter method executor
- 把 `finder.reveal_path / terminal.run_command / chrome.open_url / skillsfan.focus_main_window` 接成可执行路径
- 把 `open_application` 局部接成 adapter-aware 路由

### 已完成

- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `executeDesktopAdapterMethod()`
  - 新增 `maybeExecuteOpenApplicationAdapterMethod()`
  - 当前已支持：
    - `finder.reveal_path`
    - `terminal.run_command`
    - `chrome.open_url`
    - `skillsfan.focus_main_window`
    - `skillsfan.open_settings`
- `src/gateway/host-runtime/desktop/adapters/finder.ts`
  - `finder.reveal_path` 从 scaffold 升为 active
- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - `terminal.run_command` 从 scaffold 升为 active
  - 补 `Terminal / iTerm2` 两套 AppleScript builder 分支
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - `chrome.open_url` 从 scaffold 升为 active
- `src/gateway/host-runtime/desktop/adapters/skillsfan.ts`
  - `skillsfan.focus_main_window` 从 scaffold 升为 active
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - `open_application` 现在会优先走：
    - `Finder + 本地路径 -> finder.reveal_path`
    - `Chrome + http/https URL -> chrome.open_url`
  - step metadata 补 `adapterMethodId / adapterMethodStage`
- `src/gateway/server/services.ts`
  - host-runtime metadata 补 `desktopActiveMethodIds`
  - summary 现在区分 `active/total methods`
- `src/gateway/doctor/report.ts`
  - `host-permissions` metadata 补 `activeMethodIds`
- `src/renderer/pages/SettingsPage.tsx`
  - `Desktop Automation` 卡片现在区分 `active methods / pending methods`
- `tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts`
  - 新增 adapter executor 定向测试
- `tests/unit/services/local-tools/sdk-mcp-server.test.ts`
  - 新增 Finder/Chrome adapter-aware open_application 路由断言
- 相邻 host/services/doctor 测试已同步更新 active method 断言

### 这一小步的定位

- 这一步解决的是：
  - 第一批 adapter method 不再只是文档和诊断里的计划项
  - `Finder / Chrome` 已开始复用现有工具入口拿到更明确的 app-specific 行为
- 这一步没有试图解决的是：
  - `Terminal.run_command` 的正式对外工具暴露
  - `Chrome.focus_tab_by_title`、`Finder.open_folder`、`SkillsFan.open_settings` 的完整产品入口

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 评估是否把 `Terminal.run_command` 收口成正式结构化桌面工具
  - 继续补 `Chrome.focus_tab_by_title` 或 `Finder.open_folder` 的最小执行路径

## 2026-03-12 Step 42

### 阶段

- `M4` 第七步
- 目标：
  - 把第一批可执行 adapter method 收成正式结构化工具
  - 继续减少对自由 `run_applescript` 的依赖

### 本次范围

- 新增 `terminal_run_command`
- 新增 `chrome_focus_tab`
- 审批、工具搜索、活动摘要、step summary 一起补齐

### 已完成

- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `terminal_run_command`
  - 新增 `chrome_focus_tab`
  - 两者都复用 desktop adapter executor，而不是重新拼自由 AppleScript
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增两条 desktop tool catalog entry
- `src/main/services/agent/permission-handler.ts`
  - 新增两条 command approval 规则：
    - `mcp__local-tools__terminal_run_command`
    - `mcp__local-tools__chrome_focus_tab`
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - `buildChromeFocusTabScript()` 现在支持自定义应用名
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `chrome.focus_tab_by_title` 执行分支
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `terminal_run_command / chrome_focus_tab` 的可读 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增这两个 action 的 UI label
- `tests/unit/services/local-tools/sdk-mcp-server.test.ts`
  - 新增两条 structured tool 行为测试
- `tests/unit/services/agent/permission-handler.test.ts`
  - 新增两条审批测试
- `tests/unit/services/local-tools/tool-search.test.ts`
  - 新增 terminal/chrome structured tool 搜索测试
- `tests/unit/gateway/host-runtime/tool-reporting.test.ts`
  - 新增 summary 断言

### 这一小步的定位

- 这一步解决的是：
  - `Terminal.run_command` 已经不只是 adapter 内部能力，而是正式工具入口
  - `Chrome.focus_tab_by_title` 也进入了结构化工具层
  - agent 后续要做桌面浏览器/终端任务时，不必再优先退回自由 AppleScript
- 这一步没有试图解决的是：
  - `Finder.open_folder` 的正式结构化入口
  - `SkillsFan.open_settings` 的产品级入口

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 补 `Finder.open_folder` 或 `Chrome.focus_tab_by_title` 的更稳失败分类
  - 评估是否给 `SkillsFan.open_settings` 增加最小结构化入口

## 2026-03-12 Step 43

### 阶段

- `M4` 第八步
- 目标：
  - 把 `Finder.open_folder` 收成正式结构化工具
  - 把 `Chrome.focus_tab_by_title` 的 not-found 场景收成结构化错误

### 本次范围

- 新增 `finder_open_folder`
- 让 `finder.open_folder` 从 planned method 进入 active method 集
- 为 `chrome.focus_tab_by_title` 补 `window_not_found` 风格的失败分类

### 已完成

- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `finder_open_folder`
  - `open_application(Finder + directory)` 现在会走 `finder.open_folder`
- `src/gateway/host-runtime/desktop/adapters/finder.ts`
  - `finder.open_folder` 改为 active method
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - `chrome.focus_tab_by_title` 改为 active method
  - tab 未命中时明确抛出 `Tab not found: ...`
- `src/main/services/local-tools/macos-ui.ts`
  - `tab not found` 归类到 `window_not_found`
- `src/main/services/local-tools/tool-catalog.ts`
  - `finder_open_folder` 已进入本地工具目录
- `src/main/services/agent/permission-handler.ts`
  - 新增 `mcp__local-tools__finder_open_folder` 审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - `finder_open_folder` 已有可读 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - `finder_open_folder` 已有 UI label
- 桌面能力相关测试已更新：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `services / doctor / host-runtime`
  - `macos-ui`

### 这一小步的定位

- 这一步解决的是：
  - Finder 目录打开不再只能借 `open_application` 间接命中
  - Chrome tab focus 的失败结果不再只有模糊 execution failure
- 这一步没有试图解决的是：
  - `SkillsFan.open_settings` 的正式结构化入口
  - 更多 adapter method 的产品级暴露

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/local-tools/macos-ui.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 评估是否把 `SkillsFan.open_settings` 收成正式结构化工具
  - 或继续补 `Terminal / Chrome / Finder` 的第二批高频 method

## 2026-03-12 Step 44

### 阶段

- `M4` 第九步
- 目标：
  - 把 `SkillsFan.open_settings` 收成正式结构化工具
  - 补齐第一方 app adapter 的最小产品入口

### 本次范围

- 新增 `skillsfan_open_settings`
- 让 `skillsfan.open_settings` 从 planned method 进入 active method 集
- 修正 settings shortcut 执行链在前置激活失败时的处理

### 已完成

- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `skillsfan_open_settings`
  - 接入 preflight、adapter executor、step reporter、before/after perception
- `src/gateway/host-runtime/desktop/adapters/skillsfan.ts`
  - `skillsfan.open_settings` 改为 active method
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - `skillsfan.open_settings` 现在会先检查 activate 结果，失败时不再继续发快捷键
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增 `mcp__local-tools__skillsfan_open_settings`
- `src/main/services/agent/permission-handler.ts`
  - 新增 `mcp__local-tools__skillsfan_open_settings` 审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `skillsfan_open_settings` summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增 `skillsfan_open_settings` UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host-runtime`

### 这一小步的定位

- 这一步解决的是：
  - 第一方 `SkillsFan` adapter 不再只有内部 method，而是开始有正式产品工具入口
  - agent 需要打开设置页时，不必优先退回自由 AppleScript
- 这一步没有试图解决的是：
  - `SkillsFan.focus_main_window` 的正式结构化工具入口
  - 更多第一方 app workflow

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 评估是否给 `SkillsFan.focus_main_window` 增加正式结构化工具入口
  - 或继续补 `Terminal / Chrome / Finder` 的第二批高频 method

## 2026-03-12 Step 45

### 阶段

- `M4` 第十步
- 目标：
  - 把 `SkillsFan.focus_main_window` 收成正式结构化工具入口
  - 让第一方 app 的高频窗口聚焦能力不再依赖通用 `focus_window`

### 本次范围

- 新增 `skillsfan_focus_main_window`
- 对齐工具目录、审批、摘要和活动卡片

### 已完成

- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `skillsfan_focus_main_window`
  - 接入 preflight、adapter executor、step reporter、before/after perception
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增 `mcp__local-tools__skillsfan_focus_main_window`
- `src/main/services/agent/permission-handler.ts`
  - 新增 `mcp__local-tools__skillsfan_focus_main_window` 审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `skillsfan_focus_main_window` summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增 `skillsfan_focus_main_window` UI label
- 相邻测试已补齐：
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`

### 这一小步的定位

- 这一步解决的是：
  - agent 需要切回第一方主窗口时，不必退回通用窗口匹配
  - 第一方 `SkillsFan` adapter 已经同时拥有 `focus_main_window` 和 `open_settings` 两个正式工具入口
- 这一步没有试图解决的是：
  - 更多第一方内部 workflow
  - `Terminal / Chrome / Finder` 的第二批高频 method

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 优先补 `Terminal / Chrome / Finder` 的第二批高频 method
  - 或开始梳理哪些动作可以进入 `M5` 的产品化暴露

## 2026-03-12 Step 46

### 阶段

- `M4` 第十一步
- 目标：
  - 优先补 `Terminal / Chrome / Finder` 的第二批高频 method
  - 把高频 adapter method 继续收成正式结构化工具入口

### 本次范围

- 激活 `terminal.new_tab_run_command`
- 新增 `finder_reveal_path`
- 新增 `terminal_new_tab_run_command`
- 新增 `chrome_open_url`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 将 `terminal.new_tab_run_command` 从 planned 改为 active
  - 新增 `buildTerminalNewTabRunCommandScript()`
  - 支持 `Terminal` 和 `iTerm/iTerm2` 的新标签页执行脚本
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `terminal.new_tab_run_command` 执行分支
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `finder_reveal_path`
  - 新增 `terminal_new_tab_run_command`
  - 新增 `chrome_open_url`
  - 三个工具都接入 preflight、adapter executor、step reporter、before/after perception
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增 `mcp__local-tools__finder_reveal_path`
  - 新增 `mcp__local-tools__terminal_new_tab_run_command`
  - 新增 `mcp__local-tools__chrome_open_url`
- `src/main/services/agent/permission-handler.ts`
  - 新增上述三个工具的审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述三个工具的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述三个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal / Chrome / Finder` 的第二批高频 method 不再只停留在 adapter scaffold
  - 桌面工具层新增了三条用户可直接调用的结构化入口
  - `terminal.new_tab_run_command` 已经不再是 planned method
- 这一步没有试图解决的是：
  - `Terminal / Chrome / Finder` 更深的 app-specific workflow
  - `M5` 的权限引导、失败兜底和更明显的产品化呈现

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 优先补 `Terminal / Chrome / Finder` 的下一批高频 method
  - 或开始梳理哪些动作可以进入 `M5` 的产品化暴露

## 2026-03-12 Step 47

### 阶段

- `M4` 第十二步
- 目标：
  - 继续补 `Terminal / Chrome / Finder` 的下一批高频 method
  - 把更多 app-specific 动作收成正式结构化工具入口

### 本次范围

- 新增 `finder.open_home_folder`
- 新增 `terminal.new_window_run_command`
- 新增 `chrome.new_tab`
- 新增 `chrome.reload_active_tab`
- 新增对应正式工具入口和产品侧配套

### 已完成

- `src/gateway/host-runtime/desktop/adapters/finder.ts`
  - 新增 `finder.open_home_folder`
  - 新增 `buildFinderOpenHomeFolderTarget()`
- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.new_window_run_command`
  - 新增 `buildTerminalNewWindowRunCommandScript()`
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.new_tab`
  - 新增 `chrome.reload_active_tab`
  - 新增 Chrome 新标签页 / 刷新快捷键 helper
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增上述四个 method 的执行分支
  - `chrome.new_tab` / `chrome.reload_active_tab` 改走 `activate + press_key` 的结构化执行链
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `finder_open_home_folder`
  - 新增 `terminal_new_window_run_command`
  - 新增 `chrome_new_tab`
  - 新增 `chrome_reload_active_tab`
  - 对齐 preflight、adapter executor、step reporter、before/after perception
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述四个工具的目录条目
- `src/main/services/agent/permission-handler.ts`
  - 新增上述四个工具的审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述四个动作的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述四个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Finder / Terminal / Chrome` 又多了四条 agent 可直接调用的高频结构化动作
  - `Chrome` 不再只有 `open_url / focus_tab`，而是补上了更基础的 tab lifecycle 动作
  - `Terminal` 不再只有当前窗口/新标签页执行，已经补上新窗口执行链
- 这一步没有试图解决的是：
  - `Finder / Terminal / Chrome` 更深的 workflow automation
  - `M5` 的权限引导、失败兜底和产品曝光面扩展

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 再补一批 `Terminal / Chrome / Finder` 高频 method
  - 或开始梳理哪些动作可以进入 `M5` 的产品化暴露

## 2026-03-12 Step 48

### 阶段

- `M4` 第十三步
- 目标：
  - 继续补 `Terminal / Chrome / Finder` 高频 method
  - 优先补齐目录感知、URL 感知和中断类高频动作

### 本次范围

- 新增 `finder.new_window`
- 新增 `terminal.run_command_in_directory`
- 新增 `terminal.interrupt_process`
- 新增 `chrome.focus_tab_by_url`
- 新增 `chrome.open_url_in_new_tab`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/finder.ts`
  - 新增 `finder.new_window`
  - 新增 Finder 新窗口快捷键 helper
- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.run_command_in_directory`
  - 新增 `terminal.interrupt_process`
  - 新增目录执行脚本 helper 和 `Control+C` shortcut helper
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.focus_tab_by_url`
  - 新增 `chrome.open_url_in_new_tab`
  - 新增 URL 匹配和新标签页打开 URL 的 AppleScript helper
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增上述五个 method 的执行分支
  - `finder.new_window` / `terminal.interrupt_process` 改走 `activate + press_key`
  - `chrome.focus_tab_by_url` / `chrome.open_url_in_new_tab` 改走结构化 AppleScript helper
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `finder_new_window`
  - 新增 `terminal_run_command_in_directory`
  - 新增 `terminal_interrupt_process`
  - 新增 `chrome_focus_tab_by_url`
  - 新增 `chrome_open_url_in_new_tab`
  - 对齐 preflight、adapter executor、审批、step reporter、before/after perception
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述五个工具目录条目
- `src/main/services/agent/permission-handler.ts`
  - 新增上述五个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述五个动作的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述五个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal` 终于具备目录感知执行和中断类动作
  - `Chrome` 终于具备按 URL 聚焦 tab 和“在新 tab 打开 URL”这两条更稳的浏览器动作
  - `Finder` 不再只有 path-based 打开/定位，也补上了基础的新窗口动作
- 这一步没有试图解决的是：
  - 更深的 app workflow，比如 Finder 搜索、Terminal 读回输出、Chrome tab 列表/关闭
  - `M5` 的权限引导、失败兜底和更明显的产品化呈现

### 验证

```bash
npm run test:unit -- tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts
npm run build
```

### 结果

- 通过

### 下一步

- 继续 `M4`
  - 继续补终端和浏览器的“读状态”能力
  - 或开始挑选一组动作进入 `M5` 的产品化暴露

## 2026-03-12 Step 49

### 阶段

- `M4` 第十四步
- 目标：
  - 优先补齐 `Terminal / iTerm` 与 `Chrome` 的“读状态”能力
  - 让桌面自动化从“只会发动作”继续向“会观察当前状态”推进

### 本次范围

- 新增 `terminal.read_output`
- 新增 `chrome.list_tabs`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.read_output`
  - 新增 `Terminal / iTerm2` 读取当前可见输出的 AppleScript helper
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.list_tabs`
  - 新增列出窗口/标签页标题、URL、active 状态的 AppleScript helper
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增上述两个 method 的执行分支
  - 新增结构化读结果解析：
    - `TerminalOutputObservation`
    - `ChromeTabListObservation`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `terminal_read_output`
  - 新增 `chrome_list_tabs`
  - 两个工具都接入 preflight、adapter executor、审批链、step reporter
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述两个工具目录条目
- `src/main/services/agent/permission-handler.ts`
  - 新增上述两个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述两个动作的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述两个动作的 UI label
- `src/main/services/local-tools/macos-ui.ts`
  - 把 `has no open windows` 归类进 `window_not_found`
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal / iTerm` 不再只有“执行命令”和“中断”，开始具备读当前输出的能力
  - `Chrome` 不再只能“打开/切换/刷新”，开始具备列出现有 tab 上下文的能力
  - 桌面代理开始从“只会操作”过渡到“会先观察状态再操作”
- 这一步没有试图解决的是：
  - `Finder.search`
  - `Terminal` 的持续等待/退出码/完成态判断
  - `Chrome` 的 tab 关闭、按域名过滤、读取 active tab 详情
  - `M5` 的权限引导、失败兜底和更明显的产品化呈现

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`163` 个测试通过
- 构建：通过
- 备注：仍有现有的 Vite dynamic import warning，无新增构建错误

### 下一步

- 继续 `M4`
  - 继续补 `Terminal` 的等待/完成态观察
  - 继续补 `Chrome` 的 tab filter / 按 URL 定位后的闭环能力
  - 评估哪些桌面动作可以开始进入 `M5` 的产品化暴露

## Step 50

- `M4` 第十五步
- 目标：
  - 继续补齐 `Finder / Chrome` 的“读状态”能力
  - 让浏览器与文件系统的桌面自动化进一步从“能发动作”变成“能识别当前上下文”

### 本次范围

- 新增 `finder.search`
- 新增 `chrome.get_active_tab`
- 新增 `chrome.close_active_tab`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/finder.ts`
  - 新增 `finder.search`
  - 新增 Finder/Spotlight 目录范围搜索 helper
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.get_active_tab`
  - 新增 `chrome.close_active_tab`
  - 新增 active tab 读取 helper 与关闭当前 tab 的快捷键 helper
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增上述三个 method 的执行分支
  - 新增结构化结果解析：
    - `FinderSearchObservation`
    - `ChromeActiveTabObservation`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `finder_search`
  - 新增 `chrome_get_active_tab`
  - 新增 `chrome_close_active_tab`
  - 三个工具都接入 preflight、adapter executor、审批链、step reporter
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述三个工具目录条目
- `src/main/services/agent/permission-handler.ts`
  - 新增上述三个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述三个动作的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述三个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Finder` 不再只会按路径打开/定位，也开始具备按 query 搜索文件的能力
  - `Chrome` 不再只能列 tab 或切 tab，开始具备读取当前 active tab 上下文和关闭当前 tab 的能力
  - 桌面代理在 `Finder / Chrome` 上进一步具备“先识别上下文，再决定下一步”的基础
- 这一步没有试图解决的是：
  - `Terminal` 的持续等待、完成态判断、退出码观察
  - `Chrome` 的按域名过滤、按 URL 精确筛选后的高层动作
  - `M5` 的权限引导、失败兜底和更明显的产品化呈现

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`178` 个测试通过
- 构建：通过
- 备注：仍有现有的 Vite dynamic import warning，无新增构建错误

### 下一步

- 继续 `M4`
  - 优先补 `Terminal` 的等待/完成态观察
  - 继续补 `Chrome` 的 tab filter / 关闭后的闭环反馈
  - 评估哪些电脑、浏览器、终端动作可以开始进入 `M5` 的产品化暴露

## Step 51

- `M4` 第十六步
- 目标：
  - 补齐 `Terminal` 的等待型观察能力
  - 把 `Chrome` 的 tab 识别从“列出全部”推进到“按 query 精准筛选”

### 本次范围

- 新增 `terminal.wait_for_output`
- 新增 `chrome.find_tabs`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.wait_for_output`
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.find_tabs`
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `terminal.wait_for_output` 的结构化轮询执行
  - 新增 `chrome.find_tabs` 的 tab 过滤执行
  - 新增结构化结果解析：
    - `TerminalWaitForOutputObservation`
    - `ChromeTabMatchObservation`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `terminal_wait_for_output`
  - 新增 `chrome_find_tabs`
  - 两个工具都接入 preflight、adapter executor、审批链、step reporter
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述两个工具目录条目
- `src/main/services/agent/permission-handler.ts`
  - 新增上述两个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述两个动作的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述两个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal / iTerm` 不再只能“读一次输出”，开始具备等待某段关键输出出现的能力
  - `Chrome` 不再只会“列出全部 tab”，开始具备按标题、URL、域名筛选 tab 的能力
  - 桌面代理在终端和浏览器上更接近“观察 -> 判断 -> 再行动”的闭环
- 这一步没有试图解决的是：
  - 退出码、命令完成态、终端 idle 检测
  - Chrome tab 关闭后的自动确认、tab 级恢复建议
  - `M5` 的更明显产品化暴露和权限引导

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`188` 个测试通过
- 构建：通过
- 备注：仍有现有的 Vite dynamic import warning，无新增构建错误

### 下一步

- 继续 `M4`
  - 继续补 `Terminal` 的完成态 / idle 观察
  - 继续补 `Chrome` 的关闭后确认与更细粒度 tab 闭环反馈
  - 评估哪些电脑、浏览器、终端动作可以开始进入 `M5` 的产品化暴露

## Step 52

- `M4` 第十七步
- 目标：
  - 补齐 `Terminal` 的 idle 观察能力
  - 把 `Chrome` 的 tab 操作从“只关当前 tab”推进到“按 query 批量关闭”

### 本次范围

- 新增 `terminal.wait_until_idle`
- 新增 `chrome.close_tabs`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.wait_until_idle`
- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.close_tabs`
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `terminal.wait_until_idle` 的结构化轮询执行
  - 新增 `chrome.close_tabs` 的 tab 匹配、聚焦、关闭与结果确认
  - 新增结构化结果解析：
    - `TerminalIdleObservation`
    - `ChromeCloseTabsObservation`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `terminal_wait_until_idle`
  - 新增 `chrome_close_tabs`
  - 两个工具都接入 preflight、adapter executor、审批链、step reporter
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述两个工具目录条目
- `src/main/services/agent/permission-handler.ts`
  - 新增上述两个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述两个动作的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述两个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal / iTerm` 不再只能等待某段文本出现，开始具备“输出稳定下来”的 idle 判断能力
  - `Chrome` 不再只能关闭当前 tab，开始具备按标题、URL、域名筛选并关闭匹配 tab 的能力
  - 桌面代理在终端和浏览器上更接近“观察 -> 判断 -> 收尾”的闭环
- 这一步没有试图解决的是：
  - 退出码、命令完成态、终端会话历史读取
  - Chrome tab 关闭后的恢复建议、撤销能力
  - `M5` 的更明显产品化暴露和权限引导

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`198` 个测试通过
- 构建：通过
- 备注：仍有现有的 Vite dynamic import warning，无新增构建错误

### 下一步

- 继续 `M4`
  - 继续补 `Terminal` 的完成态 / exit status / 更强输出观察
  - 继续补 `Chrome` 的 active tab 闭环确认与更细粒度 tab 管理
  - 评估哪些电脑、浏览器、终端动作可以开始进入 `M5` 的产品化暴露

## Step 53

- `M4` 第十八步
- 目标：
  - 把 `Terminal` 的完成态和 exit status 接进结构化工具层
  - 让“运行命令”从单纯派发动作升级到“运行并等待结果”的闭环

### 本次范围

- 新增 `terminal.run_command_and_wait`
- 新增 `terminal.run_command_in_directory_and_wait`
- 给现有 terminal command builder 补上结构化 exit-status marker

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.run_command_and_wait`
  - 新增 `terminal.run_command_in_directory_and_wait`
  - 现有 `run_command / new_tab_run_command / new_window_run_command / run_command_in_directory` 全部补上结构化 `__SKILLSFAN_EXIT_STATUS__=` marker
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - `terminal.read_output` 现在会解析并剥离 exit-status marker
  - `terminal.wait_for_output / terminal.wait_until_idle` 现在会一并返回 `completed / exitStatus / exitMarkerCount`
  - 新增结构化等待 helper，让 `run_command_and_wait` 两条路径能基于 marker 轮询完成态
  - 新增结构化结果解析：
    - `TerminalCommandCompletionObservation`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `terminal_run_command_and_wait`
  - 新增 `terminal_run_command_in_directory_and_wait`
  - 两个工具都接入 preflight、adapter executor、审批链、step reporter
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述两个工具目录条目
- `src/main/services/agent/permission-handler.ts`
  - 新增上述两个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增上述两个动作的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述两个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `tool search`
  - `permission handler`
  - `tool reporting`
  - `host runtime index`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal / iTerm` 不再只是“发命令”或“看输出”，开始具备“运行并等完成态”的闭环能力
  - 结构化 terminal 输出里开始有 `completed / exitStatus / exitMarkerCount`，后续 agent 可以直接基于结果判断是否成功
  - `read_output` 不会把内部 marker 直接暴露给用户，而是把它转成结构化状态字段
- 这一步没有试图解决的是：
  - 多 session / 多 pane / 指定 terminal tab 的精细 targeting
  - 任意历史命令的原生 exit-status 读取
  - 更强的命令完成态推断，比如 prompt 恢复、shell 类型识别

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`208` 个测试通过
- 构建：通过
- 备注：仍有现有的 Vite dynamic import warning，无新增构建错误

### 下一步

- 继续 `M4`
  - 继续补 `Terminal` 的 session / tab / pane targeting
  - 继续补 `Chrome` 更细粒度的 tab 管理与闭环确认
  - 评估哪些电脑、浏览器、终端动作可以开始进入 `M5` 的产品化暴露

## Step 54

- `M4` 第十九步
- 目标：
  - 把 `Terminal / iTerm` 从“只能盯当前前台会话”升级成“可枚举、可聚焦、可定向读写”
  - 给后续 `iTerm pane` 和更强的终端工作流补一层稳定的 targeting 基础

### 本次范围

- 新增 `terminal.list_sessions`
- 新增 `terminal.focus_session`
- 给现有 terminal 的 `run/read/wait` 工具补上 `windowIndex / tabIndex / sessionIndex`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.list_sessions`
  - 新增 `terminal.focus_session`
  - `run_command / run_command_in_directory / read_output` 以及相关 wait 脚本全部支持 `windowIndex / tabIndex / sessionIndex`
  - iTerm 脚本现在可以枚举 `windows / tabs / sessions`
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `TerminalSessionObservation`
  - 新增 `TerminalSessionListObservation`
  - 新增 terminal target 解析和 `windowIndex / tabIndex / sessionIndex` 校验
  - `terminal.read_output / wait_for_output / wait_until_idle / run_command_and_wait / run_command_in_directory_and_wait` 的结构化结果里会带 target 信息
  - 新增 `terminal.list_sessions / terminal.focus_session` 执行分支
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `terminal_list_sessions`
  - 新增 `terminal_focus_session`
  - `terminal_run_command`
  - `terminal_run_command_in_directory`
  - `terminal_read_output`
  - `terminal_wait_for_output`
  - `terminal_wait_until_idle`
  - `terminal_run_command_and_wait`
  - `terminal_run_command_in_directory_and_wait`
  - 上述工具全部支持可选 `windowIndex / tabIndex / sessionIndex`
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增 `terminal_list_sessions`
  - 新增 `terminal_focus_session`
- `src/main/services/agent/permission-handler.ts`
  - 新增上述两个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `terminal_list_sessions / terminal_focus_session` 的 summary
  - 现有 terminal summary 现在会显示 `[w:t:s]` target 上下文
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述两个动作的 UI label
- `src/main/services/local-tools/macos-ui.ts`
  - 新增 `session not found` 的错误分类，避免 terminal targeting 失败时只落成泛化 execution error
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `host runtime index`
  - `sdk mcp server`
  - `permission handler`
  - `tool reporting`
  - `tool search`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal / iTerm` 终于有了结构化 session 视图，agent 不需要再完全盲打当前前台会话
  - 终端工具首次支持 `windowIndex / tabIndex / sessionIndex` 级别定向，后面补 `iTerm pane`、命令完成态、工作流闭环时不会再重走一遍参数模型
  - 活动摘要和步骤流里能直接看到终端动作的 target 上下文，排障信息更清楚
- 这一步没有试图解决的是：
  - `interrupt_process` 的目标化
  - `iTerm split pane` 的专门 pane 模型
  - `Terminal / iTerm` 的更强历史命令识别和退出状态回溯

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`218` 个测试通过
- 构建：通过
- 备注：仍有现有的 Vite dynamic import warning，无新增构建错误

### 下一步

- 继续 `M4`
  - 补 `Terminal` 的 pane / session 级别进一步闭环能力，比如 `read_output` 之后的完成态确认和更明确的 target workflow
  - 继续补 `Chrome` 更细粒度的 tab 管理与等待/确认
  - 评估 `Terminal / Chrome / iTerm` 哪一批能力已经可以开始进入 `M5` 的产品化收口

## Step 55

- `M4` 第二十步
- 目标：
  - 把 `Chrome` 从“能列 tab / 找 tab / 读 active tab”继续推进到“能等待目标状态真的出现”
  - 给浏览器工作流补上稳定的等待闭环，减少 agent 盲切 tab 之后立即失败的情况

### 本次范围

- 新增 `chrome.wait_for_tab`
- 新增 `chrome.wait_for_active_tab`
- 同步补齐工具目录、审批、step summary、活动卡片和搜索

### 已完成

- `src/gateway/host-runtime/desktop/adapters/chrome.ts`
  - 新增 `chrome.wait_for_tab`
  - 新增 `chrome.wait_for_active_tab`
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `ChromeWaitForTabObservation`
  - 新增 `ChromeWaitForActiveTabObservation`
  - 新增基于 `list_tabs` 的 polling wait helper
  - 新增基于 `get_active_tab` 的 polling wait helper
  - `chrome.wait_for_tab` 支持 `query / field / limit / pollIntervalMs / timeoutMs`
  - `chrome.wait_for_active_tab` 支持 `query / field / pollIntervalMs / timeoutMs`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `chrome_wait_for_tab`
  - 新增 `chrome_wait_for_active_tab`
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述两个工具目录项
- `src/main/services/agent/permission-handler.ts`
  - 新增上述两个工具审批规则
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `chrome_wait_for_tab / chrome_wait_for_active_tab` 的 summary
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述两个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapter executor`
  - `sdk mcp server`
  - `permission handler`
  - `tool reporting`
  - `tool search`

### 这一小步的定位

- 这一步解决的是：
  - `Chrome` 首次有了“等到目标 tab 出现再继续”的结构化等待能力
  - `Chrome` 首次有了“等到当前 active tab 真变成目标页面”的闭环确认
  - 浏览器类桌面工具开始具备更像自动化工作流的等待语义，而不是纯动作堆叠
- 这一步没有试图解决的是：
  - tab 关闭后的撤销能力
  - 更细粒度的 `window/profile` 级别浏览器 targeting
  - 网页内 DOM 语义操作，那仍然属于 AI Browser 那条线

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`5` 个测试文件，`215` 个测试通过
- 构建：待本轮最终构建确认
- 备注：新增等待链路使用现有 `Chrome list/get-active` 解析，不引入第二套匹配模型

### 下一步

- 继续 `M4`
  - 补 `Terminal / iTerm` 更强的 pane / session 闭环能力
  - 继续补 `Chrome` 的 tab 管理和等待后的恢复建议
  - 评估 `Terminal / Chrome / iTerm` 哪一批能力可以开始进入 `M5` 的产品化收口

## Step 56

- `M4` 第二十一步
- 目标：
  - 把 `Terminal / iTerm` 的 session targeting 从“能指定 session”推进到“能读 session 状态、等 session 结束、精确中断 session”
  - 给后续 pane/session 工作流补上第一批真正闭环的状态能力

### 本次范围

- 新增 `terminal.get_session_state`
- 新增 `terminal.wait_until_not_busy`
- 让 `terminal.interrupt_process` 支持 `windowIndex / tabIndex / sessionIndex`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.get_session_state`
  - 新增 `terminal.wait_until_not_busy`
  - 新增 `buildTerminalGetSessionStateScript()`
  - `terminal.interrupt_process` 的 method 描述更新为可定向 session
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `TerminalSessionStateObservation`
  - 新增 `TerminalBusyWaitObservation`
  - 新增 `parseTerminalSessionStateObservation()`
  - 新增 `waitForTerminalSessionNotBusy()`
  - `terminal.interrupt_process` 在指定 target 时会先 focus 对应 session，再发送 `Ctrl+C`
  - 新增 `terminal.get_session_state / terminal.wait_until_not_busy` 执行分支
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增 `terminal_get_session_state`
  - 新增 `terminal_wait_until_not_busy`
  - `terminal_interrupt_process` 现在支持可选 `windowIndex / tabIndex / sessionIndex`
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增上述两个工具目录项
- `src/main/services/agent/permission-handler.ts`
  - 新增上述两个工具审批规则
  - `terminal_interrupt_process` 指定 target 时会显示目标 session
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `terminal_get_session_state / terminal_wait_until_not_busy` 的 summary
  - `terminal_interrupt_process` 的 summary 现在支持显示 target 上下文
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增上述两个动作的 UI label
- 相邻测试已补齐：
  - `desktop adapter executor`
  - `sdk mcp server`
  - `permission handler`
  - `tool reporting`
  - `tool search`

### 这一小步的定位

- 这一步解决的是：
  - agent 终于能直接读取单个 `Terminal / iTerm` session 的 `active / busy / title / tty`
  - agent 终于能等到指定 session 变成 not busy，再决定下一步，而不只是靠输出文本变化猜测
  - `interrupt_process` 不再只能盯当前前台会话，开始真正支持定向 session 中断
- 这一步没有试图解决的是：
  - iTerm split-pane 的更显式 pane tree 模型
  - 历史命令回溯、last command identity、完整退出原因归因
  - 一键恢复 session / pane 布局

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`5` 个测试文件，`226` 个测试通过
- 构建：待本轮最终构建确认
- 备注：`wait_until_not_busy` 会在 session 不 busy 后补一次输出读取，用来附带 `completed / exitStatus / exitMarkerCount`

### 下一步

- 继续 `M4`
  - 评估是否把 `iTerm` 的 pane 拆成更显式的 pane 级 targeting 模型
  - 继续补 `Terminal / iTerm` 的完成态和恢复建议
  - 继续评估 `Terminal / Chrome / iTerm` 哪一批能力可以开始进入 `M5`

## Step 57

- `M4` 第二十二步
- 目标：
  - 把 `iTerm / iTerm2` 的 split pane 从“隐含在 sessionIndex 里”推进到“显式 paneIndex targeting”
  - 让现有 `run/read/wait/interrupt/focus/list` 这批终端工具都能稳定指向 pane，而不是只靠当前前台 session

### 本次范围

- 给 terminal target schema 增加 `paneIndex`
- 让 terminal executor / MCP tools / approval / summary / search 一起理解 pane targeting
- 不新增一批 `iterm_*` 重复工具，而是在现有 terminal 工具上显式打通 pane

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - `TerminalSessionTarget` 新增 `paneIndex`
  - iTerm target 选择逻辑现在优先按 `paneIndex` 选中 pane/session
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - `DesktopAdapterMethodExecutionInput` 新增 `paneIndex`
  - terminal target resolver 新增校验：
    - `paneIndex` 只允许用于 `iTerm / iTerm2`
    - `paneIndex` 与 `sessionIndex` 同时提供时必须一致
  - terminal observations 新增 `paneIndex`
  - iTerm `list/get/read/wait` 结果会回传 pane targeting 信息
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - terminal tool schema 新增 `paneIndex`
  - `terminal_run_command / terminal_run_command_in_directory / terminal_focus_session / terminal_interrupt_process / terminal_get_session_state / terminal_read_output / terminal_wait_for_output / terminal_wait_until_not_busy / terminal_wait_until_idle / terminal_run_command_and_wait / terminal_run_command_in_directory_and_wait` 已透传 pane targeting
  - `terminal_run_command_in_directory_and_wait` 顺手补回 `terminalTargetSchema`
- `src/main/services/agent/permission-handler.ts`
  - terminal 审批文案已支持 pane 目标描述
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - terminal summary 支持 `[w:t:p]`
  - 当 `sessionIndex` 与 `paneIndex` 相同，不再重复显示
- `src/main/services/local-tools/tool-catalog.ts`
  - terminal 工具目录描述已补 pane 关键词，便于工具搜索
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `permission handler`
  - `tool reporting`
  - `tool search`

### 这一小步的定位

- 这一步解决的是：
  - agent 终于可以显式操作 `iTerm split pane`
  - `interrupt/read/wait` 不再只能依赖“当前 pane 正好在前台”
  - `pane` 首次成为 terminal 工具的一等定位字段，而不是隐藏在 session 抽象里
- 这一步没有试图解决的是：
  - iTerm pane tree / split direction / parent-child 结构建模
  - pane 创建、pane 关闭、pane 布局恢复
  - 完整的命令历史和最后一次命令 identity

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`6` 个测试文件，`232` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M4`
  - 补 `iTerm` 更显式的 pane tree / pane 创建能力，或继续补 pane 级恢复建议
  - 继续补 `Terminal / iTerm` 的完成态、exit status 和 session 恢复提示
  - 评估 `Terminal / Chrome / iTerm` 哪一批能力已经可以开始进入 `M5` 的产品化收口

## Step 58

- `M4` 第二十三步
- 目标：
  - 让 `Terminal / iTerm` 的 `get/read/wait/run-and-wait` 结果统一暴露完成态，而不是只回传 `completed / exitStatus`
  - 在 timeout、idle-without-exit-status、非零退出这几类场景下，开始给 agent 和用户返回结构化恢复建议

### 本次范围

- 给 terminal observations 增加 `completionState / recoveryHint / recoverySuggestions`
- 把 terminal MCP 工具的 JSON 响应和 step metadata 一起补齐
- 不改动 UI 交互形态，只先把完成态和恢复建议铺到执行结果层

### 已完成

- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - terminal output/session/wait observations 统一新增：
    - `completionState`
    - `recoveryHint`
    - `recoverySuggestions`
  - 补了统一恢复建议生成逻辑：
    - `succeeded`
    - `failed`
    - `running`
    - `idle_without_exit_status`
  - `wait_for_output / wait_until_not_busy / wait_until_idle / run_command_and_wait / run_command_in_directory_and_wait` 的 timeout/完成分支现在都会带恢复建议
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - `terminal_get_session_state / terminal_read_output / terminal_wait_for_output / terminal_wait_until_not_busy / terminal_wait_until_idle / terminal_run_command_and_wait / terminal_run_command_in_directory_and_wait` 的响应默认值已补齐恢复字段
  - 终端工具失败时会把 `recoveryHint` 和第一条恢复建议拼到错误文本里
  - step metadata 新增：
    - `completionState`
    - `recoveryHint`
    - `recoverySuggestionCount`
- 相邻测试已更新：
  - `desktop adapter executor`
  - `sdk mcp server`

### 这一小步的定位

- 这一步解决的是：
  - agent 终于能区分“命令成功结束”、“命令失败退出”、“还在跑”、“看起来空闲但没有可靠退出状态”
  - timeout 和失败场景不再只剩一段通用报错，开始有下一步恢复建议
  - `Terminal / iTerm` 从“会操作终端”进一步变成“会判断终端状态并指导恢复”
- 这一步没有试图解决的是：
  - 真正的命令 identity 跟踪
  - 历史输出滚动回放
  - 自动重试或一键恢复工作流

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts
npm run build
```

### 结果

- 通过
- 单测：`2` 个测试文件，`86` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M4`
  - 继续补 `Terminal / iTerm` 更强的完成态闭环，例如 command identity、pane tree、pane create
  - 继续评估哪些终端恢复建议应该上提到更明显的产品诊断面
  - 继续收敛 `Terminal / Chrome / iTerm` 哪一批能力已经具备进入 `M5` 的条件

## Step 59

- `M4` 第二十四步
- 目标：
  - 让 `iTerm / iTerm2` 的 pane 不只是“能被 target”，还要能被显式枚举和创建
  - 继续把终端能力从“操作当前 pane”推进到“管理 pane 工作流”

### 本次范围

- 新增 `terminal.list_panes`
- 新增 `terminal.split_pane_run_command`
- 把 executor、MCP tools、审批、工具目录、摘要、活动卡片和搜索一起补齐

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.list_panes`
  - 新增 `terminal.split_pane_run_command`
  - 新增 `buildTerminalListPanesScript()`
  - 新增 `buildTerminalSplitPaneRunCommandScript()`
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `TerminalPaneListObservation`
  - 新增 `TerminalSplitPaneObservation`
  - 新增 iTerm-only 校验和 pane list target 解析
  - `terminal.list_panes` 现在会返回：
    - `panes`
    - `totalPanes`
    - `returnedPanes`
    - `windowIndex`
    - `tabIndex`
  - `terminal.split_pane_run_command` 现在会返回新 pane 的 session state，以及：
    - `direction`
    - `created`
    - `completionState / recoveryHint / recoverySuggestions`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增正式工具：
    - `terminal_list_panes`
    - `terminal_split_pane_run_command`
  - 已接入 tool response、step metadata 和失败文本
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增两条 terminal pane 工具目录描述
- `src/main/services/agent/permission-handler.ts`
  - 新增两条审批文案：
    - `List terminal panes`
    - `Split terminal pane (...) and run: ...`
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `terminal_list_panes / terminal_split_pane_run_command` 的摘要
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增两条 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `permission handler`
  - `tool reporting`
  - `tool search`

### 这一小步的定位

- 这一步解决的是：
  - agent 终于能显式列出某个 iTerm tab 里的 panes，而不只是把它们混在 session 列表里
  - agent 终于能以“拆 pane + 直接运行命令”的方式创建新的终端执行上下文
  - `pane` 不再只是被动 target 字段，开始变成可以被枚举和扩展的工作流对象
- 这一步没有试图解决的是：
  - 真正的 pane tree / split hierarchy 结构
  - pane close / pane resize / layout restore
  - command identity 和历史 pane 恢复

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`6` 个测试文件，`242` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M4`
  - 继续补 `iTerm` 的 pane tree / split hierarchy 信息
  - 继续补 `Terminal / iTerm` 的 command identity、last command result、pane 恢复建议
  - 继续评估哪些 terminal / chrome / iterm 能力已经接近 `M5` 的产品化门槛

## Step 60

- `M4` 第二十五步
- 目标：
  - 把 `iTerm / iTerm2` 的 pane tree / split hierarchy 从“下一步计划”推进到“有正式结构化读取入口”
  - 先交付稳定的 pane layout snapshot，而不在 AppleScript 原生能力不足时伪造过深的父子关系

### 本次范围

- 新增 `terminal.get_pane_layout`
- 新增正式工具 `terminal_get_pane_layout`
- 把 executor、MCP tools、审批、工具目录、摘要、活动卡片和搜索一起补齐

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.get_pane_layout`
  - 新增 `buildTerminalGetPaneLayoutScript()`
  - pane layout script 现在会返回每个 pane 的：
    - `windowIndex / tabIndex / sessionIndex / paneIndex`
    - `active / busy / title / tty`
    - `columns / rows`
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增：
    - `TerminalPaneLayoutPaneObservation`
    - `TerminalPaneLayoutHierarchyNode`
    - `TerminalPaneLayoutObservation`
  - 新增 `parseTerminalPaneLayoutObservation()`
  - `terminal.get_pane_layout` 现在会返回：
    - `panes`
    - `totalPanes`
    - `activePaneIndex`
    - `supportedSplitDirections`
    - `hierarchySource`
    - `splitHierarchy`
    - `windowIndex / tabIndex`
  - 当前 `splitHierarchy` 的来源是：
    - `synthetic_flat`
    - 也就是基于当前 tab pane 集合构造出的最小层级树，先保证稳定可读
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增正式工具：
    - `terminal_get_pane_layout`
  - 已接入 tool response、step metadata 和失败文本
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增一条 pane layout 工具目录描述
- `src/main/services/agent/permission-handler.ts`
  - 新增审批文案：
    - `Read terminal pane layout`
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `terminal_get_pane_layout` 摘要
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增一条 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `permission handler`
  - `tool reporting`
  - `tool search`

### 这一小步的定位

- 这一步解决的是：
  - agent 终于能读取某个 iTerm tab 的结构化 pane layout，而不只是拿一份 pane 平铺列表
  - pane 现在除了“能列、能拆、能 target”，还开始具备“能读布局快照”的能力
  - `M4` 第一步里关于 `pane tree / split hierarchy` 的 1 号任务已经有最小可用入口
- 这一步没有试图解决的是：
  - AppleScript 原生不可稳定暴露的真实父子 split 树
  - pane close / resize / layout restore
  - command identity / last command result

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`6` 个测试文件，`247` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续按 `1 -> 2 -> 3` 顺序推进
  - 继续补 `Terminal / iTerm` 的 command identity、last command result
  - 然后开始评估哪些 `Terminal / Chrome / iTerm` 能力已经具备进入 `M5` 的门槛

## Step 61

- `M4` 第二十六步
- 目标：
  - 把 `Terminal / iTerm` 的 command identity / last command result 从“恢复建议里的隐含能力”推进到正式结构化能力
  - 让 agent 不只知道“有退出码”，还知道“最后一条结构化命令是谁、结果是什么”

### 本次范围

- terminal command dispatch 开始写入结构化 `commandId / command result` markers
- 新增 `terminal.get_last_command_result`
- 新增正式工具 `terminal_get_last_command_result`

### 已完成

- `src/gateway/host-runtime/desktop/adapters/terminal.ts`
  - 新增 `terminal.get_last_command_result`
  - 新增 marker 常量：
    - `TERMINAL_COMMAND_START_MARKER_PREFIX`
    - `TERMINAL_COMMAND_RESULT_MARKER_PREFIX`
  - `buildTerminalCommandWithExitStatusMarker()` 现在支持可选 `commandId`
  - `run / new tab / new window / run in directory / split pane / run-and-wait` 这些命令分发脚本现在都会带上结构化 command markers
- `src/gateway/host-runtime/desktop/adapters/executor.ts`
  - 新增 `TerminalLastCommandResultObservation`
  - `parseTerminalOutput()` 现在除了旧的 `exitStatus / exitMarkerCount`，还会识别：
    - `lastCommandId`
    - `lastCommandCompleted`
    - `lastCommandExitStatus`
  - 新增 `parseTerminalLastCommandResultObservation()`
  - 新增 `terminal.get_last_command_result`
  - `terminal.run_command_and_wait / terminal.run_command_in_directory_and_wait / terminal.split_pane_run_command` 的返回里现在也会带 `commandId`
- `src/main/services/local-tools/sdk-mcp-server.ts`
  - 新增正式工具：
    - `terminal_get_last_command_result`
  - 已接入 tool response、step metadata 和失败文本
- `src/main/services/local-tools/tool-catalog.ts`
  - 新增一条 last command result 工具目录描述
- `src/main/services/agent/permission-handler.ts`
  - 新增审批文案：
    - `Read terminal last command result`
- `src/gateway/host-runtime/step-reporter/tool-reporting.ts`
  - 新增 `terminal_get_last_command_result` 摘要
- `src/renderer/components/tool/HostActivityCard.tsx`
  - 新增一条 UI label
- 相邻测试已补齐：
  - `desktop adapters`
  - `desktop adapter executor`
  - `sdk mcp server`
  - `permission handler`
  - `tool reporting`
  - `tool search`

### 这一小步的定位

- 这一步解决的是：
  - agent 终于能稳定读取“最后一条结构化 terminal 命令结果”
  - terminal 自动化开始有明确的 command identity，而不只是从 output 尾巴里猜是不是结束了
  - `1 -> 2 -> 3` 里的第 2 项已经有正式接口
- 这一步没有试图解决的是：
  - 更长历史的 command result timeline
  - terminal session 级别的 command journal
  - `M5` 权限引导、失败兜底、smoke flow 产品化收口

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/desktop-adapter-executor.test.ts tests/unit/services/local-tools/sdk-mcp-server.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/host-runtime/tool-reporting.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`6` 个测试文件，`252` 个测试通过
- 构建：通过

### 下一步

- 开始第 3 项
  - 继续评估并收敛 `Terminal / Chrome / iTerm` 里哪些能力已经满足进入 `M5` 的门槛
  - 优先把最接近产品化的 terminal / chrome / iterm 能力整理成 `active` 级别产品清单

## Step 62

- `M5` 第一步
- 目标：
  - 把已经足够稳定的 `Terminal / Chrome / iTerm` 能力从“方法集合”正式收成 `M5-ready` 产品化 adapter 与工作流清单
  - 让用户在现有设置页和诊断面里能直接看到哪些流程已经进入产品化范围

### 本次范围

- 将 `Terminal Adapter`、`Chrome Adapter` 在 macOS 上提升为 `active / supported`
- 为 `Terminal / Chrome` 补充 adapter 级 `workflows`
- 将 workflow 元数据接入 `host status / gateway services / doctor / Settings > Desktop Automation`

### 已完成

- `src/gateway/host-runtime/types.ts`
  - 新增 `DesktopAdapterWorkflowCapability`
  - `DesktopAdapterCapability` 现在支持 `workflows`
- `src/shared/types/host-runtime.ts`
  - `HostDesktopAdapterStatus` 现在支持 `workflows`
- `src/gateway/host-runtime/desktop/adapters/registry.ts`
  - `Terminal Adapter` 在 macOS 上提升为 `active / supported`
  - `Chrome Adapter` 在 macOS 上提升为 `active / supported`
  - 新增产品化 workflow：
    - `terminal.session-control`
    - `terminal.run-and-verify`
    - `iterm.pane-ops`
    - `chrome.tab-navigation`
    - `chrome.tab-observe`
    - `chrome.tab-cleanup`
- `src/gateway/host-runtime/status/runtime.ts`
  - host status 现在会透传 adapter workflows
- `src/gateway/server/services.ts`
  - host service metadata 现在会返回：
    - `desktopActiveWorkflowIds`
    - `desktopPlannedWorkflowIds`
- `src/gateway/doctor/report.ts`
  - doctor `host-permissions` metadata 现在会返回：
    - `activeWorkflowIds`
    - `plannedWorkflowIds`
- `src/renderer/pages/SettingsPage.tsx`
  - `Desktop Automation` 卡片现在新增 `Productized Workflows`
  - 可直接看到每个 active adapter 的 workflow pack、说明和 method 清单
- 相邻测试已补齐：
  - `desktop adapters`
  - `host runtime index`
  - `gateway services`
  - `doctor report`

### 这一小步的定位

- 这一步解决的是：
  - `Terminal / Chrome / iTerm` 终于开始从“工程方法集合”变成“产品能力集合”
  - 用户现在能在现有设置页里直接看到 `M5-ready` workflow packs，而不是只看到一堆 method 名
  - 后续做权限引导、失败兜底和 smoke flow 时，已经有了稳定的 adapter/workflow 边界
- 这一步没有试图解决的是：
  - `Finder / SkillsFan` 的产品化收口
  - 更细的权限引导 UI
  - 更强的失败恢复 UI
  - smoke flow 自动化验证

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`4` 个测试文件，`17` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M5`
  - 把 `Terminal / Chrome / iTerm` 的权限引导、失败兜底和 smoke flow 收进产品面
  - 再决定 `Finder / SkillsFan` 哪一批能力进入下一轮产品化清单

## Step 63

- `M5` 第二步
- 目标：
  - 给 `M5-ready` workflow 增加真正可读的 readiness / blocker / recovery 状态
  - 让设置页和 doctor 不只知道“有哪些 workflow”，还知道“哪些 workflow 现在能用、哪些被权限挡住、怎么恢复”

### 本次范围

- 给 desktop workflow status 增加：
  - `blockedByPermission`
  - `blockedMethodIds`
  - `recoveryHint`
- 将 blocked workflow 元数据接入 `host status / gateway services / doctor`
- 将 workflow readiness 与恢复提示直接显示到 `Settings > Desktop Automation`

### 已完成

- `src/shared/types/host-runtime.ts`
  - `HostDesktopAdapterStatus.workflows` 现在支持：
    - `blockedByPermission`
    - `blockedMethodIds`
    - `recoveryHint`
- `src/gateway/host-runtime/status/runtime.ts`
  - 基于 blocked desktop actions 计算 workflow-level readiness
  - `terminal.run-and-verify`、`chrome.tab-navigation`、`chrome.tab-cleanup` 这类依赖快捷键/窗口控制的 workflow，在 Accessibility 缺失时会被显式标记为 blocked
- `src/gateway/server/services.ts`
  - host service metadata 现在新增：
    - `desktopBlockedWorkflowIds`
- `src/gateway/doctor/report.ts`
  - `host-permissions` metadata 现在新增：
    - `blockedWorkflowIds`
- `src/renderer/pages/SettingsPage.tsx`
  - `Productized Workflows` 现在会显示每个 workflow 的：
    - `Ready / Blocked` badge
    - `recoveryHint`
    - `blockedMethodIds`
  - 同时新增顶层 `Blocked workflows` 提示
- 相邻测试已补齐：
  - `host runtime index`
  - `gateway services`
  - `doctor report`

### 这一小步的定位

- 这一步解决的是：
  - `M5` 的 workflow 终于开始具备“产品级 readiness”语义，而不只是一个 capability 列表
  - 用户现在能在设置页里直接看到哪些 terminal/chrome workflow 因为权限问题暂时不可用，以及恢复建议
  - 后续做权限引导按钮和失败兜底 UI 时，已经有稳定的数据字段可以直接复用
- 这一步没有试图解决的是：
  - 自动跳转系统权限设置
  - workflow 级重试按钮
  - smoke flow 自动化执行和回归矩阵

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`3` 个测试文件，`13` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M5`
  - 把 workflow 级权限引导和失败兜底从“诊断信息”推进到“可操作产品入口”
  - 再开始补 `Terminal / Chrome / iTerm` 的 smoke flow

## Step 64

- `M5` 第三步
- 目标：
  - 把 workflow 级恢复信息从“可读”推进到“可操作”
  - 让用户在设置页里可以直接打开相关系统设置，或者复制一份当前 workflow 阻塞和恢复建议

### 本次范围

- 在 `Settings > Desktop Automation` 增加：
  - `Open Accessibility Settings`
  - `Open Screen Recording Settings`
  - `Copy Recovery Guide`
- 补齐相应的中英文文案

### 已完成

- `src/renderer/pages/SettingsPage.tsx`
  - 新增：
    - `MACOS_ACCESSIBILITY_SETTINGS_URL`
    - `MACOS_SCREEN_RECORDING_SETTINGS_URL`
    - `buildDesktopWorkflowRecoveryGuide()`
    - `handleOpenDesktopPermissionSettings()`
    - `handleCopyDesktopWorkflowRecoveryGuide()`
  - 当 desktop workflow 被权限挡住时，设置页现在可直接：
    - 打开 macOS 辅助功能设置
    - 打开 macOS 屏幕录制设置
    - 复制当前 blocked workflow 的恢复指南
- `src/renderer/i18n/locales/en.json`
  - 新增：
    - `Open Accessibility Settings`
    - `Open Screen Recording Settings`
    - `Copy Recovery Guide`
    - `Blocked workflows`
    - `Blocked methods`
    - `Blocked`
- `src/renderer/i18n/locales/zh-CN.json`
  - 新增对应中文文案
- 相邻测试已回归：
  - `host runtime index`
  - `gateway services`
  - `doctor report`

### 这一小步的定位

- 这一步解决的是：
  - `M5` 的恢复链路第一次有了“点一下就能做事”的产品入口，而不只是提示文字
  - 用户不需要自己再去记系统设置路径，设置页已经能直接帮他跳过去
  - 被挡住的 workflow 现在也能一键复制恢复指南，方便用户自助排障或发给别人
- 这一步没有试图解决的是：
  - 自动检测用户从系统设置返回后的权限变化
  - workflow 级自动重试
  - smoke flow 自动化验证

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`3` 个测试文件，`13` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M5`
  - 开始补 `Terminal / Chrome / iTerm` 的 smoke flow
  - 再根据 smoke flow 结果补失败兜底和 workflow 级重试

## Step 65

- `M5` 第四步
- 目标：
  - 把 `Terminal / Chrome / iTerm` 的 smoke flow 从“文档计划”推进到正式产品元数据
  - 让设置页、host status、gateway services 和 doctor 都能看到 smoke flow 清单与阻塞状态

### 本次范围

- 新增 adapter 级 smoke flow capability
- 为 `Terminal / Chrome` 补一批 `M5-ready` smoke flows
- 将 smoke flow 状态接入：
  - `host status`
  - `gateway services`
  - `doctor`
  - `Settings > Desktop Automation`

### 已完成

- `src/gateway/host-runtime/types.ts`
  - 新增 `DesktopAdapterSmokeFlowCapability`
- `src/shared/types/host-runtime.ts`
  - `HostDesktopAdapterStatus` 现在支持 `smokeFlows`
- `src/gateway/host-runtime/desktop/adapters/registry.ts`
  - 新增 smoke flows：
    - `terminal.command-roundtrip`
    - `terminal.session-targeting`
    - `iterm.split-pane-roundtrip`
    - `chrome.tab-roundtrip`
    - `chrome.discovery-roundtrip`
- `src/gateway/host-runtime/status/runtime.ts`
  - smoke flow 现在会复用 workflow 的权限阻塞计算，支持：
    - `blockedByPermission`
    - `blockedMethodIds`
    - `verification`
    - `recoveryHint`
- `src/gateway/server/services.ts`
  - host service metadata 现在新增：
    - `desktopActiveSmokeFlowIds`
    - `desktopBlockedSmokeFlowIds`
- `src/gateway/doctor/report.ts`
  - `host-permissions` metadata 现在新增：
    - `activeSmokeFlowIds`
    - `blockedSmokeFlowIds`
- `src/renderer/pages/SettingsPage.tsx`
  - 新增 `Smoke Flows` 区块
  - 可显示：
    - smoke flow 数量
    - `Ready / Blocked` 状态
    - `verification`
    - `blockedMethodIds`
    - `recoveryHint`
  - 同时新增 `Copy Smoke Flow Guide`
- `src/renderer/i18n/locales/en.json`
  - 新增 smoke flow 文案
- `src/renderer/i18n/locales/zh-CN.json`
  - 新增对应中文文案
- 相邻测试已补齐：
  - `desktop adapters`
  - `host runtime index`
  - `gateway services`
  - `doctor report`

### 这一小步的定位

- 这一步解决的是：
  - `M5` 的 smoke flow 终于从口头路线变成正式代码和产品可见清单
  - 用户现在能在设置页里直接看到 terminal/chrome/iterm 的 smoke flow、验证方式和阻塞原因
  - 后续如果要继续做“自动执行 smoke flow”或“workflow 级回归矩阵”，已经有稳定的 smoke flow 边界可以直接接上
- 这一步没有试图解决的是：
  - 自动执行 smoke flow
  - smoke flow 成功/失败历史
  - smoke flow 级一键重试

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`4` 个测试文件，`17` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M5`
  - 开始决定 smoke flow 是先做“手动检查清单导出”，还是直接接“自动执行 smoke flow”
  - 再根据 smoke flow 结果继续补 workflow 级失败兜底和重试

## Step 66

- `M5` 第五步
- 目标：
  - 把当前已交付的 `Terminal / Chrome / iTerm` 产品化范围正式收口
  - 给设置页补上 automation runbook 导出和当前范围标识，避免和后续 `Finder / SkillsFan` 扩面混在一起

### 本次范围

- 新增当前桌面自动化切片的 runbook 导出
- 在设置页明确标注当前 `M5` 范围
- 将这一轮的产品化重心锁定为：
  - `Terminal`
  - `Chrome`
  - `iTerm`

### 已完成

- `src/renderer/pages/SettingsPage.tsx`
  - 新增 `Copy Automation Runbook`
  - 新增 `Current Scope` 卡片
  - 运行手册导出现在会包含：
    - active adapters
    - productized workflows
    - smoke flows
    - blocked desktop actions
- `src/renderer/i18n/locales/en.json`
  - 新增 runbook / current scope 文案
- `src/renderer/i18n/locales/zh-CN.json`
  - 新增对应中文文案
- `docs/product-priority-implementation-roadmap.zh-CN.md`
  - `M5` 当前进展现在明确写出：
    - 当前已收口范围是 `Terminal / Chrome / iTerm`
    - `Finder / SkillsFan` 仍然是后续扩面对象

### 这一小步的定位

- 这一步解决的是：
  - `M5` 当前切片终于从“代码上可用”升级为“范围上可说明、可导出、可交付”
  - 产品面已经能明确告诉用户这轮桌面能力到底覆盖哪些软件和工作流
  - 后续继续做 `Finder / SkillsFan` 时，不会再和这一轮 `Terminal / Chrome / iTerm` 的收口范围混在一起
- 这一步没有试图解决的是：
  - smoke flow 自动执行
  - smoke flow 成功/失败历史
  - `Finder / SkillsFan` 的产品化收口

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-adapters.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`4` 个测试文件，`17` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 如果继续 `M5`
  - 开始做 smoke flow 自动执行或历史记录
  - 或者开始扩面到 `Finder / SkillsFan`
- 如果切主线优先级
  - 可以把当前 `Terminal / Chrome / iTerm` 切片视为已收口，转向后续阶段

## Step 67

- `M5` 第六步
- 目标：
  - 把 `smoke flow` 从“静态产品清单”推进成“可直接执行的验证动作”
  - 让设置页不只展示 smoke flow，还能留下最近一次执行结果

### 本次范围

- 新增 desktop smoke flow runner
- 给设置页 `Smoke Flows` 区块补执行入口和最近结果展示
- 将 smoke flow 最近结果回写到 host status，并透出到 `services / doctor`

### 已完成

- 新增：
  - `src/gateway/host-runtime/desktop/smoke-flows.ts`
- `src/gateway/host-runtime/status/runtime.ts`
  - smoke flow 现在支持 `lastRun`
- `src/main/ipc/gateway.ts`
  - 新增 `gateway:desktop-smoke-flow-run`
- `src/preload/index.ts`
  - 暴露 `runGatewayDesktopSmokeFlow`
- `src/renderer/api/index.ts`
  - 增加 smoke flow run API
- `src/renderer/pages/SettingsPage.tsx`
  - `Smoke Flows` 区块现在支持：
    - `Run Smoke Flow`
    - `Last Run`
    - `passed / failed / running` 状态展示
    - 最近一次 summary / duration / error
- `src/gateway/server/services.ts`
  - 新增 smoke flow 最近结果元数据：
    - `desktopRunningSmokeFlowIds`
    - `desktopPassedSmokeFlowIds`
    - `desktopFailedSmokeFlowIds`
- `src/gateway/doctor/report.ts`
  - 新增：
    - `runningSmokeFlowIds`
    - `passedSmokeFlowIds`
    - `failedSmokeFlowIds`
- `src/gateway/host-runtime/desktop/adapters/registry.ts`
  - `chrome.discovery-roundtrip` 现在改成自包含回路：
    - open
    - list
    - find
    - focus
    - confirm active
    - close
- 新增测试：
  - `tests/unit/gateway/host-runtime/desktop-smoke-flows.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - `smoke flow` 第一次真正变成可执行的产品能力
  - 用户现在可以直接在设置页验证 `Terminal / Chrome / iTerm` 的核心回路
  - 后续做 smoke flow 历史、批量回归、自动重试时，已经有稳定 runner 和 last-run 状态边界
- 这一步没有试图解决的是：
  - smoke flow 长期历史
  - smoke flow 批量调度
  - smoke flow 自动重试

### 验证

```bash
npm run test:unit -- tests/unit/gateway/host-runtime/desktop-smoke-flows.test.ts tests/unit/gateway/host-runtime/index.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`4` 个测试文件，`15` 个测试通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 如果继续深挖当前切片
  - 做 smoke flow 历史、批量执行、自动重试
- 如果开始扩面
  - 开始进入 `Finder / SkillsFan`

## Step 68: 将 Computer Automation 从 Advanced 中独立出来

### 目标

- 把已经产品化的 `Terminal / Chrome / iTerm` automation 能力从 `Advanced` 拆出，降低用户理解门槛
- 给这块能力一个稳定、直接的设置入口，并补齐 `en / zh-CN / zh-TW` 三语文案

### 本次范围

- 将 `Settings > Advanced` 内的 automation 面板迁移到独立的 `Settings > Computer Automation`
- 补齐 `Computer Automation / 电脑自动化 / 電腦自動化` 相关文案
- 保持现有 smoke flow、workflow、权限恢复入口和 runbook 导出能力不变

### 已完成

- `src/renderer/stores/app.store.ts`
  - settings section 类型已支持 `computer-automation`
- `src/renderer/pages/SettingsPage.tsx`
  - 新增独立的 `computer-automation` section
  - `Advanced` 中移除原有的 desktop automation 大面板
  - 复用现有 `renderComputerAutomationContent()` 渲染完整 automation 状态
  - 新入口支持刷新 gateway diagnostics
  - automation runbook 标题同步改为 `Computer Automation Runbook`
- `src/renderer/i18n/locales/en.json`
  - 补齐 `Computer Automation` 及 workflow/smoke-flow 相关缺失文案
- `src/renderer/i18n/locales/zh-CN.json`
  - 补齐 `电脑自动化` 相关文案并顺手把 `planned adapter` 文案中文化
- `src/renderer/i18n/locales/zh-TW.json`
  - 补齐 `電腦自動化`、workflow、smoke-flow、恢复入口等缺失的繁体文案
- `docs/product-priority-implementation-roadmap.zh-CN.md`
  - 路线图已记录 `M5` 入口已从 `Advanced` 独立出来

### 这一小步的定位

- 这一步解决的是：
  - 让用户能直接找到电脑/浏览器/终端自动化，而不是去 `Advanced` 里翻诊断项
  - 让 `M5` 当前已交付范围第一次有了更像产品功能的独立入口
  - 补齐三语文案，避免切到繁体或英文后出现大面积英文残留
- 这一步没有试图解决的是：
  - smoke flow 的批量执行
  - smoke flow 的长期历史
  - `Finder / SkillsFan` 的扩面

### 验证

```bash
npm run build
```

### 结果

- 通过
- 构建：通过
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 在当前切片继续深挖
  - 做 smoke flow 历史、批量执行、自动重试
- 如果开始扩面
  - 开始进入 `Finder / SkillsFan`

## Step 69: 补充最终运行时与自动化架构设计文档

### 目标

- 把后续实现应遵循的长期结构定成正式文档
- 明确 `Claude SDK Runtime / NativeRuntime / HostRuntime / Tool Runtime` 的分工
- 避免后续在实现时反复争论“浏览器/电脑自动化该挂在哪一层”

### 本次范围

- 新增长期架构设计文档
- 将该文档挂到产品优先级路线图中，作为后续实现参考

### 已完成

- 新增：
  - `docs/final-runtime-architecture.zh-CN.md`
- `docs/product-priority-implementation-roadmap.zh-CN.md`
  - 增加长期结构决策文档入口

### 这一步的定位

- 这一步解决的是：
  - 明确 `Claude SDK Runtime` 长期保留，不因 `NativeRuntime` 建设而删除
  - 明确浏览器、电脑、终端、iTerm 自动化属于共享 `HostRuntime / Tool Runtime`
  - 明确复杂编排优先走 `Claude SDK Runtime`，provider-native 优先走 `NativeRuntime`
- 这一步没有试图解决的是：
  - 具体代码迁移
  - runtime 路由器的最终实现细节
  - `Tool Registry` 的落地代码

### 验证

- 文档变更，无构建或测试要求

### 结果

- 完成

### 下一步

- 按该文档继续推进：
  - 先完成共享工具层
  - 再推进 `NativeRuntime`
  - 复杂任务继续保留 `Claude SDK Runtime` lane

## Step 70: 启动 M6 Tool Registry 初版

### 目标

- 把共享工具层从 `Claude SDK` 专属装配逻辑中抽离出来
- 给后续 `NativeRuntime` 复用浏览器、电脑、skill、extension 工具能力打第一层边界

### 本次范围

- 新增 `gateway/tools` 初版 registry
- 将 `sdk-options` 中的 MCP server 组装逻辑迁移到共享工具层
- 保持当前 `Claude SDK Runtime` 行为不变

### 已完成

- 新增：
  - `src/gateway/tools/types.ts`
  - `src/gateway/tools/registry.ts`
  - `src/gateway/tools/index.ts`
- `src/main/services/agent/sdk-options.ts`
  - 不再直接组装：
    - `local-tools`
    - `web-tools`
    - `ai-browser`
    - `skill`
    - extension MCP servers
  - 改为调用共享 `buildToolRegistry()`
- 新增测试：
  - `tests/unit/gateway/tools/registry.test.ts`
- 已有测试：
  - `tests/unit/services/agent/sdk-options.test.ts`
  - 已确认继续通过

### 这一小步的定位

- 这一步解决的是：
  - 工具装配第一次拥有独立于 `Claude SDK Runtime` 的共享边界
  - 后续 `NativeRuntime` 可以直接复用同一套 MCP/tool 组装逻辑
  - `sdk-options` 从“既做 prompt 又做工具装配”的混合角色开始收口
- 这一步没有试图解决的是：
  - Tool Registry 的权限统一模型
  - runtime 任务级路由
  - NativeRuntime 的真实 provider adapter

### 验证

```bash
npm run test:unit -- tests/unit/gateway/tools/registry.test.ts tests/unit/services/agent/sdk-options.test.ts
npm run build
```

### 结果

- 通过
- 单测：`2` 个测试文件，`11` 个测试通过
- 构建：通过

## Step 71: 抽共享 Tool Permission Policy 和 Catalog Type

### 目标

- 继续把共享工具层从 `Claude SDK Runtime` 的内部实现细节里抽出来
- 让 `tool metadata` 和 `permission gate` 开始拥有独立于 `sdk-options / permission-handler` 的复用边界

### 本次范围

- 抽共享 `ToolCatalogEntry` 类型
- 抽第一批 `shared tool permission policy`
- 将 `permission-handler` 中大段 local MCP 审批分支改为策略查表

### 已完成

- 新增：
  - `src/gateway/tools/policies.ts`
- 更新：
  - `src/gateway/tools/types.ts`
    - 新增共享 `ToolCatalogEntry`、`ToolCatalogCategory`、`ToolCatalogSource`
  - `src/gateway/tools/index.ts`
    - 导出共享 policy 与 catalog 类型
  - `src/main/services/agent/permission-handler.ts`
    - `mcp__web-tools__WebSearch`
    - `mcp__web-tools__WebFetch`
    - `mcp__local-tools__memory`
    - `mcp__local-tools__tool_search_tool_regex`
    - `mcp__local-tools__tool_search_tool_bm25`
    - `mcp__local-tools__subagents`
    - `mcp__local-tools__text_editor_code_execution`
    - `mcp__local-tools__open_url`
    - 第一批桌面/终端/浏览器/SkillsFan local MCP 工具
    - 已改为通过共享 policy 决定 allow / workspace path / system-browser-only / command-approval
  - `src/main/services/local-tools/tool-catalog.ts`
  - `src/main/services/local-tools/tool-search.ts`
    - 改为复用共享 `ToolCatalogEntry` 类型
- 新增测试：
  - `tests/unit/gateway/tools/policies.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - 共享工具层开始承接“工具长什么样”和“审批怎么判”的第一批共性逻辑
  - `permission-handler` 不再继续堆叠大量 local MCP 工具分支
  - 后续 `NativeRuntime` 可以直接复用相同的 tool permission metadata
- 这一步没有试图解决的是：
  - 所有 built-in / MCP 工具的统一权限模型
  - tool provider 的完整抽象
  - runtime 任务级路由

### 验证

```bash
npm run test:unit -- tests/unit/services/agent/permission-handler.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/services/agent/sdk-options.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`5` 个测试文件，`111` 个测试通过
- 构建：通过

### 下一步

- 继续 `M6`
  - 抽共享 tool metadata / tool provider definition
  - 继续把 `permission-handler` 与 `tool-catalog` 里剩余的 runtime-specific 逻辑往 `gateway/tools` 收
  - 为任务级 runtime 路由和 `NativeRuntime` 接共享工具做前置准备

## Step 72: 迁移 Shared Tool Catalog 并加入 Provider Definitions

### 目标

- 继续把共享工具层从 `main/services/local-tools` 中抽离出来
- 让共享 tool metadata 和 shared provider definitions 都在 `gateway/tools` 下拥有明确边界

### 本次范围

- 把完整 `tool catalog` 迁移到 `gateway/tools/catalog.ts`
- 给 `tool registry` 增加共享 `provider definitions`
- 让 `sdk-mcp-server` 直接依赖共享 catalog，而不是再经由本地包装文件

### 已完成

- 新增：
  - `src/gateway/tools/providers.ts`
- 迁移：
  - `src/main/services/local-tools/tool-catalog.ts`
    - 迁移到 `src/gateway/tools/catalog.ts`
    - 原路径保留兼容 re-export 壳
- 更新：
  - `src/gateway/tools/types.ts`
    - 新增 `ToolProviderDefinition`
  - `src/gateway/tools/registry.ts`
    - `BuildToolRegistryResult` 现在返回共享 `providers`
  - `src/gateway/tools/index.ts`
    - 导出 shared catalog / providers
  - `src/main/services/local-tools/sdk-mcp-server.ts`
    - 直接依赖共享 `buildToolCatalog`
- 新增测试：
  - `tests/unit/gateway/tools/providers.test.ts`
- 更新测试：
  - `tests/unit/gateway/tools/registry.test.ts`
    - 显式校验共享 provider definitions

### 这一小步的定位

- 这一步解决的是：
  - 共享 tool metadata 不再挂在 `local-tools` 目录下
  - `tool registry` 开始返回共享 provider 元数据，而不只是 MCP server 实例
  - `sdk-mcp-server` 开始直接依赖共享 catalog，减少对 legacy 包装路径的耦合
- 这一步没有试图解决的是：
  - provider 级 capability / permission 模型
  - task-based runtime routing
  - NativeRuntime 的实际 provider adapter

### 验证

```bash
npm run test:unit -- tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/services/agent/sdk-options.test.ts tests/unit/services/local-tools/tool-search.test.ts tests/unit/services/agent/permission-handler.test.ts
npm run build
```

### 结果

- 通过
- 单测：`6` 个测试文件，`113` 个测试通过
- 构建：通过

### 下一步

- 继续 `M6`
  - 抽共享 tool provider capability / metadata
  - 继续削薄 `sdk-options` 和 runtime-specific tool wiring
  - 为任务级 runtime 路由和 `NativeRuntime` 接共享工具做下一层准备

## Step 73: 启动任务级 Runtime 路由第一版

### 目标

- 在不引入真实 `NativeRuntime` provider adapter 的前提下，先把任务级 runtime 路由入口立起来
- 让 `hybrid` 模式不再只看全局 `runtime.mode`，而开始能按任务类型选择 lane

### 本次范围

- 新增 runtime selection pure helper
- 给 `AgentRequest` 增加显式 `runtimeTaskHint`
- 先把 `Ralph` 和 hosted subagent completion 这类明显复杂任务接到 `Claude SDK Runtime` lane

### 已完成

- 新增：
  - `src/gateway/runtime/routing.ts`
    - 提供纯函数 `resolveRuntimeSelection()`
- 更新：
  - `src/main/services/agent/types.ts`
    - 新增 `RuntimeTaskHint`
  - `src/gateway/runtime/orchestrator.ts`
    - `sendMessage()` 现在会按任务级路由结果选择 runtime
    - `hybrid` 模式下：
      - 轻任务优先 `native`
      - 复杂编排任务优先 `claude-sdk`
      - 无 native runtime 时回退 `claude-sdk`
  - `src/main/services/ralph/story-executor.ts`
    - Ralph 任务显式标记为复杂 orchestration
  - `src/main/services/agent/subagent/runtime.ts`
    - hosted subagent completion auto-announce 显式标记为复杂 orchestration
- 新增测试：
  - `tests/unit/gateway/runtime/routing.test.ts`
- 更新测试：
  - `tests/unit/gateway/runtime/orchestrator.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - runtime 路由第一次拥有独立于 orchestrator 分支判断的纯函数边界
  - `hybrid` 模式开始具备“复杂任务走 Claude、轻任务走 Native”的基础行为模型
  - `Ralph` 与 hosted subagent completion 不会因为后续 `NativeRuntime` 接入而误跑到错误 lane
- 这一步没有试图解决的是：
  - Native provider adapter 的真实实现
  - 所有入口的 `runtimeTaskHint` 覆盖
  - 基于工具能力矩阵的更细粒度 routing

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/routing.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/automation/ralph.test.ts tests/unit/gateway/automation/subagents.test.ts
npm run build
```

### 结果

- 通过
- 单测：`4` 个测试文件，`29` 个测试通过
- 构建：通过

### 下一步

- 继续 `M6/M7` 衔接
  - 扩大 `runtimeTaskHint` 覆盖面
  - 让 `NativeRuntime v1` 接入同一套 routing contract
  - 再逐步按 provider / task 能力矩阵细化 hybrid 路由
- 备注：仍然只有现有的 Vite dynamic import warning，没有新增构建错误

### 下一步

- 继续 `M6`
  - 抽 `tool definition / tool metadata / permission gate` 的共享模型
  - 让 `Claude SDK Runtime` 和未来 `NativeRuntime` 共用更高层的 tool provider
- 或继续并行准备
  - 任务级 runtime 路由策略

## Step 74: NativeRuntime scaffold 与 runtime health 可观测性

### 目标

- 在不切换现有 Claude SDK 主链路的前提下，先把 `NativeRuntime` 做成真正存在且可观测的一条 lane
- 让 `gateway health / services / doctor / Settings` 都能判断：
  - native lane 是否只是 scaffold
  - native 是否已注册到 orchestrator
  - hybrid 是否启用任务级路由

### 本次范围

- 新增 `native runtime` scaffold
- 扩展 orchestrator 的 runtime introspection
- 扩展 runtime health / services / doctor 元数据
- 扩展设置页诊断面与三语文案

### 已完成

- 新增：
  - `src/gateway/runtime/native/runtime.ts`
    - 提供 `nativeRuntime` scaffold
    - 提供 `getNativeRuntimeStatus()`
- 更新：
  - `src/gateway/runtime/orchestrator.ts`
    - 新增 `hasRuntime()` / `listRegisteredRuntimeKinds()`
  - `src/gateway/server/health.ts`
    - runtime health 现在会返回：
      - `registeredKinds`
      - `nativeRegistered`
      - `hybridTaskRouting`
      - `native` scaffold status
  - `src/gateway/server/services.ts`
    - runtime service summary 和 metadata 现在会明确区分：
      - native lane 已注册
      - native lane 仅 scaffold 未注册
  - `src/gateway/doctor/report.ts`
    - runtime doctor check 现在也会带 native lane 信息
  - `src/renderer/pages/SettingsPage.tsx`
    - `Gateway Diagnostics` 现在会显示：
      - Registered runtimes
      - Hybrid routing mode
      - Native lane scaffold / ready / provider-native 状态
  - `src/renderer/i18n/locales/en.json`
  - `src/renderer/i18n/locales/zh-CN.json`
  - `src/renderer/i18n/locales/zh-TW.json`
- 新增测试：
  - `tests/unit/gateway/runtime/native-runtime.test.ts`
- 更新测试：
  - `tests/unit/gateway/runtime/orchestrator.test.ts`
  - `tests/unit/gateway/server/health.test.ts`
  - `tests/unit/gateway/server/services.test.ts`
  - `tests/unit/gateway/doctor/report.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - NativeRuntime 第一次拥有独立的 scaffold 状态模型，而不只是 `orchestrator.registerRuntime('native')` 这种隐式概念
  - runtime 健康面第一次能明确告诉你：
    - native lane 是否存在
    - 是否只是 scaffold
    - 是否真的注册进 orchestrator
    - hybrid 是否已经启用任务级路由
- 这一步没有试图解决的是：
  - OpenAI / Codex 的真实 provider-native execution
  - tool-call / streaming / usage 的 native contract
  - ai-sources 到 native provider adapter 的最终接线

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`5` 个测试文件，`20` 个测试通过
- 构建：通过

### 下一步

- 进入 `M7` 下一小步
  - 把 `NativeRuntime` 接到 shared tool registry contract
  - 补 native runtime capability / provider readiness
  - 再开始接 OpenAI / Codex 的 provider-native transport

## Step 75: NativeRuntime readiness 接入 AI source 与 shared tools

### 目标

- 让 `NativeRuntime` 的健康状态不再只是静态 scaffold
- 让 runtime health 能判断：
  - 当前 AI source resolve 出来的 endpoint 是否属于 native v1 支持范围
  - shared tool registry 里哪些 provider 已经显式支持 `native`

### 本次范围

- 为 shared tool providers 增加 runtime compatibility metadata
- 为 native runtime 增加 endpoint/tool-aware readiness 纯函数
- 把当前 AI source runtime endpoint 接入 gateway health

### 已完成

- 更新：
  - `src/gateway/tools/types.ts`
    - `ToolProviderDefinition` 新增 `runtimeKinds`
  - `src/gateway/tools/providers.ts`
    - `local-tools / web-tools / ai-browser / extension providers` 显式支持 `claude-sdk + native`
    - `skill` 暂时仅声明支持 `claude-sdk`
  - `src/gateway/runtime/native/runtime.ts`
    - 新增 `resolveNativeRuntimeStatus()`
    - `NativeRuntime` 现在会区分：
      - `endpointSupported`
      - `currentSource / currentProvider / currentApiType`
      - `sharedToolProviderIds / nativeToolProviderIds`
      - 动态 readiness note
  - `src/gateway/runtime/native/capabilities.ts`
    - 新增 `resolveNativeProviderCapability()`
    - 当前先区分：
      - `openai-responses`
      - `openai-codex-responses`
  - `src/gateway/server/health.ts`
    - runtime health 现在会读取：
      - `getAISourceManager().resolveRuntimeEndpoint()`
      - shared tool provider definitions
      - 然后生成 native readiness
- 更新测试：
  - `tests/unit/gateway/tools/providers.test.ts`
  - `tests/unit/gateway/runtime/native-runtime.test.ts`
  - `tests/unit/gateway/server/health.test.ts`
  - `tests/unit/gateway/server/services.test.ts`
  - `tests/unit/gateway/doctor/report.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - native lane 第一次知道“当前 source 能不能接 OpenAI-family Responses”
  - shared tool registry 第一次显式表达 runtime compatibility，而不是默认所有 tool provider 都绑定 Claude SDK
  - 后续接 OpenAI / Codex provider-native transport 时，不需要再重做 readiness 模型
- 这一步没有试图解决的是：
  - 真正的 OpenAI / Codex provider-native request execution
  - native lane 的 tool call / streaming / usage contract
  - NativeRuntime 的真实 runtime registration boot path

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/tools/providers.test.ts
npm run build
```

### 结果

- 通过
- 单测：`6` 个测试文件，`24` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 把 OpenAI / Codex 的 provider-native capability 显式建模
  - 再开始实现 NativeRuntime 的真实 provider adapter

## Step 76: NativeRuntime 显式 adapter contract 落地

### 目标

- 按 `OpenClaw` 的思路，把 `NativeRuntime` 从“知道自己支持 Responses”推进到“知道自己具体命中了哪条 adapter contract”
- 避免把 `OpenAI / Codex / GLM / Kimi / MiniMax` 这类 provider 全部揉成一个模糊的 openai-compatible lane

### 本次范围

- 新增 `NativeRuntime` adapter contract 与 adapter registry
- 显式落两条第一批 adapter：
  - `openai-responses`
  - `openai-codex-responses`
- 把 native capability / status / health / doctor 统一改成围绕 adapter 说话

### 已完成

- 新增：
  - `src/gateway/runtime/native/types.ts`
    - 声明 `NativeRuntimeAdapter / NativeAdapterId / NativeAdapterStage`
  - `src/gateway/runtime/native/adapters/index.ts`
    - 新增显式 adapter registry 与 adapter resolver
  - `src/gateway/runtime/native/adapters/openai-responses.ts`
  - `src/gateway/runtime/native/adapters/openai-codex-responses.ts`
- 更新：
  - `src/gateway/runtime/native/capabilities.ts`
    - 不再只按 `provider/apiType` 硬编码判断
    - 改成通过 adapter registry 解析 capability
  - `src/gateway/runtime/native/runtime.ts`
    - `NativeRuntimeStatus` 新增：
      - `adapterResolved`
      - `adapterStage`
      - `availableAdapterIds`
    - `supportedProviders` 继续保持 provider family 语义，不把 `oauth` 这种 auth mode 混进来
- 更新测试：
  - `tests/unit/gateway/runtime/native-adapters.test.ts`
  - `tests/unit/gateway/runtime/native-runtime.test.ts`
  - `tests/unit/gateway/server/health.test.ts`
  - `tests/unit/gateway/server/services.test.ts`
  - `tests/unit/gateway/doctor/report.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - `NativeRuntime` 第一次拥有真正的 adapter registry，而不是只有 readiness flag
  - `OpenAI Responses` 与 `Codex Responses` 第一次在 SkillsFan 里被显式建成两条不同 contract
  - 后续接真实 transport 时，不需要再返工 capability / health / doctor 结构
- 这一步没有试图解决的是：
  - 真正的 provider-native request transport
  - native lane 的 streaming/tool-call/usage 执行实现
  - `GLM / Kimi / MiniMax` 的各自 native adapter

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-adapters.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`31` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 把 `NativeRuntime` 接到真实 `OpenAI / Codex` provider-native adapter
  - 再开始实现 transport / streaming / tool-call contract

## Step 77: NativeRuntime transport plan 显式建模

### 目标

- 把 `OpenAI Responses` 与 `Codex Responses` 的 transport 差异从“未来实现时再决定”提前收口成明确 contract
- 固定 `defaultTransport / websocketWarmup / storePolicy / serverCompaction` 这些差异，避免后面接真实 transport 时写错

### 本次范围

- 新增 native transport plan 纯函数
- 把 transport plan 接到 `NativeRuntimeStatus`
- 把 health / doctor / tests 一起更新到 transport-aware

### 已完成

- 新增：
  - `src/gateway/runtime/native/transport.ts`
    - 新增 `resolveNativeRuntimeTransportPlan()`
    - 当前显式区分：
      - `openai-responses`
      - `openai-codex-responses`
- 更新：
  - `src/gateway/runtime/native/runtime.ts`
    - `NativeRuntimeStatus` 新增：
      - `transportResolved`
      - `transport`
  - 更新测试：
    - `tests/unit/gateway/runtime/native-transport.test.ts`
    - `tests/unit/gateway/runtime/native-runtime.test.ts`
    - `tests/unit/gateway/server/health.test.ts`
    - `tests/unit/gateway/server/services.test.ts`
    - `tests/unit/gateway/doctor/report.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - `NativeRuntime` 第一次不只是知道“命中了哪个 adapter”，还知道“该 adapter 未来应该怎么发请求”
  - `OpenAI Responses` 与 `Codex Responses` 的关键 transport 差异第一次被固定成可测试 contract
- 这一步没有试图解决的是：
  - 真正的 HTTP/WebSocket provider-native request execution
  - 消息流到 renderer 的完整 native streaming integration
  - Native lane 的 runtime registration 启用

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-adapters.test.ts tests/unit/gateway/runtime/native-transport.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`8` 个测试文件，`34` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 开始实现真实 `OpenAI / Codex` provider-native transport
  - 再把 native stream/tool-call/usage contract 接进消息执行链

## Step 78: NativeRuntime request builder 与 response normalizer contract

### 目标

- 在不提前切换真实执行流量的前提下，先把 `OpenAI / Codex` 的 provider-native request/response contract 固定下来
- 避免后面接真实 HTTP/WebSocket transport 时临时拼 payload、headers、stream event 格式而返工

### 本次范围

- 新增 native request builder
- 新增 native response / stream normalizer
- 把两个 contract 接进 `openai-responses` 与 `openai-codex-responses` adapter

### 已完成

- 新增：
  - `src/gateway/runtime/native/request.ts`
    - 新增 `buildNativeRuntimePreparedRequest()`
    - 统一处理：
      - `Authorization / custom headers`
      - `stream / stream_options`
      - `storePolicy`
      - `reasoning`
      - `metadata`
      - `native-compatible tool provider ids`
      - `unsupported attachment kinds`
  - `src/gateway/runtime/native/normalize.ts`
    - 新增：
      - `normalizeNativeRuntimeResponse()`
      - `normalizeNativeRuntimeStreamEvent()`
    - 统一归一：
      - `outputText / refusalText`
      - `toolCalls`
      - `usage`
      - `lifecycle status`
      - `error`
- 更新：
  - `src/gateway/runtime/native/types.ts`
    - `NativeRuntimeAdapter` 新增：
      - `prepareRequest()`
      - `normalizeResponse()`
      - `normalizeStreamEvent()`
    - 新增：
      - `NativePreparedRequest`
      - `NativeNormalizedResponse`
      - `NativeNormalizedStreamEvent`
  - `src/gateway/runtime/native/adapters/openai-responses.ts`
  - `src/gateway/runtime/native/adapters/openai-codex-responses.ts`
    - 两条 adapter contract 现在都会显式提供 request builder 和 normalizer
  - 更新测试：
    - `tests/unit/gateway/runtime/native-request.test.ts`
    - `tests/unit/gateway/runtime/native-normalize.test.ts`
    - `tests/unit/gateway/tools/registry.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - `NativeRuntime` 第一次不只是知道“命中了哪个 adapter / transport plan”，还知道“该 adapter 具体要发什么 request、收到什么 response event 后怎么归一”
  - `OpenAI Responses` 与 `Codex Responses` 的请求头、store 策略、reasoning、metadata 和 stream event 处理第一次被固定成可测试 contract
- 这一步没有试图解决的是：
  - 真正的 upstream HTTP/WebSocket request execution
  - native lane 的 renderer message streaming integration
  - `native` runtime 正式注册并接管流量

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-request.test.ts tests/unit/gateway/runtime/native-normalize.test.ts tests/unit/gateway/runtime/native-adapters.test.ts tests/unit/gateway/runtime/native-transport.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`12` 个测试文件，`45` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 开始接真实 `OpenAI / Codex` upstream transport
  - 把 `prepareRequest / normalize*` 接进 native send path

## Step 79: NativeRuntime upstream transport client 骨架

### 目标

- 在不提前接管主聊天流量的前提下，把 `NativeRuntime` 补到真正能打 upstream 的 transport client 层
- 固定 non-stream、SSE stream、upstream error 的执行 contract，避免后面接 send path 时再临时造协议

### 本次范围

- 新增 native upstream client
- 先接 `Responses` 的 JSON / SSE 解析
- 继续保持 `Claude SDK Runtime` 为主链路，不切流量

### 已完成

- 新增：
  - `src/gateway/runtime/native/client.ts`
    - 新增：
      - `executeNativePreparedRequest()`
      - `NativePreparedRequestExecutionResult`
      - `NativeRuntimeUpstreamError`
    - 支持：
      - non-stream JSON response
      - SSE stream parsing
      - upstream structured error parsing
- 更新测试：
  - `tests/unit/gateway/runtime/native-client.test.ts`
    - 覆盖：
      - JSON response 执行
      - SSE stream 执行
      - structured upstream error

### 这一小步的定位

- 这一步解决的是：
  - `NativeRuntime` 第一次拥有真实 upstream transport client，而不只是 request/normalize pure helper
  - `OpenAI / Codex Responses` 的 JSON/SSE/error 三条基础执行路径第一次被固定成可测试 contract
- 这一步没有试图解决的是：
  - native send path 接 renderer / channel 的真实流式派发
  - `nativeRuntime.sendMessage()` 正式接管用户消息执行
  - provider/model 灰度与 fallback 策略收口

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-client.test.ts tests/unit/gateway/runtime/native-request.test.ts tests/unit/gateway/runtime/native-normalize.test.ts tests/unit/gateway/runtime/native-adapters.test.ts tests/unit/gateway/runtime/native-transport.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`13` 个测试文件，`48` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 把 upstream client 接进 native send path
  - 再把 native stream/tool-call/usage 映射进 renderer/channel 事件链

## Step 80: NativeRuntime send path 接入现有事件与会话链

### 目标

- 把前面已经完成的 `adapter + request builder + transport client + normalizer` 真正串成一条 native message execution path
- 先复用现有 `agent:start / agent:message / agent:complete / agent:error` 与 conversation persistence，不提前切主流量

### 本次范围

- 让 `nativeRuntime.sendMessage()` 执行真实 upstream request
- 复用现有 renderer/channel 事件
- 复用现有 conversation store 持久化

### 已完成

- 更新：
  - `src/gateway/runtime/native/runtime.ts`
    - `nativeRuntime.sendMessage()` 现在会：
      - 动态解析 runtime endpoint
      - 解析 shared tool providers
      - 选择显式 native adapter
      - 构建 prepared request
      - 执行 upstream request
      - 把 stream text 映射到现有 `agent:message`
      - 把 final token usage 映射到现有 `agent:complete`
      - 把 upstream error 映射到现有 `agent:error`
      - 把 user/assistant 消息落进现有 conversation store
    - 仍然显式拒绝当前不支持的输入：
      - `pdf-attachment`
      - `text-attachment`
- 新增测试：
  - `tests/unit/gateway/runtime/native-send-message.test.ts`
    - 覆盖：
      - 正常流式完成
      - upstream error
- 更新测试：
  - `tests/unit/gateway/runtime/native-runtime.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - `NativeRuntime` 第一次不只是“有 transport client”，而是“有一条完整的 send path”
  - native lane 第一次真正复用了现有 renderer/channel 事件与 conversation persistence，而不是另起炉灶
- 这一步没有试图解决的是：
  - `native` runtime 正式注册到 orchestrator 并接管真实用户流量
  - native tool-call execution
  - native lane 的 approval / user-question / hosted-subagent orchestration

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-send-message.test.ts tests/unit/gateway/runtime/native-client.test.ts tests/unit/gateway/runtime/native-request.test.ts tests/unit/gateway/runtime/native-normalize.test.ts tests/unit/gateway/runtime/native-adapters.test.ts tests/unit/gateway/runtime/native-transport.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`14` 个测试文件，`50` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 接 native tool-call request/response contract
  - 再决定是否注册 `native` runtime 进入真实 hybrid/native 路由

## Step 81: NativeRuntime 接入 shared function tools 与 tool-call 失败闭环

### 目标

- 让 shared tool registry 第一次真正进入 provider-native request
- 避免 upstream 的 `tool_calls` 在 native lane 里被静默吞掉

### 本次范围

- 从 app-managed SDK MCP servers 提取第一版 native function tool definitions
- 把这些 function tools 挂进 `Responses.tools`
- 在 native send path 里把 upstream tool calls 映射到现有 renderer/thought 事件
- 在 native tool execution 尚未落地时，显式走错误闭环

### 已完成

- 新增：
  - `src/gateway/tools/native-tools.ts`
    - 从 shared `buildToolRegistry()` 产出的 SDK MCP servers 中提取启用中的工具定义
    - 把 Zod input schema 转成 OpenAI function parameters
    - 为 native lane 生成 namespaced function tool name
- 更新：
  - `src/gateway/tools/types.ts`
    - 新增 `NativeFunctionToolDefinition`
  - `src/gateway/tools/index.ts`
    - 导出 native tool builder
  - `src/gateway/runtime/native/request.ts`
    - `NativePreparedRequest` 现在会携带 `nativeTools`
    - `Responses` request 现在会真正挂 `tools / tool_choice / parallel_tool_calls`
  - `src/gateway/runtime/native/runtime.ts`
    - native send path 现在通过 shared tool registry 解析 native function tools
    - 收到 upstream `tool_calls` 时，会发：
      - `agent:thought`
      - `agent:tool-call`
      - `agent:tool-result`
      - `agent:error`
    - 会把 tool-use / tool-result thoughts 与 failed tool-call 状态落进 conversation store
    - 当前阶段仍然显式报错：
      - `Native runtime received N tool call(s), but native tool execution is not wired yet.`
- 新增测试：
  - `tests/unit/gateway/tools/native-tools.test.ts`
  - `tests/unit/gateway/runtime/native-send-message.test.ts`
    - 新增 native tool-call failure path 覆盖
- 更新测试：
  - `tests/unit/gateway/runtime/native-request.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - native lane 第一次真正“带着 function tools 发请求”
  - upstream `tool_calls` 第一次进入现有 SkillsFan 事件与会话模型
  - native lane 不再把 tool-call 当成黑洞
- 这一步没有试图解决的是：
  - native tool execution
  - approval / user-question / subagent 等 orchestration 迁移到 native lane
  - native lane 正式接管真实用户流量

### 验证

```bash
npm run test:unit -- tests/unit/gateway/tools/native-tools.test.ts tests/unit/gateway/runtime/native-request.test.ts tests/unit/gateway/runtime/native-send-message.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/services/agent/sdk-options.test.ts
npm run build
```

### 结果

- 通过
- 单测：`12` 个测试文件，`48` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 接 native tool execution contract
  - 先决定最小可执行范围是直接调用 shared MCP tools，还是先挂一层 tool executor bridge
  - 再决定何时把 `native` runtime 注册进真实 hybrid/native 路由

## Step 82: NativeRuntime 接通 tool execution roundtrip 与可用 lane 自动注册

### 目标

- 让 native lane 不只“看见 tool_calls”，而是真的能执行第一批 shared MCP tools
- 让 runtime availability 与当前 AI source / shared tool registry 的真实状态保持同步

### 本次范围

- 对齐 native function tool 命名到 shared tool policy / catalog 的同一命名空间
- 新增 native tool executor bridge，并把 `function_call_output` follow-up roundtrip 接回 upstream
- 把 OpenAI / Codex 两条 adapter 的 stage / capability 从 `scaffolded` 更新为真实 `ready`
- 新增 native runtime registration，同步当前源是否应注册为一条可用 runtime lane

### 已完成

- 更新：
  - `src/gateway/tools/native-tools.ts`
    - native function tool name 改为与 shared tool policy/catalo g一致的 `mcp__local-tools__...`
  - `src/gateway/runtime/native/tool-executor.ts`
    - 第一版支持直接执行 app-managed in-process SDK MCP tools
    - 会做 Zod schema 校验
    - 会复用 shared tool permission policy
    - `command-approval` 工具在 `ask` 模式下仍然显式拒绝，不会静默执行
  - `src/gateway/runtime/native/request.ts`
    - 新增 follow-up request builder
    - 支持 `previous_response_id + function_call_output`
  - `src/gateway/runtime/native/runtime.ts`
    - 收到 upstream tool-calls 后会：
      - 解析 shared tool context
      - 执行 native function tool
      - 发 `agent:thought / agent:tool-call / agent:tool-result`
      - 聚合 usage
      - 用 follow-up request 回传 tool outputs
    - 同时 native status 默认 note 也改为反映“无兼容 endpoint”而不是“transport 未接通”
  - `src/gateway/runtime/native/adapters/openai-responses.ts`
  - `src/gateway/runtime/native/adapters/openai-codex-responses.ts`
    - adapter stage 已提升为 `ready`
    - `providerNativeExecution=true`
  - `src/gateway/runtime/registration.ts`
    - 新增 runtime registration helper
    - 会结合当前 runtime endpoint + shared tool providers 解析 native readiness
  - `src/gateway/runtime/orchestrator.ts`
    - 每次选 runtime 前都会先同步 native registration
    - 当前源命中 OpenAI/Codex Responses 且 shared native tools 就绪时，会把 `native` 注册成可用 lane
- 新增测试：
  - `tests/unit/gateway/runtime/native-tool-executor.test.ts`
  - `tests/unit/gateway/runtime/registration.test.ts`
- 更新测试：
  - `tests/unit/gateway/runtime/native-request.test.ts`
  - `tests/unit/gateway/runtime/native-send-message.test.ts`
  - `tests/unit/gateway/runtime/native-runtime.test.ts`
  - `tests/unit/gateway/runtime/native-adapters.test.ts`
  - `tests/unit/gateway/runtime/orchestrator.test.ts`
  - `tests/unit/gateway/server/health.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - native lane 第一次具备真正的 tool execution roundtrip
  - health / doctor / runtime status 不再把已接通的 native adapter 说成“只有 scaffold”
  - runtime 是否可用开始跟随当前 provider-native endpoint 自动变化
- 这一步没有试图解决的是：
  - interactive approval / AskUserQuestion 迁移到 native lane
  - subagent / skill / multi-agent orchestration 迁移到 native lane
  - 非 OpenAI / Codex provider 的 native adapter

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/registration.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/runtime/native-adapters.test.ts tests/unit/gateway/runtime/native-request.test.ts tests/unit/gateway/runtime/native-tool-executor.test.ts tests/unit/gateway/runtime/native-client.test.ts tests/unit/gateway/runtime/native-send-message.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/tools/native-tools.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/agent/sdk-options.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`18` 个测试文件，`157` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 接 native lane 的 interactive approval / user-question contract
  - 再决定是否让 `hybrid` 默认把更多轻任务切到 native
  - 再继续扩第二批 provider-native adapters

## Step 83: NativeRuntime 复用现有 approval / user-question 交互协议

### 目标

- 让 native lane 在工具审批和用户问答上复用现有 renderer 交互事件
- 保持 `Claude SDK Runtime` 与 `NativeRuntime` 的 UI 协议一致，避免为 native 单独再造一套审批/问答链

### 本次范围

- 新增 native interaction manager，管理 native lane 的待处理 tool approval / user question
- 让 native tool executor 在 `command-approval + ask` 模式下复用现有 `agent:tool-call / agent:tool-approval-resolved` 事件
- 让主进程 permission handler 在没有 Claude SDK pending session 时，继续能 resolve native lane 的 approval / answer
- 顺手修正测试环境里的两处入口耦合：
  - `skillsfan/constants` 对编译期常量的 `typeof` 守卫
  - `skillsfan/auth.service` 不再顶层直接 import `main/index`

### 已完成

- 新增：
  - `src/gateway/runtime/native/interaction.ts`
    - 管理 native runtime 的 pending approval / pending question
    - 复用现有 renderer 事件：
      - `agent:tool-call`
      - `agent:tool-approval-resolved`
      - `agent:user-question`
      - `agent:user-question-answered`
- 更新：
  - `src/gateway/runtime/native/tool-executor.ts`
    - `command-approval` 工具在 `ask` 模式下不再一律拒绝
    - 当 `spaceId + conversationId` 可用时，会发起真实 native tool approval 并等待结果
    - 用户拒绝时返回结构化拒绝结果
  - `src/gateway/runtime/native/runtime.ts`
    - native send path 执行 tool-call 时会传入 `spaceId / conversationId`
  - `src/main/services/agent/permission-handler.ts`
    - 当没有 Claude SDK pending session 时，会继续尝试 resolve native runtime 的 pending approval / question
  - `src/main/services/skillsfan/constants.ts`
    - 对 `__SKILLSFAN_REGION__ / __SKILLSFAN_API_URL__` 增加 `typeof` 守卫，避免测试环境裸引用炸掉
  - `src/main/services/skillsfan/auth.service.ts`
    - 改为懒加载 `getMainWindow()`，不再顶层引入 `main/index`
  - `tests/unit/gateway/runtime/registration.test.ts`
    - mock 路径改为对齐 `ai-sources/manager`
- 新增测试：
  - `tests/unit/gateway/runtime/native-interaction.test.ts`
  - `tests/unit/gateway/runtime/native-tool-executor.approval.test.ts`
- 更新测试：
  - `tests/unit/gateway/runtime/native-tool-executor.test.ts`
  - `tests/unit/services/agent/permission-handler.test.ts`
  - `tests/unit/gateway/runtime/registration.test.ts`
  - `tests/unit/gateway/server/health.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - native lane 的工具审批开始复用现有 UI/renderer 协议
  - permission handler 不再只认 Claude SDK pending approval/question
  - native runtime 往“真实可交互 lane”又推进了一步
- 这一步没有试图解决的是：
  - upstream 主动 AskUserQuestion 事件的完整 provider-native 生产链
  - native lane 的 subagent / multi-agent orchestration
  - 第二批 provider-native adapter

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-interaction.test.ts tests/unit/gateway/runtime/native-tool-executor.test.ts tests/unit/gateway/runtime/native-tool-executor.approval.test.ts tests/unit/gateway/runtime/native-request.test.ts tests/unit/gateway/runtime/native-client.test.ts tests/unit/gateway/runtime/native-send-message.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/registration.test.ts tests/unit/gateway/runtime/orchestrator.test.ts tests/unit/gateway/tools/native-tools.test.ts tests/unit/gateway/tools/providers.test.ts tests/unit/gateway/tools/policies.test.ts tests/unit/gateway/tools/registry.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/services/agent/permission-handler.test.ts tests/unit/services/agent/sdk-options.test.ts tests/unit/services/local-tools/tool-search.test.ts
npm run build
```

### 结果

- 通过
- 单测：`19` 个测试文件，`157` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 把 native lane 的 user-question producer 接到真实 provider-native flow
  - 继续扩 native lane 的 approval / question / tool lifecycle 诊断面
  - 再评估何时让 `hybrid` 默认把更多轻任务切到 native

## Step 84: NativeRuntime 交互状态接入 health / doctor / Settings

### 目标

- 让 native lane 的 pending approval / pending question 变成可观测状态
- 在不改主执行链的前提下，把 native 交互阻塞点直接暴露给产品诊断面

### 本次范围

- 新增 native interaction status getter
- 把 interaction status 合并进 native runtime status
- 在 `services / doctor / Settings > Gateway Diagnostics` 中展示 pending approvals / questions 与最近请求时间

### 已完成

- 更新：
  - `src/gateway/runtime/native/interaction.ts`
    - 新增 `getNativeRuntimeInteractionStatus()`
    - 输出：
      - `pendingToolApprovalCount`
      - `pendingUserQuestionCount`
      - `pendingConversationIds`
      - `lastToolApprovalRequestedAt / lastToolApprovalResolvedAt`
      - `lastUserQuestionRequestedAt / lastUserQuestionResolvedAt`
  - `src/gateway/runtime/native/runtime.ts`
    - `NativeRuntimeStatus` 现在带 `interaction`
    - 默认状态、实时状态和 test override 都会保留 interaction snapshot
  - `src/gateway/server/services.ts`
    - runtime summary 在 native lane 有 pending interaction 时会直接反映出来
  - `src/gateway/doctor/report.ts`
    - runtime check 在 native lane 存在 pending interaction 时会输出更具体的摘要
  - `src/renderer/pages/SettingsPage.tsx`
    - `Gateway Diagnostics` 新增 native lane 的：
      - `Pending Approvals`
      - `Pending Questions`
      - `Last Approval Request`
      - `Last Question Request`
  - `src/renderer/i18n/locales/en.json`
  - `src/renderer/i18n/locales/zh-CN.json`
  - `src/renderer/i18n/locales/zh-TW.json`
- 更新测试：
  - `tests/unit/gateway/runtime/native-interaction.test.ts`
  - `tests/unit/gateway/runtime/native-runtime.test.ts`
  - `tests/unit/gateway/server/health.test.ts`
  - `tests/unit/gateway/server/services.test.ts`
  - `tests/unit/gateway/doctor/report.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - native lane 的交互阻塞不再只能靠日志排查
  - `health / doctor / Settings` 已经能看见 native approval/question 的 pending 状态
- 这一步没有试图解决的是：
  - upstream 主动 user-question 事件生产
  - pending interaction 历史、自动重试或批量恢复

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-interaction.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`5` 个测试文件，`16` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 把 native lane 的 user-question producer 接到真实 provider-native flow
  - 再补 native interaction 的历史 / 重试 / 更细粒度诊断
  - 再评估 `hybrid` 默认切换范围

## Step 85: Native lane 用户提示改成非技术表达

### 本步目标

- 把 native lane 里还会直接露给用户看的提示语改成更直白、更少术语的表达。

### 更新

- 新增：
  - `src/gateway/runtime/native/user-facing.ts`
    - 统一 native lane 的用户提示文案
    - 按 `zh-CN / zh-TW / en` 输出不同版本
    - 覆盖：
      - 模型连接不可用
      - 当前模型暂不支持这条新路线
      - 输入类型暂不支持
      - 请求过快 / 额度不足 / 账号或密钥异常
      - 需要确认但当前模式还不能直接发起确认
      - 这一步暂不可用 / 需要更复杂连续操作
- 更新：
  - `src/gateway/runtime/native/tool-executor.ts`
    - tool 校验失败、命令权限、确认缺失、工具不可用等提示改成普通用户语言
  - `src/gateway/runtime/native/client.ts`
    - 上游服务错误改成统一、易懂的话术
  - `src/gateway/runtime/native/runtime.ts`
    - send path、状态 note、错误出口统一走用户提示文案
  - `src/gateway/runtime/native/capabilities.ts`
  - `src/gateway/runtime/native/adapters/index.ts`
  - `src/gateway/runtime/native/adapters/openai-responses.ts`
  - `src/gateway/runtime/native/adapters/openai-codex-responses.ts`
  - `src/gateway/runtime/native/request.ts`
  - `src/gateway/runtime/native/types.ts`
    - 把这批状态文案和异常出口同步到统一用户提示
  - `src/renderer/i18n/locales/en.json`
  - `src/renderer/i18n/locales/zh-CN.json`
  - `src/renderer/i18n/locales/zh-TW.json`
    - 把 `Computer Automation / Gateway Diagnostics` 里生硬的 `Pending Approvals / Pending Questions / Native Lane / Registered Runtimes` 等词换成更好理解的说法
- 更新测试：
  - `tests/unit/gateway/runtime/native-tool-executor.test.ts`
  - `tests/unit/gateway/runtime/native-send-message.test.ts`
  - `tests/unit/gateway/runtime/native-runtime.test.ts`
  - `tests/unit/gateway/runtime/native-client.test.ts`
  - `tests/unit/gateway/runtime/native-adapters.test.ts`
  - `tests/unit/gateway/runtime/native-transport.test.ts`
  - `tests/unit/gateway/server/health.test.ts`
  - `tests/unit/gateway/server/services.test.ts`
  - `tests/unit/gateway/doctor/report.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - 非技术用户不再直接看到 `provider-native / adapter / endpoint / pending approval` 这类硬术语
  - native lane 出错时，用户更容易理解“发生了什么”和“下一步该做什么”
- 这一步没有试图解决的是：
  - upstream 主动提问事件的新增来源
  - 更复杂的多轮交互策略

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-tool-executor.test.ts tests/unit/gateway/runtime/native-send-message.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/runtime/native-client.test.ts tests/unit/gateway/runtime/native-adapters.test.ts tests/unit/gateway/runtime/native-transport.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts
npm run build
```

### 结果

- 通过
- 单测：`9` 个测试文件，`30` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 接 native lane 的 upstream user-question producer
  - 再补更稳定的失败提示与交互闭环
  - 再评估 `hybrid` 默认放量范围

## Step 86: Native lane 支持结构化追问并自动润色问题

### 本步目标

- 让 native lane 不只是“能跑工具”，还可以在缺少关键信息时正式停下来问用户一句。
- 同时把模型问出来的话先做一层整理，避免直接把生硬或技术化的表达丢给普通用户。

### 更新

- 新增：
  - `src/gateway/runtime/native/question-shaping.ts`
    - 统一整理 native lane 的追问内容
    - 会做：
      - 去掉 `follow-up / missing parameter / target directory` 这类技术前缀
      - 根据上下文把问题改写成更像普通用户会看到的话
      - 自动补默认标题，例如：
        - `请选择`
        - `请确认`
      - 保留结构化选项，继续支持用户点选
- 更新：
  - `src/gateway/tools/native-tools.ts`
    - 保留内建 `app__ask_user_question`，让 native lane 即使不依赖 MCP provider，也能正式发起追问
  - `src/gateway/runtime/native/request.ts`
    - 在 developer guidance 里明确要求：
      - 先问再猜
      - 一次只问一个关键问题
      - 尽量给清楚、简单的选项
  - `src/gateway/runtime/native/tool-executor.ts`
    - 接入结构化追问桥接
    - `AskUserQuestion` 不再只是原样转发输入，而是先经过问题整理，再发给 renderer
    - 回答结果现在会带回：
      - `question`
      - `answers`
      - `primaryAnswer`
- 更新测试：
  - `tests/unit/gateway/runtime/native-question-shaping.test.ts`
  - `tests/unit/gateway/runtime/native-tool-executor.test.ts`
  - `tests/unit/gateway/runtime/native-request.test.ts`
  - `tests/unit/gateway/runtime/native-interaction.test.ts`
  - `tests/unit/gateway/tools/native-tools.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - native lane 已经具备“执行到一半缺信息时，正式问一句再继续”的能力
  - 即使模型原始提问偏技术化，系统也会先整理成更自然的表达
- 这一步没有试图解决的是：
  - 更复杂的多轮追问策略
  - 追问历史恢复、超时重试和批量处理

### 验证

```bash
npm run test:unit -- tests/unit/gateway/tools/native-tools.test.ts tests/unit/gateway/runtime/native-question-shaping.test.ts tests/unit/gateway/runtime/native-request.test.ts tests/unit/gateway/runtime/native-tool-executor.test.ts tests/unit/gateway/runtime/native-interaction.test.ts tests/unit/gateway/runtime/native-send-message.test.ts
npm run build
```

### 结果

- 通过
- 单测：`6` 个测试文件，`16` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 补 native lane 的 user-question 历史、超时和恢复
  - 把追问状态更明确地接进产品面
  - 再评估哪一批简单任务可以优先切到 native lane

## Step 87: Native lane 直接显示“正在等你回答什么”

### 本步目标

- 不只显示 “有几个待回答问题”，而是直接让产品面看到“当前在等用户回答哪一句”。

### 更新

- 更新：
  - `src/gateway/runtime/native/interaction.ts`
    - interaction status 新增：
      - `pendingUserQuestionPreview`
      - `pendingUserQuestionHeader`
  - `src/gateway/server/services.ts`
  - `src/gateway/doctor/report.ts`
    - runtime 摘要在有 pending question 时，会补上当前等待的那一句问题预览
  - `src/renderer/pages/SettingsPage.tsx`
    - `Computer Automation / Gateway Diagnostics` 现在会直接显示：
      - `当前在等你回答: ...`
  - `src/renderer/i18n/locales/en.json`
  - `src/renderer/i18n/locales/zh-CN.json`
  - `src/renderer/i18n/locales/zh-TW.json`
- 更新测试：
  - `tests/unit/gateway/runtime/native-interaction.test.ts`
  - `tests/unit/gateway/runtime/native-runtime.test.ts`
  - `tests/unit/gateway/server/health.test.ts`
  - `tests/unit/gateway/server/services.test.ts`
  - `tests/unit/gateway/doctor/report.test.ts`

### 这一小步的定位

- 这一步解决的是：
  - 用户或排障人员不需要猜“系统到底在等什么”
  - native lane 的追问状态已经从“只显示数量”推进到“显示具体等待内容”
- 这一步没有试图解决的是：
  - 追问历史列表
  - 追问超时自动恢复

### 验证

```bash
npm run test:unit -- tests/unit/gateway/runtime/native-interaction.test.ts tests/unit/gateway/runtime/native-runtime.test.ts tests/unit/gateway/server/health.test.ts tests/unit/gateway/server/services.test.ts tests/unit/gateway/doctor/report.test.ts tests/unit/gateway/runtime/native-question-shaping.test.ts tests/unit/gateway/runtime/native-tool-executor.test.ts
npm run build
```

### 结果

- 通过
- 单测：`7` 个测试文件，`21` 个测试通过
- 构建：通过

### 下一步

- 继续 `M7`
  - 补 native lane 的 user-question 历史、超时和恢复
  - 再收一轮“失败后怎么提示用户下一步”
  - 再评估哪一批简单任务可以优先切到 native lane
