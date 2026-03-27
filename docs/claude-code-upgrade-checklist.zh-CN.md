# Claude Code 内置版本升级检查清单

这份清单面向 SkillsFan 开发者。

目标：
- 升级内置 `@anthropic-ai/claude-code` 版本
- 尽量避免终端模式、登录模式、打包链路、macOS PTY 启动链路被新版本破坏
- 在出现问题时，能快速定位到应该修改的代码位置

## 1. 当前集成方式速览

当前仓库中，终端模式里的 Claude Code 不是运行时单独下载，而是随应用一起打包进去。

关键位置：
- 依赖版本：[package.json](../package.json)
- 锁版本：[package-lock.json](../package-lock.json)
- PTY 启动入口：[src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
- macOS `node-pty` helper 权限修复：[scripts/fix-node-pty-helper-permissions.mjs](../scripts/fix-node-pty-helper-permissions.mjs)
- macOS 打包后补权限和签名：[scripts/afterPack.cjs](../scripts/afterPack.cjs)
- SDK patch： [patches/@anthropic-ai+claude-agent-sdk+0.2.72.patch](../patches/@anthropic-ai+claude-agent-sdk+0.2.72.patch)

结论：
- 升级 Claude Code 本质上是升级 npm 依赖并重新打包应用
- 最终用户不能只升级终端里的 Claude Code；需要升级整个 SkillsFan 应用

## 2. 升级前必须先确认的事情

升级前先做这几件事，不要直接改版本号就打包：

- 阅读 Claude Code 上游 release notes，重点看：
  - CLI 参数是否变更
  - 环境变量是否变更
  - 登录 / API key 模式是否变更
  - 首次引导 / onboarding 行为是否变更
  - Node.js 最低版本要求是否变更
- 确认这次升级是：
  - 小版本升级
  - 大版本升级
- 确认本仓库当前 Electron 版本是否足够支撑新 Claude Code 运行时要求
- 确认是否需要同时升级 `@anthropic-ai/claude-agent-sdk`
  - 如果 SDK 也要升级，先检查现有 patch 是否还能套上

建议：
- 对内置 CLI 依赖，优先使用“明确版本升级 + 明确验证”
- 不建议把升级交给 `^` 自动漂移

## 3. 实际升级步骤

### 3.1 修改依赖

检查并更新：

- [package.json](../package.json) 中的 `@anthropic-ai/claude-code`
- 如有需要，同时检查 `@anthropic-ai/claude-agent-sdk`

建议流程：

```bash
npm install @anthropic-ai/claude-code@<目标版本>
```

如果 SDK 也要跟着升：

```bash
npm install @anthropic-ai/claude-agent-sdk@<目标版本>
```

然后确认 lockfile 已更新。

### 3.2 重新安装原生依赖与 postinstall 产物

这个项目依赖 `node-pty`，升级后必须确认 postinstall 逻辑正常跑过：

```bash
npm install
```

重点确认：
- `patch-package` 正常执行
- `electron-builder install-app-deps` 正常执行
- `scripts/fix-node-pty-helper-permissions.mjs` 正常执行

### 3.3 本地静态检查

至少执行：

```bash
npm exec -- tsc --noEmit --pretty false -p tsconfig.json
git diff --check
```

如果这次升级顺带改了终端交互或设置相关逻辑，再补：

```bash
npm run test:unit
```

## 4. 升级后必须逐项验证的功能

下面这些是高优先级检查项，建议按顺序做。

### 4.1 CLI 能否被找到

检查点：
- 终端模式能正常启动，不报 “Claude Code CLI not found”

关联代码：
- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
  - `findClaudeCliPath()`

如果出问题，优先怀疑：
- 包内 CLI 路径变了
- 打包后 `asar` / `asar.unpacked` 布局变了

可能修法：
- 更新 `findClaudeCliPath()` 的候选路径
- 确认新版本包的入口文件是否仍然是 `cli.js`

### 4.2 本地模型模式是否仍然生效

检查点：
- 开启“跳过 Claude 登录”后，新建终端是否仍然直接走本地模型模式
- 不应要求登录 Claude
- 不应回到 OAuth 登录态

关联代码：
- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
  - `resolveClaudeCliEnv()`

重点检查环境变量是否仍有效：
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `CLAUDE_CONFIG_DIR`
- 是否仍需要清掉继承的 `ANTHROPIC_AUTH_TOKEN`

如果出问题，优先怀疑：
- 新版本改了 API key 模式识别逻辑
- 新版本不再使用当前这些环境变量
- 新版本优先级变化，环境变量被其他认证状态覆盖

可能修法：
- 根据新版本文档更新 env 注入逻辑
- 在启动前追加新的 auth 相关 env
- 如果新版本引入了新的配置文件格式，改成写新格式

### 4.3 首次引导页 / 欢迎页是否反复出现

检查点：
- 新建终端不应每次都停在 welcome / theme / onboarding 页面

关联代码：
- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
  - `ensureEmbeddedClaudeGlobalConfig()`
  - `resolveEmbeddedClaudeGlobalConfigPath()`

当前我们依赖的初始化字段包括：
- `theme`
- `hasCompletedOnboarding`
- `projects[workDir].hasTrustDialogAccepted`
- `customApiKeyResponses.approved`

如果出问题，优先怀疑：
- 新版本把全局配置文件名改了
- 新版本把 onboarding 完成态字段改了
- 新版本把 trust / theme / API key 确认状态字段改了

可能修法：
- 调整 `resolveEmbeddedClaudeGlobalConfigPath()`
- 调整初始化 JSON 的字段结构
- 如新版本不再读全局 JSON，而改成其他位置，就改成写新的目标文件

### 4.4 `/new` 是否仍然可用

检查点：
- 工具栏“新对话”按钮是否仍能开启新对话

当前实现依赖：
- 向终端发送 `/new`

如果出问题，优先怀疑：
- 新版本移除了 `/new`
- 命令语义变化
- 命令需要额外确认

可能修法：
- 改成发送新版本支持的命令
- 如果 CLI 暴露了新的更稳定控制方式，优先改成稳定接口

### 4.5 多终端 tab 是否仍然稳定

检查点：
- 连续新建多个终端 tab
- 切换 tab 后会话不串
- 关闭一个 tab 不影响其他 tab

如果出问题，优先怀疑：
- 新版本 CLI 在 PTY 中的启动时间更长，导致 session 初始化状态竞争
- 新版本首屏输出结构变化，触发你原有状态判断误判

可能修法：
- 调整 renderer 中的 loading / exit / error 判断
- 为 session 建立更稳的“已启动”标记

### 4.6 macOS PTY 启动是否仍正常

检查点：
- macOS 上新建终端不报 `posix_spawnp failed`
- 打包后的 app 也能正常开 PTY

关联代码：
- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
- [scripts/fix-node-pty-helper-permissions.mjs](../scripts/fix-node-pty-helper-permissions.mjs)
- [scripts/afterPack.cjs](../scripts/afterPack.cjs)

如果出问题，优先怀疑：
- `node-pty` helper 权限没修好
- 打包后的 helper 没被放进 `asarUnpack`
- 新版本链路导致 Electron / PTY 启动方式变化

可能修法：
- 确认 `spawn-helper` 路径是否变化
- 更新 `afterPack` 中的 chmod 目标路径
- 更新 `validatePtyLaunchPrerequisites()` 的 helper 检测逻辑

### 4.7 打包产物是否仍可运行

检查点：
- `npm run build`
- 至少做一次 mac 打包验证
- 至少安装一次产物验证，而不是只测 dev 模式

建议最少覆盖：
- 开发模式
- 打包后的 mac 应用

如果出问题，优先怀疑：
- 新版本 Claude Code 包内文件布局变化
- Electron 打包后入口路径变化
- afterPack 签名后某些 unpack 文件权限被破坏

## 5. 风险清单

| 风险 | 现象 | 严重度 | 重点排查 | 常见修法 |
| --- | --- | --- | --- | --- |
| CLI 入口变化 | 启动时报 CLI not found | 高 | `findClaudeCliPath()` | 更新候选路径 |
| 登录模式失效 | 新终端要求 Claude 登录 | 高 | env 注入逻辑 | 调整 `ANTHROPIC_*` 与 auth 清理逻辑 |
| onboarding 反复出现 | 每次都进欢迎页 | 高 | 嵌入式配置预热逻辑 | 更新配置文件路径和字段 |
| `/new` 失效 | “新对话”按钮无效 | 中 | 终端命令兼容性 | 改成新命令或其他控制方式 |
| Electron 运行时不兼容 | 启动即崩溃或异常退出 | 高 | Electron / Node 版本 | 升级 Electron 或降回 Claude Code 版本 |
| macOS PTY 启动失败 | `posix_spawnp failed` | 高 | `node-pty` helper 权限 | 修路径、修权限、修 afterPack |
| SDK 与 CLI 漂移 | 聊天区和终端区行为不一致 | 中 | SDK 版本、patch | 同步升级 SDK 并重打 patch |
| 配置结构漂移 | 终端状态异常、登录态污染 | 中 | `CLAUDE_CONFIG_DIR` 里写入格式 | 重写配置生成逻辑 |
| 新增强制确认页 | 启动后卡在新的提示页 | 中 | 上游 release notes、首屏输出 | 在启动前补充配置，或在 UI 里处理新状态 |

## 6. 推荐的回归测试清单

每次升级后，至少做下面这套回归。

### 6.1 启动与会话

- 打开终端模式
- 新建第一个终端
- 确认没有进入登录页
- 确认没有进入欢迎/主题选择页
- 连续再新建 2 到 3 个终端
- 切换 tab，确认输出和状态不串

### 6.2 本地模型模式

- 开启“跳过 Claude 登录”
- 确认当前 AI Source 指向国产模型
- 新建终端
- 在终端里确认已使用本地模型模式

### 6.3 会话操作

- 点击“新对话”
- 关闭当前 tab 再新建
- 重应用当前终端配置
- 修改 tab 名称

### 6.4 打包验证

- `npm run build`
- macOS 至少打一次包
- 安装包启动后新建终端
- 确认 PTY 正常、权限正常、不会报 damaged app

## 7. 升级时最容易漏掉的点

- 只测 dev 模式，不测打包产物
- 只测一个终端，不测多个 tab
- 只测 CLI 能启动，不测本地模型模式
- 忽略 onboarding / trust / config 文件结构变化
- 忽略 macOS `node-pty` helper 权限问题
- 升了 CLI，没看 SDK patch 是否需要同步调整

## 8. 遇到问题时的定位顺序

建议按这个顺序查，不要乱改：

1. 看终端是否能找到 CLI
2. 看启动时传入了哪些 env
3. 看 `CLAUDE_CONFIG_DIR` 指向哪里
4. 看嵌入式全局配置文件是否被正确写出
5. 看首次引导状态字段是否仍被新版本识别
6. 看 CLI 命令接口是否变化，例如 `/new`
7. 看打包后路径、权限、签名是否变化

## 9. 建议的升级策略

### 保守策略

- 只升一个版本跨度
- 每次只升级 Claude Code，不同时改终端 UI
- 升级后立即做 smoke test 和打包验证

### 激进策略

- 同时升级 Claude Code、SDK、Electron

不建议这样做，原因：
- 一旦出问题，很难判断是 CLI、SDK 还是 Electron 导致

## 10. 推荐的提交与发布方式

建议分两步：

1. `chore(deps): bump @anthropic-ai/claude-code to <version>`
2. `fix(terminal): adapt SkillsFan terminal integration for Claude Code <version>`

这样做的好处：
- 依赖升级和兼容修复分开看
- 出问题时更容易回滚

## 11. 回滚策略

如果升级后问题过多，不要硬顶，直接回滚：

- 回退 `package.json`
- 回退 `package-lock.json`
- 回退为适配新版本而改过的终端兼容代码
- 重新 `npm install`
- 重新打包验证

回滚优先级：
- 先恢复可用
- 再分析新版本到底改了什么

## 12. 一份最小可执行操作模板

```bash
# 1. 升级版本
npm install @anthropic-ai/claude-code@<目标版本>

# 2. 重新安装并跑 postinstall
npm install

# 3. 静态检查
npm exec -- tsc --noEmit --pretty false -p tsconfig.json
git diff --check

# 4. 本地运行验证
npm run dev

# 5. 打包验证
npm run build
```

然后按第 6 节的回归测试清单逐项手测。

## 13. 最后结论

对这个项目来说，升级内置 Claude Code 最大的风险不在“依赖能不能装上”，而在下面四类兼容面：

- 认证模式
- 首次引导配置
- PTY 启动链路
- 打包后的 macOS 行为

只要这四类检查到位，升级风险就能控制在一个可接受范围内。
