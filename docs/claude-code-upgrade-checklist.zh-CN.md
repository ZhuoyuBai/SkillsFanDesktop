# SkillsFan 内置 Claude Code 升级手册

更新时间：2026-04-07

适用范围：当前这个 SkillsFan 仓库里的“内置 Claude Code CLI”升级工作。

这份文档有两个用途：

- 记录 2026-04-07 这次从 `2.1.89` 升级到 `2.1.92` 的结果
- 作为以后任何模型重复执行升级时的标准 SOP

## 1. 本次升级结论

2026-04-07 已确认 `@anthropic-ai/claude-code@2.1.92` 已发布，并已在本仓库完成升级。

版本快照：

- 升级前：`@anthropic-ai/claude-code@2.1.89`
- 升级后：`@anthropic-ai/claude-code@2.1.92`
- 2026-04-07 查询到的 npm dist-tags：
  - `latest`: `2.1.92`
  - `next`: `2.1.92`
  - `stable`: `2.1.85`

下载来源：

- npm registry 元数据：`https://registry.npmjs.org/@anthropic-ai/claude-code`
- 2.1.92 tarball：`https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.92.tgz`

本次实际改动文件：

- [package.json](../package.json)
- [package-lock.json](../package-lock.json)
- [yarn.lock](../yarn.lock)
- [docs/claude-code-upgrade-checklist.zh-CN.md](./claude-code-upgrade-checklist.zh-CN.md)

本次没有改动的内容：

- 不改 PTY 启动逻辑
- 不改 renderer 逻辑
- 不改打包脚本
- 不改 `@anthropic-ai/sdk@0.71.0`

关键判断：

- 当前仓库里真正的“Claude Code 内核”是 `@anthropic-ai/claude-code`
- 当前仓库并没有直接依赖 `@anthropic-ai/claude-agent-sdk`
- 以后不要再照旧文档去同步升级 `claude-agent-sdk`，除非仓库重新引入它

## 2. 这个项目里“Claude Code 内核”到底在哪里

当前仓库不是在运行时去单独下载 Claude Code，而是把它作为 npm 依赖随应用一起打包。

源码里的关键位置：

- 版本声明：[package.json](../package.json)
- 锁定结果：[package-lock.json](../package-lock.json)、[yarn.lock](../yarn.lock)
- PTY 启动入口：[src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts)
- PTY 认证与环境变量：[src/main/services/pty-credentials.ts](../src/main/services/pty-credentials.ts)
- macOS `node-pty` helper 权限修复：[scripts/fix-node-pty-helper-permissions.mjs](../scripts/fix-node-pty-helper-permissions.mjs)
- macOS 打包后补权限：[scripts/afterPack.cjs](../scripts/afterPack.cjs)

[src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts) 里当前是这样找 CLI 的：

- 先找 `app.getAppPath()/node_modules/@anthropic-ai/claude-code/cli.js`
- 再找 `require.resolve('@anthropic-ai/claude-code/cli.js')`
- 再找相对 `__dirname` 的候选路径

所以这里的升级本质上是：

1. 把 `@anthropic-ai/claude-code` 升到目标版本
2. 更新 lockfile
3. 验证 `cli.js` 入口还存在
4. 验证构建产物和 PTY 启动链路没有被打断

结论：

- 这不是“替换一个外部二进制”
- 这不是“终端里单独安装 claude 命令”
- 这是“升级桌面应用内置的 npm 依赖并重新验证”

## 3. 本次实际执行过的命令

先确认上游版本和下载地址：

```bash
npm view @anthropic-ai/claude-code version dist-tags versions --json
npm view @anthropic-ai/claude-code engines bin --json
npm view @anthropic-ai/claude-code@2.1.92 dist.tarball dist.integrity --json
```

实际升级命令：

```bash
npm install @anthropic-ai/claude-code@2.1.92 --save-exact
```

实际验证命令：

```bash
npm ls @anthropic-ai/claude-code
node -p "require.resolve('@anthropic-ai/claude-code/cli.js')"
node -e "const p=require('./node_modules/@anthropic-ai/claude-code/package.json'); console.log(JSON.stringify({version:p.version, bin:p.bin, engines:p.engines}, null, 2))"
./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.json
node tests/check/binaries.mjs --platform mac
git diff --check
npm run build
```

## 4. 本次验证结果

已经确认通过：

- `npm ls @anthropic-ai/claude-code` 显示当前安装版本为 `2.1.92`
- `require.resolve('@anthropic-ai/claude-code/cli.js')` 仍然成功
- 包内 `bin` 仍然是 `claude -> cli.js`
- 包内 `engines.node` 仍然是 `>=18.0.0`
- TypeScript 静态检查通过
- `tests/check/binaries.mjs --platform mac` 通过
- `git diff --check` 通过
- `npm run build` 通过

这次构建级验证说明：

- 不是只有依赖树更新成功
- Electron + preload + renderer 的构建链路仍然正常
- 内置 Claude Code CLI 的路径没有在构建阶段被明显破坏

## 5. 以后重复升级时的标准流程

下面这套流程就是以后让我重复执行升级时应遵循的标准流程。

### 5.1 先确认“目标版本是否真实存在”

不要凭记忆升级，也不要只看聊天记录。

先跑：

```bash
npm view @anthropic-ai/claude-code version dist-tags versions engines bin --json
```

如果用户指定了具体版本，再跑：

```bash
npm view @anthropic-ai/claude-code@<target_version> version dist.tarball dist.integrity engines bin --json
```

判断规则：

- 如果用户明确指定版本，例如 `2.1.92`，先确认该版本确实已发布
- 如果用户说“升级到最新”，优先看 `dist-tags.latest`
- 如果用户说“稳一点”，优先看 `dist-tags.stable`
- 回答用户时要写绝对日期，例如“截至 2026-04-07，latest 是 2.1.92”

### 5.2 确认当前仓库是不是还沿用同一条集成链路

每次升级前先确认下面这些点没有根本变化：

- [package.json](../package.json) 里是否仍然直接依赖 `@anthropic-ai/claude-code`
- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts) 是否仍然通过 `cli.js` 启动
- [scripts/afterPack.cjs](../scripts/afterPack.cjs) 和 [scripts/fix-node-pty-helper-permissions.mjs](../scripts/fix-node-pty-helper-permissions.mjs) 是否仍然存在

如果这些前提变了，不要机械照抄本文档，先重新审视集成方式。

### 5.3 执行升级

标准命令：

```bash
npm install @anthropic-ai/claude-code@<target_version> --save-exact
```

要求：

- 必须使用精确版本，不要改成 `^`
- 升级后必须检查 [package.json](../package.json)
- 升级后必须检查 [package-lock.json](../package-lock.json)
- 如果 [yarn.lock](../yarn.lock) 也跟着变了，一并提交，不要忽略

### 5.4 先验证 CLI 包本身是否还是原来的结构

至少运行：

```bash
npm ls @anthropic-ai/claude-code
node -p "require.resolve('@anthropic-ai/claude-code/cli.js')"
node -e "const p=require('./node_modules/@anthropic-ai/claude-code/package.json'); console.log(JSON.stringify({version:p.version, bin:p.bin, engines:p.engines}, null, 2))"
```

如果失败，优先检查：

- 新版本是否仍然导出 `cli.js`
- `bin.claude` 是否仍然指向 `cli.js`
- `engines.node` 是否高于当前项目可接受的 Node 版本
- [src/main/services/pty-manager.service.ts](../src/main/services/pty-manager.service.ts) 的候选路径是否需要调整

### 5.5 运行最小静态验证

```bash
./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.json
node tests/check/binaries.mjs --platform mac
git diff --check
```

如果你准备发版，再补：

```bash
npm run build
```

如果你准备出正式 mac 包，再补：

```bash
npm run build:mac:cn
```

如果你准备检查 Windows 包，再补：

```bash
npm run test:check:win
```

### 5.6 做一次最小手工验收

至少验证这些路径：

1. 启动应用
2. 打开内置 Claude Code 终端
3. 新建一个终端 tab
4. 再新建第二个终端 tab
5. 切换 tab 并关闭其中一个
6. 验证“新对话”按钮是否还能创建新会话
7. 验证你当前常用的登录模式或本地模型模式是否仍然可用

验收重点：

- 不报 `Claude Code CLI not found`
- 不报 `posix_spawnp failed`
- 不反复卡在 welcome / onboarding
- 多 tab 会话不串
- 关闭一个 tab 不影响其他 tab

## 6. 最容易出错的点

### 6.1 把错误的包当成“Claude Code 内核”

当前仓库里容易混淆的包有两个：

- `@anthropic-ai/claude-code`
- `@anthropic-ai/sdk`

这里真正的内置 CLI 是前者。后者是通用 API SDK，不等于桌面应用里的 Claude Code CLI。

### 6.2 继续沿用旧文档里那套 `claude-agent-sdk` 逻辑

这是当前最容易踩的坑之一。

旧文档里写了 `@anthropic-ai/claude-agent-sdk`，但当前仓库并没有直接依赖它。以后升级时，不要默认去同步升级一个仓库里根本没有的依赖。

### 6.3 只改 `package.json`，不看 lockfile

升级后至少要确认：

- [package.json](../package.json) 已变成目标版本
- [package-lock.json](../package-lock.json) 已解析到目标版本
- [yarn.lock](../yarn.lock) 如果变了，也要一起保留

### 6.4 只看版本号，不看 CLI 入口

版本升上去不代表 PTY 一定还能跑。

真正关键的是：

```bash
node -p "require.resolve('@anthropic-ai/claude-code/cli.js')"
```

如果这条不通，应用里的嵌入式终端大概率就会挂。

### 6.5 忽略 Node 要求

截至 2026-04-07，`@anthropic-ai/claude-code@2.1.92` 要求：

```json
{
  "node": ">=18.0.0"
}
```

如果后续某个版本把要求抬高，先确认当前 Electron 和构建环境是否还能满足，再决定升不升。

### 6.6 构建能过，但 PTY 还是可能因为 helper 权限翻车

这个项目的 PTY 链路不只依赖 Claude Code，还依赖 `node-pty`。

重点看：

- [scripts/fix-node-pty-helper-permissions.mjs](../scripts/fix-node-pty-helper-permissions.mjs)
- [scripts/afterPack.cjs](../scripts/afterPack.cjs)

如果升级后出现 macOS 终端启动失败，不要只盯着 Claude Code 版本，也要检查 `node-pty` helper 权限。

### 6.7 忽略仓库原本已有的脏改动

升级前先看：

```bash
git status --short
```

如果仓库里已经有用户自己的未提交改动，不要回滚，也不要覆盖。升级工作应该只动与升级直接相关的文件。

## 7. 以后再让我升级时，可以直接用这段话

把下面这段话直接发给任何模型即可：

```text
请按照 docs/claude-code-upgrade-checklist.zh-CN.md 的流程，
把 SkillsFan 内置 Claude Code 升级到 @anthropic-ai/claude-code=<目标版本>。
先核对 npm 是否存在该版本，再执行升级、最小验证和必要的构建验证。
不要擅自升级与当前仓库无关的包，不要回滚我现有的未提交改动。
完成后把结果、风险和验证情况写回文档，并同步一份到桌面。
```

## 8. 本次 2.1.92 升级的最终记录

截至 2026-04-07，本仓库内置 Claude Code 已完成：

- 从 `2.1.89` 升级到 `2.1.92`
- `package.json`、`package-lock.json`、`yarn.lock` 已同步
- `cli.js` 入口验证通过
- 最小静态验证通过
- `npm run build` 通过

如果下次用户要求继续升级，不要从旧记忆开始，直接先看本文档第 5 节，然后重新用 `npm view` 核对上游状态。
