# SkillsFan 产品优先级实施路线

## 背景

- 当前 `Phase 0` 到 `Phase 3` 已完成，`gateway / runtime / host-runtime / sessionKey` 已具备继续演进的底座。
- 长期结构决策见：
  - `docs/final-runtime-architecture.zh-CN.md`
- 接下来的产品优先级按以下顺序推进：
  - `P1` 后台持续执行
  - `P2` 桌面自动化产品化
  - `P3` OpenAI / Codex NativeRuntime

## 实施原则

- 不跳阶段：先把后台执行宿主做稳，再放大桌面动作，再做 provider-native。
- 每个里程碑都必须交付：
  - feature flag
  - 自动化测试
  - 迁移记录
  - 回滚路径
- 优先复用现有边界：
  - `src/gateway/bootstrap.ts`
  - `src/gateway/server/*`
  - `src/gateway/sessions/*`
  - `src/gateway/host-runtime/*`
  - `src/gateway/runtime/*`

## M1 外部 Gateway Launcher

当前状态：已完成

### 目标

- 把 gateway 从 Electron 主进程中的 embedded lifecycle，演进成可独立拉起、可重连、可诊断的执行宿主。

### 任务清单

- 新增 gateway 进程状态层
- 增加 gateway lock / heartbeat / status file
- 主进程保留 launcher、health、reconnect
- 为后续 external gateway process 预留状态协议
- 增加 gateway process 相关 health/service 描述

### 验收

- 主窗口关闭后，gateway 生命周期仍然可诊断
- App 重启后，可以重新识别 gateway 运行态
- 不破坏当前 embedded gateway 主路径

## M2 Session / Step 持久化

当前状态：进行中
当前进展：已完成 session store 落盘、session hydration、persistence status、step journal status、session 视角 step journal query、automation diagnostics recovery 关联，并已在 settings 中展示 recovery storage 状态。

### 目标

- 让后台执行状态不再只存在于内存。

### 任务清单

- 给 gateway session store 增加磁盘持久化
- 在 bootstrap 阶段做 session hydration
- 为 session store 增加 persistence status / recovery status
- 对 step reporter 的落盘能力补状态视图
- 在 doctor 中暴露 session / step journal 状态

### 验收

- App 重启后能恢复 gateway session 视图
- loop-task / subagent / automation diagnostics 不丢主会话信息
- step reporter 能报告自身是否已开启持久化

## M2.5 External Command Path 补齐

当前状态：已完成
当前进展：已完成 `rewind-files` external command path，`loop-task:create / update / rename / add-story / update-story / remove-story / reorder-stories / retry-story / retry-failed / reset-all / delete` 的 external owner 委托，以及 `ralph:create-task / get-task / get-current / start / stop / generate-stories / import-prd-file` 的 external owner 委托；相邻 command runtime、facade delegation、remote HTTP/IPC 写路径回归，以及 `health / services / doctor` 的 command runtime 可观测字段与设置页诊断入口已补齐。最终决策是：`loop-task list/get/list-scheduled` 维持本地文件读路径，不额外增加 shared-state/RPC 层。

### 目标

- 把 external gateway 剩余的窄控制链路也收口到统一 command path，避免 desktop 主进程和 external gateway 之间残留特殊控制分叉。

### 任务清单

- 补 `rewind-files` 的 external command path
- 补 `loop-task` 专用 command path
- 补 `ralph` 专用 command path
- 明确这些命令的 owner / observer 行为和回退策略
- 补对应 health / doctor 可观测字段和回归测试

### 验收

- `gateway.mode=external` 下，`rewind-files` 不依赖 desktop 主进程本地 session
- `loop-task / ralph` 的关键控制命令可以命中 external owner
- 这些控制命令失败时有明确诊断和回退路径
- `loop-task list/get/list-scheduled` 在 external observer 模式下继续稳定读取共享磁盘状态，无需额外 command path

## M3 Daemon / Doctor v1

当前状态：已完成
当前进展：已完成 doctor 聚合、daemon status 协议、daemon register/unregister 骨架、lock heartbeat runtime 骨架、主进程与 renderer 读取入口、跨平台 installer plan skeleton、settings 中的 daemon/doctor 诊断入口、staged installer bundle 生成能力、install/uninstall execution path、执行前确认流、stale lock 清理入口、external gateway launcher recover 动作、stale external process 观察状态清理，以及结构化 rollback / cleanup hints 展示。

### 目标

- 把后台执行能力变成可运维能力。

### 任务清单

- 新增 gateway doctor 聚合报告
- 增加 gateway process / session store / step journal 自检
- 补 host permissions / runtime fallback 检查
- 为后续 LaunchAgent/systemd/Task Scheduler 集成预留 daemon 状态接口

### 验收

- 主进程和 renderer 可读取 doctor 报告
- 用户能知道 gateway 是否健康、session store 是否可恢复、step journal 是否启用
- 后续 daemon installer 不需要重做健康检查协议

## M4 Desktop Action Core

当前状态：进行中
当前进展：`HostRuntime.desktop` 已具备 `activateApplication / pressKey / typeText / clickAtCoordinate / moveMouse / scroll / listWindows / focusWindow` 的 macOS adapter；桌面动作工具已统一暴露到 local-tools MCP server，并接入 step reporter 与 perception 回传；同时已经补上结构化 `actions / adapters / errorCodes` capability 描述、`permission_denied / app_not_found / window_not_found / timeout` 等桌面错误码透传、统一 Accessibility preflight、`Finder / Terminal / Chrome / SkillsFan` 的最小 adapter registry skeleton；现在每个 planned adapter 不只是有 method scaffold，还开始出现可执行 method：`finder.reveal_path`、`finder.open_folder`、`finder.open_home_folder`、`finder.new_window`、`finder.search`、`terminal.run_command`、`terminal.new_tab_run_command`、`terminal.new_window_run_command`、`terminal.run_command_in_directory`、`terminal.list_sessions`、`terminal.list_panes`、`terminal.get_pane_layout`、`terminal.focus_session`、`terminal.interrupt_process`、`terminal.get_session_state`、`terminal.read_output`、`terminal.get_last_command_result`、`terminal.wait_for_output`、`terminal.wait_until_not_busy`、`terminal.wait_until_idle`、`terminal.split_pane_run_command`、`terminal.run_command_and_wait`、`terminal.run_command_in_directory_and_wait`、`chrome.open_url`、`chrome.focus_tab_by_title`、`chrome.new_tab`、`chrome.reload_active_tab`、`chrome.focus_tab_by_url`、`chrome.open_url_in_new_tab`、`chrome.list_tabs`、`chrome.find_tabs`、`chrome.get_active_tab`、`chrome.wait_for_tab`、`chrome.wait_for_active_tab`、`chrome.close_active_tab`、`chrome.close_tabs`、`skillsfan.focus_main_window`、`skillsfan.open_settings` 已有真实执行路径，其中 `Finder/Chrome` 已接入现有 `open_application` 的有限 adapter-aware 路由，`Terminal` 现在已经具备结构化 session 视图、session focus，以及 `windowIndex / tabIndex / sessionIndex / paneIndex` 级别的定向 `run/read/wait/interrupt` 能力，`iTerm / iTerm2` 也开始把 split pane 当作第一等 targeting 字段，并且开始支持显式列 pane、按方向拆 pane 再直接启动命令；现在还新增了 `terminal.get_pane_layout`，可以在 tab 级别读取 pane size、active pane 和最小 split hierarchy snapshot；同时 terminal command dispatch 也开始写入结构化 `commandId / command result` markers，`terminal.get_last_command_result` 可以稳定读取最后一条结构化命令结果；Terminal/iTerm 的 `get/read/wait/run-and-wait` 结果现在还会统一返回 `completionState / recoveryHint / recoverySuggestions`，让终端执行从“只会操作”进一步变成“知道是否完成、失败后怎么恢复”；同时 `finder_reveal_path`、`finder_open_folder`、`finder_open_home_folder`、`finder_new_window`、`finder_search`、`terminal_new_tab_run_command`、`terminal_new_window_run_command`、`terminal_run_command`、`terminal_run_command_in_directory`、`terminal_list_sessions`、`terminal_list_panes`、`terminal_get_pane_layout`、`terminal_focus_session`、`terminal_interrupt_process`、`terminal_get_session_state`、`terminal_read_output`、`terminal_get_last_command_result`、`terminal_wait_for_output`、`terminal_wait_until_not_busy`、`terminal_wait_until_idle`、`terminal_split_pane_run_command`、`terminal_run_command_and_wait`、`terminal_run_command_in_directory_and_wait`、`chrome_open_url`、`chrome_open_url_in_new_tab`、`chrome_focus_tab`、`chrome_focus_tab_by_url`、`chrome_list_tabs`、`chrome_find_tabs`、`chrome_get_active_tab`、`chrome_wait_for_tab`、`chrome_wait_for_active_tab`、`chrome_close_active_tab`、`chrome_close_tabs`、`chrome_new_tab`、`chrome_reload_active_tab`、`skillsfan_open_settings`、`skillsfan_focus_main_window` 三十八个正式结构化工具已经进入 local-tools，并接入审批、活动摘要和工具搜索。

### 目标

- 把桌面能力从“能力骨架”升级为稳定的结构化动作层。

### 任务清单

- 实现 `activateApplication`
- 实现 `pressKey`
- 实现 `typeText`
- 实现 `clickAtCoordinate`
- 实现 `scroll`
- 实现 `listWindows`
- 实现 `focusWindow`
- 统一错误码、权限检查、step 回传

## M5 Desktop Productization

当前状态：进行中
当前进展：`Terminal Adapter` 与 `Chrome Adapter` 已在 macOS 上从 `planned` 升级为 `active`，不再只是 method scaffold 集合；同时开始给 adapter 挂接 `M5-ready` 产品化工作流清单，并把这些工作流直接暴露到单独的 `Settings > Computer Automation` 入口，而不是继续堆在 `Advanced` 里。当前已进入产品化工作流的有：`Terminal / iTerm / iTerm2` 的 `Session Control`、`Run And Verify`、`iTerm Pane Ops` 三组工作流，以及 `Chrome / Chromium` 的 `Tab Navigation`、`Tab Observe`、`Tab Cleanup` 三组工作流。`gateway health / services / doctor` 现在也会返回 `desktopActiveWorkflowIds / desktopPlannedWorkflowIds / desktopBlockedWorkflowIds` 这类产品化元数据；同时 workflow 级状态已开始支持 `blockedByPermission / blockedMethodIds / recoveryHint`，设置页现在不只显示 workflow pack，还会明确标记哪些 workflow 因为 Accessibility 被挡住、受影响的方法有哪些、应该如何恢复；并且已经补上第一批可操作入口：可直接打开 `Accessibility / Screen Recording` 系统设置页，也可一键复制当前被挡住 workflow 的恢复指南。`M5` 的 smoke flow 也已经开始落成代码和产品面，当前已收口的 smoke flows 包括：`terminal.command-roundtrip`、`terminal.session-targeting`、`iterm.split-pane-roundtrip`、`chrome.tab-roundtrip`、`chrome.discovery-roundtrip`；它们已进入 adapter metadata、host status、gateway services、doctor 和设置页 `Smoke Flows` 区块，并具备 `verification / blockedByPermission / blockedMethodIds / recoveryHint` 这套最小产品字段。现在这些 smoke flow 已经不只是静态清单，设置页可直接 `Run Smoke Flow`，gateway 会记录最近一次 `passed / failed / running` 结果，并把 last-run 状态回写到 host status，用于产品面和诊断面展示。设置页现在还新增了 `Copy Automation Runbook` 与 `Current Scope` 两个产品化出口，用来把当前已交付范围明确限定为 `Terminal / Chrome / iTerm`，并支持一键导出当前 automation runbook。最新一轮还把这整块从 `Advanced` 中拆出，改成单独的 `Computer Automation / 电脑自动化 / 電腦自動化` 入口，并补齐 `en / zh-CN / zh-TW` 三语文案。`Finder` 与 `SkillsFan` adapter 目前仍保持 `planned`，作为后续 `M5` 扩面对象。

### 目标

- 把桌面动作层变成用户可感知的产品能力。

### 任务清单

- 先做 `Finder` adapter
- 先做 `Terminal` adapter
- 先做 `Chrome` adapter
- 先做 `SkillsFan` adapter
- 给 agent/tool 层暴露稳定桌面动作
- 增加权限引导和失败兜底

## M6 Tool Registry

当前状态：进行中
当前进展：共享工具层已经开始从 `Claude SDK` 链路中抽离。当前新增了 `src/gateway/tools/*` 初版 registry，已将 `local-tools / web-tools / ai-browser / skill / extension MCP` 的组装逻辑从 `src/main/services/agent/sdk-options.ts` 中迁出，变成可复用的 `buildToolRegistry()` 边界；同时，`local MCP` 工具的共享 catalog type 和第一批 permission policy 已经从 `tool-catalog / permission-handler` 中抽出。现在完整的 `tool catalog` 已经迁入 `src/gateway/tools/catalog.ts`，`tool registry` 也开始返回共享 `provider definitions`，`sdk-mcp-server` 已直接依赖共享 catalog。并且第一版任务级 runtime 路由 pure helper 已经落地：`hybrid` 模式下会把轻任务倾向到 `native`、复杂编排任务倾向到 `claude-sdk`，`Ralph` 和 hosted subagent auto-announce 也已经开始透出显式 `runtimeTaskHint`。`Claude SDK Runtime` 现阶段仍然维持原行为，但工具描述、provider 元数据、审批策略和 runtime 路由入口已经开始沿共享工具层收口。这意味着后续做 `NativeRuntime` 时，不需要再从 `sdk-options`、`tool-catalog` 或 `permission-handler` 里复制一套工具装配和审批逻辑，而是直接复用 `gateway/tools` 和 `gateway/runtime/routing.ts`。

### 目标

- 给 `ClaudeSdkRuntime` 和未来 `NativeRuntime` 提供统一工具层。

### 任务清单

- 把 `buildSdkOptions()` 中直接拼 MCP server 的逻辑拆成统一 registry
- 抽象 tool definition / tool context / permission gate
- 抽象 browser / desktop / skill / extension tool providers

## M7 NativeRuntime v1

当前状态：进行中
当前进展：`NativeRuntime` 已经从单纯 scaffold 推进到“OpenAI/Codex 两条 provider-native lane 已经可被真实识别、执行并开始复用现有交互协议”的阶段。当前 `src/gateway/runtime/native/runtime.ts`、`src/gateway/runtime/native/capabilities.ts` 与 `src/gateway/runtime/native/transport.ts` 已经把 `native lane` 状态拆成 `scaffolded / ready / endpointSupported / adapterResolved / adapterStage / transportResolved / providerNativeExecution / sharedToolRegistryReady / taskRoutingReady / supportedProviders / supportedApiTypes / availableAdapterIds / currentSource / currentProvider / currentApiType / nativeToolProviderIds / adapterId / transport / supportsStreaming / supportsToolCalls / supportsUsage / interaction`，shared tool providers 也已经显式声明 `runtimeKinds`，开始区分哪些 tool provider 是 `claude-sdk + native` 共用，哪些仍然只属于 `claude-sdk`（例如 `skill`）。并且已经按 `OpenClaw` 的思路把 provider-native family 显式拆成 `openai-responses` 与 `openai-codex-responses` 两条 adapter contract，落在 `src/gateway/runtime/native/adapters/*` 与 `src/gateway/runtime/native/types.ts`，避免把所有 OpenAI-compatible source 混成一个模糊 compat lane；同时还有显式 transport plan，把 `defaultTransport / websocketWarmup / storePolicy / serverCompaction` 这些 OpenAI 与 Codex 的行为差异固定下来。`gateway health / services / doctor / Settings > Gateway Diagnostics` 现在已经能直接看到：native lane 是否已注册到 orchestrator、当前 AI source resolve 出来的 runtime endpoint 是否属于 OpenAI-family Responses、当前命中了哪条 native adapter contract、该 adapter 是否已经 `ready`、当前 transport plan 是否已解析，以及 shared tool registry 里有哪些 provider 已经广告为 native-compatible；最新一轮还把 native interaction status 接进了这条观测链，现在可以直接看到 pending approvals / pending questions、最近一次请求时间，以及“当前到底在等用户回答哪一句”。native 侧还新增了 `src/gateway/runtime/native/request.ts`、`src/gateway/runtime/native/normalize.ts` 与 `src/gateway/runtime/native/client.ts`，两个 OpenAI-family adapter 已经不只是“能匹配 endpoint”，而是会显式构建 provider-native `Responses` 请求体、请求头、metadata、reasoning、stream/store 策略，并能把 `Responses` 的 completed response 与 stream event 统一归一成 `text / tool-call / usage / lifecycle / error` 结构；同时 native lane 也已经拥有真实 upstream transport client，能执行 non-stream JSON 响应、解析 SSE 流事件、收敛 upstream error。现在 `nativeRuntime.sendMessage()` 已经接上了这条链：会解析 runtime endpoint、选择显式 adapter、执行 upstream request、把文本流事件发到现有 `agent:start / agent:message / agent:complete / agent:error` 通道，并把 user/assistant 消息与 token usage 落进现有 conversation store。shared tool registry 也已经正式接到 native request builder，app-managed SDK MCP servers 现在可以被提取成 namespaced `function tools`，作为 `Responses.tools` 真正挂进 provider-native request；同时 native send path 第一次会把 upstream `tool_calls` 映射回现有 `agent:thought / agent:tool-call / agent:tool-result / agent:error`，并且不再止步于失败闭环，而是已经具备第一版 tool executor bridge：可以直接执行 in-process shared SDK MCP tools，再用 `previous_response_id + function_call_output` 继续 follow-up roundtrip。再往前一步，native lane 现在已经有 `src/gateway/runtime/native/interaction.ts` 这层 interaction manager，并开始复用现有 `agent:tool-call / agent:tool-approval-resolved / agent:user-question / agent:user-question-answered` renderer 事件；`permission-handler` 也已能在没有 Claude SDK pending session 时继续 resolve native lane 的 approval / answer。最新一轮还补了 `src/gateway/runtime/registration.ts`，让 orchestrator 每次选 runtime 前都会根据“当前 AI source + shared native tools 是否就绪”自动同步 `native` lane 的注册状态。为了符合非技术用户使用场景，最新一轮还把 native lane 里的错误文案、状态说明和设置页词汇统一改成更直白的表达，避免直接露出 `provider-native / adapter / endpoint / pending approval` 这类硬术语。再最新一轮里，native lane 还补上了内建的 `app__ask_user_question` 追问能力：模型在关键细节不清楚时，可以正式停下来问用户一句；同时系统会先把问题自动整理成更短、更少术语、更像普通用户能看懂的话，再把选择题卡片发到前端。此时 `Claude SDK Runtime` 依旧是默认主链路，但 `NativeRuntime` 已经不再只是“request/stream contract 已就绪”，而是“OpenAI/Codex 两条 provider-native lane 已具备真实 transport、tool roundtrip、interactive approval 接入点、interactive question bridge、用户可读文案和可用 lane 自动注册”的状态；剩下主要缺的是更完整的 user-question 历史/恢复、更复杂 orchestration contract，以及第二批 provider-native adapters。

### 目标

- 先让 OpenAI / Codex 原生跑起来。

### 任务清单

- 新增 `native runtime` contract 实现
- 先接 OpenAI Responses
- 先接 Codex Responses
- 固定 request builder / response normalizer contract
- 统一 streaming / tool-calls / usage / fallback

## M8 NativeRuntime 灰度扩展

### 目标

- 把 NativeRuntime 从实验能力变成可上线能力。

### 任务清单

- provider / model 级 feature flag
- compat fallback 兜底
- 指标与灰度
- 第二批接入 `Kimi / GLM / DeepSeek / Qwen`
