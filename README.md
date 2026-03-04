<div align="center">

<img src="./resources/icon.png" alt="SkillsFan Logo" width="120" height="120">

# SkillsFan

**让每个人都能用上 AI Agent 的桌面平台**

不需要终端，不需要编程经验。下载、安装、开始创造。

[🇨🇳 国内下载 skills.fan](https://www.skills.fan/download) · [🌏 海外下载 skillsfan.com](https://skillsfan.com/download)

[![GitHub Stars](https://img.shields.io/github/stars/skillsfan/desktop?style=social)](https://github.com/skillsfan/desktop/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey.svg)](#下载安装)
[![Downloads](https://img.shields.io/github/downloads/skillsfan/desktop/total.svg)](https://github.com/skillsfan/desktop/releases)
[![Version](https://img.shields.io/badge/version-0.2.4-green.svg)](https://github.com/skillsfan/desktop/releases/latest)

[下载安装](#下载安装) · [快速上手](#快速上手) · [功能一览](#功能一览) · [参与贡献](#参与贡献)

**[English](./docs/README.en.md)** | **[繁體中文](./docs/README.zh-TW.md)** | **[日本語](./docs/README.ja.md)** | **[Español](./docs/README.es.md)** | **[Français](./docs/README.fr.md)** | **[Deutsch](./docs/README.de.md)**

</div>

---

## 为什么选择 SkillsFan？

AI Agent 是目前最强大的 AI 使用方式 —— 它不只是回答问题，而是能真正帮你做事：写代码、创建文件、运行命令、浏览网页，反复迭代直到任务完成。

但问题是，大多数 AI Agent 工具都藏在终端里。对于不熟悉命令行的人来说，这是一道看不见的墙。

**SkillsFan 把这道墙拆了。**

我们把完整的 AI Agent 能力包装进一个任何人都能用的桌面应用：一键安装，打开就用，支持国内外多种 AI 模型，还能从手机远程控制。无论你是开发者、设计师、产品经理还是学生，都能用它来完成各种复杂任务。

| | 传统 AI Agent (CLI) | SkillsFan |
|---|:---:|:---:|
| 完整 Agent 能力 | ✅ | ✅ |
| 可视化界面 | ❌ | ✅ |
| 一键安装，无需配置环境 | ❌ | ✅ |
| 国内外多 AI 模型支持 | ❌ | ✅ |
| 自动化任务编排 | ❌ | ✅ |
| 手机/平板远程访问 | ❌ | ✅ |
| 文件实时预览 | ❌ | ✅ |
| 定时调度 | ❌ | ✅ |

---

<h2 id="功能一览">功能一览</h2>

### 可视化 Agent 界面

🖥️ **所见即所得的 Agent 体验** — 不再面对终端黑屏。AI 写代码、创建文件、运行命令的每一步都清晰展现在你面前。

📂 **Space 工作空间** — 每个项目一个独立空间，文件、对话、上下文完全隔离，互不干扰。

📎 **文件实时预览** — 右侧 Artifact Rail 实时展示 AI 创建和修改的所有文件，点击即可预览。支持 HTML 实时渲染、代码语法高亮、图片、Excel、CSV、Markdown 等格式。

### 多模型支持

🤖 **国内模型开箱即用** — 内置智谱 GLM、Kimi、DeepSeek、MiniMax 预设配置，输入 API Key 即可使用。

🌐 **海外模型全面支持** — Claude、OpenAI 一键配置，支持 GitHub Copilot OAuth 登录。

🔧 **自定义 API** — 支持 Anthropic / OpenAI / 兼容格式接入，满足各种场景需求。

### 自动化任务（Loop Task）

🔁 **描述目标，AI 自动完成** — 说出你想要的结果，AI 自动拆解为多个子任务并逐一执行，不需要你一步步盯着。

📝 **灵活创建** — 支持 AI 智能拆解、手动创建、或导入 JSON 文件三种方式。

✅ **质量保障** — 为每个子任务设置验收标准（质量门控），失败自动重试，应用崩溃后也能自动恢复。

### 远程访问

🌍 **跨设备控制** — 从手机、平板或任何浏览器远程操控桌面上的 SkillsFan。开会时用手机给 AI 布置任务，回到工位成果已就绪。

🔗 **局域网 + 公网** — 同一网络直接访问，或通过 Cloudflare Tunnel 一键生成公网 HTTPS 链接。

🔒 **安全保护** — Token 认证 + 二维码扫码连接，保护远程访问安全。

### 定时调度

⏰ **自动定时执行** — 支持 Cron 表达式或固定间隔，配合开机自启动，让 AI 按时完成重复性工作。

### 智能交互

⚡ **流式输出** — 字符级实时展示 AI 回复。

🧠 **思维过程可视化** — 展开查看 AI 每一步的工具调用和执行结果。支持 Off / Low / Medium / High 四档思考深度控制。

🎯 **智能跟进建议** — AI 回复后自动提炼 2-3 个可点击的跟进方向，让对话更高效。

📄 **文件理解** — 粘贴或拖放上传图片、PDF、Word、Excel，AI 直接分析文件内容。

✏️ **注入消息** — 生成过程中随时插入新指令，引导 AI 调整方向。

### Skills 技能系统

🧩 **可复用的 AI 技能包** — 通过 `/` 命令快速调用预设的 AI 工作流，一键搞定常见任务。

🗂️ **技能管理** — 列表/网格视图浏览，预览技能内容，支持安装和删除。

### AI Browser

🌐 **内置 AI 浏览器** — AI 可控制浏览器浏览和操作网页，实现自动化的网页交互。

### 更多

🌏 7 种语言（英文、简中、繁中、日文、西班牙语、法语、德语） · 🌓 深色/浅色主题 · 🧠 跨会话记忆 · 🔍 对话搜索 · 👥 Agent 团队协作（实验性） · 💻 系统托盘后台运行 · 📦 自动更新

---

<h2 id="下载安装">下载安装</h2>

<div align="center">

<a href="https://www.skills.fan/download"><img src="https://img.shields.io/badge/国内下载-skills.fan-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIxIDE1djRhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJ2LTQiLz48cG9seWxpbmUgcG9pbnRzPSI3IDEwIDEyIDE1IDE3IDEwIi8+PGxpbmUgeDE9IjEyIiB4Mj0iMTIiIHkxPSIxNSIgeTI9IjMiLz48L3N2Zz4=" /></a>
&nbsp;&nbsp;&nbsp;
<a href="https://skillsfan.com/download"><img src="https://img.shields.io/badge/Global_Download-skillsfan.com-green?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIxIDE1djRhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJ2LTQiLz48cG9seWxpbmUgcG9pbnRzPSI3IDEwIDEyIDE1IDE3IDEwIi8+PGxpbmUgeDE9IjEyIiB4Mj0iMTIiIHkxPSIxNSIgeTI9IjMiLz48L3N2Zz4=" /></a>

</div>

<br>

<div align="center">

支持 **macOS** (Apple Silicon / Intel) · **Windows** · **Linux** · **Web**（通过远程访问）

</div>

**就这么简单。** 下载、安装、打开。不需要 Node.js，不需要 npm，不需要任何命令行操作。

### 从源码构建

```bash
git clone https://github.com/skillsfan/desktop.git
cd desktop
npm install
npm run dev
```

---

<h2 id="快速上手">快速上手</h2>

1. **下载并启动 SkillsFan**
2. **配置 AI 模型** — 选择你的 AI 服务商（支持智谱、DeepSeek、Kimi、Claude、OpenAI 等），输入 API Key
3. **开始对话** — 试试 "帮我创建一个 React 待办事项应用" 或 "分析这份 Excel 数据"
4. **查看成果** — 文件会实时出现在右侧面板，点击即可预览和编辑

> **小技巧：** 输入 `/` 可以快速调用 Skills 技能包，效率翻倍。

---

## 工作原理

```
┌───────────────────────────────────────────────────────────────┐
│                       SkillsFan Desktop                       │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐   │
│  │   React UI   │◄──►│  主进程       │◄──►│  Agent Engine  │   │
│  │   (可视化)    │IPC │  (Electron)  │    │  (AI Agent)    │   │
│  └──────────────┘    └──────┬───────┘    └────────────────┘   │
│                             │                                  │
│              ┌──────────────┼──────────────┐                   │
│              ▼              ▼              ▼                    │
│        ┌──────────┐  ┌──────────┐  ┌──────────────┐           │
│        │ 本地文件  │  │ AI 浏览器 │  │ HTTP/WS 服务  │           │
│        │ ~/.sf/   │  │ Chromium │  │  (远程访问)    │           │
│        └──────────┘  └──────────┘  └──────────────┘           │
└───────────────────────────────────────────────────────────────┘
```

- **100% 本地运行** — 数据存储在你的电脑上（仅 API 调用会联网）
- **无需后端服务** — 纯桌面客户端，使用你自己的 API Key
- **真正的 Agent** — 工具执行 + 自动迭代，不只是文本生成

---

## 背后的故事

几个月前，一切始于一个简单的烦恼：**我想用 AI Agent，但一整天都在开会。**

在无聊的会议间隙，我想：要是能从手机控制电脑上的 AI Agent 就好了。

紧接着另一个问题出现了 —— 身边不少朋友看到 AI Agent 能做的事情后都想试试，但卡在了安装这一步。*"什么是终端？npm 是什么东西？"* 有人折腾了好几天也没装好。

于是我开始为自己写一个工具：

- **可视化界面** — 不用再盯着命令行的黑底白字
- **一键安装** — 不需要 Node.js、npm，下载就能用
- **远程访问** — 手机、平板、任何浏览器都能控制

第一版几个小时就写完了。之后的所有功能？**都是用 SkillsFan 自己开发的。**

后来事情慢慢变了。我意识到这不该只是我自己的工具。AI Agent 的能力太强大了，不应该被终端的门槛挡住。每个人 —— 不管有没有技术背景 —— 都应该能享受到 AI Agent 带来的效率提升。

于是有了 SkillsFan：一个开源的、通用的 AI Agent 桌面平台。它不绑定某一个模型或服务商，而是让你自由选择最适合自己的 AI，用最简单的方式，做最复杂的事情。

---

## Roadmap

### 已完成

- [x] 完整 Agent Loop 能力
- [x] Space 工作空间 & 对话管理
- [x] 文件预览（代码、HTML、图片、Markdown、Excel）
- [x] 远程访问（局域网 + 公网隧道）
- [x] AI Browser（浏览器控制）
- [x] Skills 技能系统
- [x] Loop Task 自动化任务
- [x] 多模型支持（Claude、OpenAI、DeepSeek、智谱、Kimi、MiniMax）
- [x] 7 种语言支持
- [x] 定时调度 & 崩溃恢复
- [x] Agent 团队协作（实验性）

### 计划中

- [ ] 插件系统
- [ ] 语音输入
- [ ] 更多 AI 模型接入
- [ ] 移动端原生应用

---

<h2 id="参与贡献">参与贡献</h2>

SkillsFan 是开源项目，因为我们相信 AI 的力量应该属于每个人。

欢迎各种形式的贡献：

- **翻译** — 帮助我们支持更多语言（见 `src/renderer/i18n/`）
- **Bug 反馈** — 发现问题请提 Issue
- **功能建议** — 你希望 SkillsFan 增加什么功能？
- **代码贡献** — PR 随时欢迎！

```bash
# 开发环境搭建
git clone https://github.com/skillsfan/desktop.git
cd desktop
npm install
npm run dev
```

---

## 社区

- [GitHub Discussions](https://github.com/skillsfan/desktop/discussions) — 提问与交流
- [Issues](https://github.com/skillsfan/desktop/issues) — Bug 反馈与功能建议

---

## 许可证

MIT License — 详见 [LICENSE](LICENSE)。

---

<div align="center">

### 由 AI 构建，为人而生。

如果 SkillsFan 帮助你完成了有趣的事情，欢迎告诉我们。

**给个 Star** 让更多人发现这个项目。

[![Star History Chart](https://api.star-history.com/svg?repos=skillsfan/desktop&type=Date)](https://star-history.com/#skillsfan/desktop&Date)

[回到顶部](#skillsfan)

</div>
