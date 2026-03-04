<div align="center">

<img src="./resources/icon.png" alt="技能范 Logo" width="120" height="120">

# 技能范

**让 AI Agent 不再有门槛**

无需安装环境，无需配置终端。下载即用。

[🇨🇳 国内下载 skills.fan](https://www.skills.fan/download) · [🌏 海外下载 skillsfan.com](https://skillsfan.com/download)

**中文** | [English](./docs/README.en.md)

</div>

---

## 为什么选择技能范？

AI Agent 是目前最强大的 AI 使用方式 —— 它不只是回答问题，而是能真正帮你做事：写代码、创建文件、运行命令、浏览网页，反复迭代直到任务完成。

但问题是，大多数 AI Agent 工具都藏在终端里。对于不熟悉命令行的人来说，这是一道看不见的墙。

**技能范把这道墙拆了。**

我们把完整的 AI Agent 能力包装进一个任何人都能用的桌面应用：一键安装，打开就用，支持国内外多种 AI 模型，还能从手机远程控制。无论你是开发者、设计师、产品经理还是学生，都能用它来完成各种复杂任务。

| | 传统 AI Agent (CLI) | 技能范 |
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

🖥️ **可视化的 Agent 体验** — 不再面对终端黑屏。AI 写代码、创建文件、运行命令的每一步都清晰展现在你面前。

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

🌍 **跨设备控制** — 从手机、平板或任何浏览器远程操控桌面上的技能范。开会时用手机给 AI 布置任务，回到工位成果已就绪。

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

🌏 3 种语言（简体中文、繁体中文、英文） · 🌓 深色/浅色主题 · 🧠 跨会话记忆 · 🔍 对话搜索 · 👥 Agent 团队协作（实验性） · 💻 系统托盘后台运行 · 📦 自动更新

---

<h2 id="下载安装">下载安装</h2>

<div align="center">

[🇨🇳 国内下载 skills.fan](https://www.skills.fan/download) · [🌏 海外下载 skillsfan.com](https://skillsfan.com/download)

支持 **macOS** (Apple Silicon / Intel) · **Windows**

</div>

下载、安装、打开。不需要 Node.js，不需要 npm，不需要任何命令行操作。

### 从源码构建

```bash
git clone https://github.com/skillsfan/desktop.git
cd desktop
npm install
npm run dev
```

---

<h2 id="快速上手">快速上手</h2>

1. **下载并启动技能范**
2. **配置 AI 模型** — 选择你的 AI 服务商（支持智谱、DeepSeek、Kimi、Claude、OpenAI 等），输入 API Key
3. **开始对话** — 试试 "帮我做一个个人网站" 或 "帮我整理这份数据"
4. **查看成果** — 文件会实时出现在右侧面板，点击即可预览和编辑

> **小技巧：** 输入 `/` 可以快速调用 Skills 技能包，效率翻倍。

---

## 工作原理

技能范是一个纯本地运行的桌面客户端，不依赖任何后端服务。

```
┌─────────────────────────────────┐
│          技能范 Desktop          │
│                                 │
│  可视化界面  ◄──►  Agent 引擎   │
│       │              │          │
│       ▼              ▼          │
│  文件预览      工具执行 & 迭代   │
└───────┬──────────────┬──────────┘
        │              │
   本地文件        AI 模型 API
 （你的电脑）    （你的 API Key）
```

- **100% 本地运行** — 数据存储在你的电脑上，仅 API 调用会联网
- **无需后端服务** — 使用你自己的 API Key，没有中间服务器
- **真正的 Agent** — 工具执行 + 自动迭代，不只是文本生成

---

## 社区

- [GitHub Discussions](https://github.com/skillsfan/desktop/discussions) — 提问与交流
- [Issues](https://github.com/skillsfan/desktop/issues) — Bug 反馈与功能建议

---

## 许可证

MIT License — 详见 [LICENSE](LICENSE)。

---

<div align="center">

**给个 Star ⭐ 让更多人发现这个项目**

[![Star History Chart](https://api.star-history.com/svg?repos=skillsfan/desktop&type=Date)](https://star-history.com/#skillsfan/desktop&Date)

[回到顶部](#技能范)

</div>
