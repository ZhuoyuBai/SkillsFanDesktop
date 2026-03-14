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

当前状态：已完成
当前进展：`M5` 现在已经从“先收 `Terminal / Chrome / iTerm`”推进到完整的第一批桌面产品化范围。`Terminal / iTerm / iTerm2` 的 `Session Control`、`Run And Verify`、`iTerm Pane Ops`，`Chrome / Chromium` 的 `Tab Navigation`、`Tab Observe`、`Tab Cleanup`，以及最新补上的 `Finder` 的 `Folder Access`、`Window And Search` 与 `SkillsFan` 的 `App Control`，都已经作为正式 workflow 挂进 `Settings > Computer Automation`、gateway health、services 和 doctor。对应的 smoke flow 也已经形成闭环：除 `terminal.command-roundtrip`、`terminal.session-targeting`、`iterm.split-pane-roundtrip`、`chrome.tab-roundtrip`、`chrome.discovery-roundtrip` 外，现已补上 `finder.navigation-roundtrip` 与 `skillsfan.settings-roundtrip`，并统一进入 adapter metadata、host status 和设置页执行入口。`Finder` 与 `SkillsFan` adapter 现在都已从 `planned` 升级为 `active`，设置页里也不再显示“计划支持”，而是作为正式可用能力出现在 `Computer Automation / 电脑自动化 / 電腦自動化` 入口中。这意味着 `M5` 的目标“把桌面动作层变成用户可感知的产品能力”已经满足。

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

当前状态：已完成
当前进展：共享工具层现在已经从“开始抽离”推进到“成为两条 runtime 的统一入口”。`src/gateway/tools/*` 不只是保留初版 registry，而是已经形成完整的共享工具面：`catalog`、`directory`、`provider definitions`、`built-ins`、`permission policy` 都已收进 `gateway/tools`；同时又补上了 `src/gateway/tools/runtime-bundle.ts`，把 `Claude SDK Runtime` 与 `NativeRuntime` 真正接到同一份 runtime bundle 上。现在 `buildRuntimeToolBundle()` 会统一产出 `claudeSdk` 视图和 `native` 视图：前者负责 MCP server 装配，后者负责 native-compatible provider 列表、function tools 和 shared tool registry readiness。`sdk-options`、native send path、native rollout acceptance、gateway health 与 native runtime registration 都已经开始复用这条共享入口，不再各自手工拼 provider 清单或再从不同地方复制工具边界逻辑。与此同时，Claude Code SDK 默认允许的 built-in tools、平台统一禁用的 server-side tools、hosted subagent 不允许使用的 built-in tools，也都继续由同一份 `built-ins.ts` 维护。这意味着 `Claude SDK Runtime` 和 `NativeRuntime` 现在已经共享同一套核心工具底稿；后续再接 provider 或继续扩本地自动化能力时，不需要再复制一套工具 registry、provider 元数据或 function tool exporter，因此 `M6` 的目标“给 `ClaudeSdkRuntime` 和未来 `NativeRuntime` 提供统一工具层”已经满足。

### 目标

- 给 `ClaudeSdkRuntime` 和未来 `NativeRuntime` 提供统一工具层。

### 任务清单

- 把 `buildSdkOptions()` 中直接拼 MCP server 的逻辑拆成统一 registry
- 抽象 tool definition / tool context / permission gate
- 抽象 browser / desktop / skill / extension tool providers

## M7 NativeRuntime v1

当前状态：已完成
当前进展：`NativeRuntime v1` 现在已经从“OpenAI/Codex 的 provider-native prototype”推进到第一版可交付运行时。当前 native lane 已经完整覆盖三条协议族：`openai-responses`、`openai-codex-responses`、`anthropic-messages`；并且默认灰度范围已稳定在 `custom / openai / openai-codex / zhipu / minimax / kimi / deepseek` 这些产品实际存在的 source 上。`src/gateway/runtime/native/runtime.ts`、`capabilities.ts`、`transport.ts`、`request.ts`、`normalize.ts` 与 `client.ts` 已经把 endpoint resolve、adapter resolve、transport plan、request builder、response normalizer、streaming/tool-call/usage/fallback contract 固定下来；真实 send path 也已经接上，能完成 upstream request、tool roundtrip、approval、用户追问、停止、中断后继续，以及 conversation store 落库。native lane 现在还会通过共享 runtime tool bundle 读取同一份 native-compatible provider 列表和 function tools，不再自己拼装第二套工具面。与此同时，首批 simple task 范围也已经从 `chat / browser / terminal` 扩到完整的当前桌面产品化能力：`Finder` 和 `SkillsFan` 也已经进入第一批简单任务范围，对应 smoke flow `finder.navigation-roundtrip` 与 `skillsfan.settings-roundtrip` 已纳入 runtime rollout acceptance。native rollout acceptance、orchestrator registration、gateway health、services 与 doctor 现在都通过共享工具入口和统一 readiness contract 表达 native lane 状态，不再只是“能跑起来”，而是具备可观测、可回退、可验收的第一版运行闭环。默认超时、图片输入本地拦截、保守回退、用户可读失败提示也都已经补齐，因此 `M7` 的目标“先让 OpenAI / Codex 原生跑起来”，到当前范围为止已经满足；后续如果继续推进，将属于新阶段的 provider 扩面或更复杂 orchestration，而不再是 `M7 NativeRuntime v1` 本身。

### 目标

- 先让 OpenAI / Codex 原生跑起来。

### 任务清单

- 新增 `native runtime` contract 实现
- 先接 OpenAI Responses
- 先接 Codex Responses
- 固定 request builder / response normalizer contract
- 统一 streaming / tool-calls / usage / fallback

## M8 NativeRuntime 灰度扩展

当前状态：已完成
当前进展：这一阶段已经从“实验中的 native lane”收成了可上线的第一版灰度扩展。现在 `runtime.nativeRollout` 已支持 `sourceAllowlist / sourceBlocklist / modelAllowlistBySource / modelBlocklistBySource` 这组最小规则；默认策略也已经调整为“先按 source + 协议兼容性放行”，不再把具体模型 ID 写死在产品默认配置里。首批 source 范围已稳定在 `custom / openai / openai-codex / zhipu / minimax / kimi / deepseek`；围绕这些 anthropic-compatible custom source，native lane 已补齐 `anthropic-messages` adapter family，会走 `POST /v1/messages`、使用 `x-api-key` 和 `anthropic-version` 请求头，并先以 non-stream + tool roundtrip 的保守形态接入。`resolveRuntimeSelection()`、`NativeRuntime.sendMessage()`、orchestrator、gateway health 和 doctor 现在都已经能显式表达灰度边界：source/model 不在策略内时会标成 `policy_held`，兼容阻塞时也会区分 `no-endpoint / requires-responses / adapter-unavailable / shared-tools-missing / ready`。同时，这一阶段还把第二批 source 的最小稳定性收住了：native request 默认带 `5` 分钟超时，`DeepSeek anthropic-compatible` 放宽到 `10` 分钟；`DeepSeek` 当前不稳定的图片输入会在本地先挡住；首批 native 范围里，图片消息和图片附件都会自动回到更稳的处理方式，而不是误进 native 后再抛兼容错误。整个改动始终没有增加新的用户侧开关，因此这阶段的目标“把 NativeRuntime 从实验能力变成可上线能力”已经满足。

### 目标

- 把 NativeRuntime 从实验能力变成可上线能力。

### 任务清单

- provider / model 级 feature flag
- compat fallback 兜底
- 指标与灰度
- 第二批先接入当前产品预设里的 `zhipu / minimax / kimi / deepseek` 这类 anthropic-compatible custom source
- 后续再视产品入口扩面决定是否加入新的预设渠道
