# Claude Code 内置版本升级说明与操作手册

更新时间：2026-04-01

这份文档既记录本次升级结果，也作为后续重复升级 SkillsFan 内置 Claude Code 的标准操作手册。

## 1. 本次升级结论

2026-04-01 我已核对 npm registry，并完成本仓库内置 Claude Code 版本升级。

版本快照：

- `@anthropic-ai/claude-code`
  - 升级前：`2.1.72`
  - npm `stable`：`2.1.81`
  - npm `latest`：`2.1.89`
  - 本次升级目标：`2.1.89`
- `@anthropic-ai/claude-agent-sdk`
  - 声明版本升级前：`^0.2.72`
  - lockfile 实际已解析到：`0.2.89`
  - npm `latest`：`0.2.89`
  - 本次对齐后：`0.2.89`

本次实际改动：

- 将 [package.json](../package.json) 中的 `@anthropic-ai/claude-code` 固定为 `2.1.89`
- 将 [package.json](../package.json) 中的 `@anthropic-ai/claude-agent-sdk` 固定为 `0.2.89`
- 更新 [package-lock.json](../package-lock.json)
- 不改动 PTY 启动逻辑，不改动 renderer，不改动打包脚本

为什么改成精确版本而不是 `^`：

- 内置 CLI 属于打包产物的一部分，版本漂移会直接影响终端行为
- 精确版本更适合桌面应用发布和问题回溯
- 以后每次升级都应该是“明确确认目标版本 + 明确验证结果”

## 2. 当前项目里的真实集成方式

当前仓库中，内置 Claude Code 不是运行时单独下载，而是作为 npm 依赖随应用一起打包。

关键位置：

- 版本声明：[package.json](../package.json)
- 锁定版本：[package-lock.json](../package-lock.json)
- PTY 启动入口：[src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
- macOS `node-pty` 权限修复：[scripts/fix-node-pty-helper-permissions.mjs](../scripts/fix-node-pty-helper-permissions.mjs)
- macOS 打包后补权限与签名：[scripts/afterPack.cjs](../scripts/afterPack.cjs)

当前 PTY 逻辑直接依赖：

- `@anthropic-ai/claude-code/cli.js`

当前项目现状补充：

- 仓库里目前没有 `patches/` 目录
- 本次升级不涉及 patch-package 自定义补丁调整

结论：

- “升级内置 Claude Code” 本质上是升级 npm 依赖并重新打包应用
- 最终用户不能只升级 App 里的终端 CLI；必须升级整个 SkillsFan 应用

## 3. 本次升级后的最小验证结果

已完成并通过：

```bash
node -p "require.resolve('@anthropic-ai/claude-code/cli.js')"
./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.json
node tests/check/binaries.mjs --platform mac
```

结果：

- `cli.js` 入口在 `2.1.89` 中仍然存在
- TypeScript 类型检查通过
- macOS 二进制检查通过

已发现的仓库基线问题：

```bash
./node_modules/.bin/vitest run tests/unit/services/agent/session-manager.test.ts tests/unit/services/agent/sdk-options.test.ts --config tests/vitest.config.ts
```

结果：

- 上述两组测试失败
- 失败原因不是本次升级引入，而是测试引用了不存在的路径：
  - `src/main/services/agent/session-manager`
  - `src/main/services/agent/sdk-options`
- 当前仓库中并不存在 `src/main/services/agent/` 目录

因此，本次升级的验证结论应写成：

- 升级本身已完成
- 最小静态检查通过
- 相关单测存在既有基线问题，不能作为本次升级失败依据

## 4. 以后升级前，先用这些命令确认上游版本

先查最新版本，不要凭记忆升级。

```bash
npm view @anthropic-ai/claude-code version dist-tags --json
npm view @anthropic-ai/claude-agent-sdk version dist-tags --json
npm view @anthropic-ai/claude-code engines --json
npm view @anthropic-ai/claude-agent-sdk peerDependencies engines --json
```

判断规则：

- 如果你要“最新版本”，优先取 `dist-tags.latest`
- 如果你要“相对稳妥版本”，优先取 `dist-tags.stable`
- 如果 `claude-code` 和 `claude-agent-sdk` 都发布了相同尾号版本，优先一并对齐
- 如果上游要求的 Node 版本高于当前 Electron 内置 Node 版本，不要直接升级

## 5. 标准升级步骤

下面这套流程就是以后让我重复执行时应遵循的标准流程。

### 5.1 确认目标版本

示例：

- `@anthropic-ai/claude-code` 目标版本：`2.1.89`
- `@anthropic-ai/claude-agent-sdk` 目标版本：`0.2.89`

### 5.2 升级依赖并固定精确版本

```bash
npm install @anthropic-ai/claude-code@<claude_code_version> @anthropic-ai/claude-agent-sdk@<sdk_version> --save-exact
```

如果只升级 CLI，不升级 SDK，使用：

```bash
npm install @anthropic-ai/claude-code@<claude_code_version> --save-exact
```

升级后必须确认：

- [package.json](../package.json) 中不再出现 `^`
- [package-lock.json](../package-lock.json) 已更新到目标版本

### 5.3 检查内置 CLI 入口是否还存在

```bash
node -p "require.resolve('@anthropic-ai/claude-code/cli.js')"
```

如果失败，优先检查：

- 新版本是否仍然导出 `cli.js`
- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts) 中的候选路径是否需要调整

### 5.4 运行最小验证

```bash
./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.json
node tests/check/binaries.mjs --platform mac
git diff --check
```

如果你准备发版，再补：

```bash
npm run build
npm run build:mac:cn
```

如果你准备验证 Windows 包，再补：

```bash
npm run prepare:win-x64
npm run test:check:win
```

### 5.5 手工验收终端关键路径

至少做这些：

1. 启动应用
2. 打开内置 Claude Code 终端
3. 新建一个终端 tab
4. 再新建第二个终端 tab
5. 切换 tab 并关闭其中一个
6. 验证“新对话”按钮是否还能触发新会话
7. 验证本地模型模式或现有登录模式是否仍然正常

验收重点：

- 不报 `Claude Code CLI not found`
- 不报 `posix_spawnp failed`
- 不重复卡在 welcome / onboarding
- 多 tab 会话不串
- 关闭一个 tab 不影响其他 tab

## 6. 重点风险面

每次升级都优先检查下面这几类兼容风险。

### 6.1 CLI 入口路径变化

关联代码：

- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)

重点检查：

- `require.resolve('@anthropic-ai/claude-code/cli.js')` 是否仍然有效
- 打包后 `app.asar` / `app.asar.unpacked` 路径是否仍然正确

### 6.2 认证与环境变量行为变化

关联代码：

- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
- [src/main/services/pty-credentials.ts](../src/main/services/pty-credentials.ts)

重点检查：

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `CLAUDE_CONFIG_DIR`
- 是否还需要清理继承态里的 auth token

### 6.3 onboarding 或 trust 状态字段变化

关联代码：

- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)

重点检查：

- 全局配置文件名是否变化
- `hasCompletedOnboarding` 是否变化
- `projects[workDir].hasTrustDialogAccepted` 是否变化
- `customApiKeyResponses.approved` 是否变化

### 6.4 macOS PTY 启动链路变化

关联代码：

- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
- [scripts/fix-node-pty-helper-permissions.mjs](../scripts/fix-node-pty-helper-permissions.mjs)
- [scripts/afterPack.cjs](../scripts/afterPack.cjs)

重点检查：

- `node-pty` helper 是否仍有执行权限
- 打包后 helper 是否仍在 `asarUnpack` 链路中
- 升级后 Electron + PTY + Claude Code 的启动方式是否变化

## 7. 回滚方式

如果新版本有问题，按下面方式回滚：

```bash
npm install @anthropic-ai/claude-code@<old_version> @anthropic-ai/claude-agent-sdk@<old_version> --save-exact
./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.json
node tests/check/binaries.mjs --platform mac
```

本次升级前的可回滚基线：

- `@anthropic-ai/claude-code`：`2.1.72`
- `@anthropic-ai/claude-agent-sdk`：`0.2.89` 或声明值 `^0.2.72`

如果只回滚 CLI：

```bash
npm install @anthropic-ai/claude-code@2.1.72 --save-exact
```

## 8. 下次让我执行时，可以直接给我的指令模板

以后你只要把下面这句话发给我，我就可以按这份文档直接执行：

```text
请按照 docs/claude-code-upgrade-checklist.zh-CN.md 的流程，把 SkillsFan 内置 Claude Code 升级到 npm latest，并完成最小验证；如果 latest 不适合发版，就改用 stable，并把差异和风险写出来。
```

如果你要指定版本，用这句：

```text
请按照 docs/claude-code-upgrade-checklist.zh-CN.md 的流程，把 SkillsFan 内置 Claude Code 升级到 @anthropic-ai/claude-code=<目标版本>，并尽量把 @anthropic-ai/claude-agent-sdk 对齐到兼容版本，完成最小验证后汇报结果。
```

## 9. 本次升级摘要

这次升级的最终状态如下：

- 内置 `Claude Code` 已从 `2.1.72` 升级到 `2.1.89`
- `Claude Agent SDK` 已在声明层面对齐到 `0.2.89`
- 版本声明从浮动版本改为精确版本
- 最小静态检查通过
- 已知的 agent 单测路径失效问题需要后续单独修复
