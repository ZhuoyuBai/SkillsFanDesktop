<div align="center">

# SkillsFan

**AI Agents Without the Barriers**

No setup required. No terminal needed. Just download and go.

[🇨🇳 China Download (skills.fan)](https://www.skills.fan/download) · [🌏 Global Download (skillsfan.com)](https://skillsfan.com/download)

[中文](../README.md) | **English**

</div>

---

## Why SkillsFan?

AI Agents represent the most powerful way to use AI today — they don't just answer questions, they actually get things done: writing code, creating files, running commands, browsing the web, and iterating until the task is complete.

The problem? Most AI Agent tools live inside the terminal. For anyone unfamiliar with the command line, that's an invisible wall.

**SkillsFan tears that wall down.**

We've wrapped full AI Agent capabilities into a desktop app that anyone can use: one-click install, open and go, multi-model support, and remote control from your phone. Whether you're a developer, designer, product manager, or student, you can use it to tackle complex tasks with ease.

| | Traditional AI Agent (CLI) | SkillsFan |
|---|:---:|:---:|
| Full Agent capabilities | ✅ | ✅ |
| Visual interface | ❌ | ✅ |
| One-click install, no setup required | ❌ | ✅ |
| Multi-model support | ❌ | ✅ |
| Automated task orchestration | ❌ | ✅ |
| Phone/tablet remote access | ❌ | ✅ |
| Real-time file preview | ❌ | ✅ |
| Scheduled execution | ❌ | ✅ |

---

<h2 id="features">Features</h2>

### Visual Agent Interface

🖥️ **Visual Agent Experience** — No more terminal black screens. Every step the AI takes — writing code, creating files, running commands — is clearly displayed.

📂 **Space Workspaces** — One isolated space per project. Files, conversations, and context are completely separated.

📎 **Real-time File Preview** — The Artifact Rail shows all files created and modified by the AI in real time. Click to preview with live HTML rendering, code syntax highlighting, image viewing, Excel, CSV, and Markdown support.

### Multi-Model Support

🤖 **Chinese AI Models Ready** — Built-in presets for Zhipu GLM, Kimi, DeepSeek, and MiniMax. Just enter your API key.

🌐 **Global Models Fully Supported** — Claude and OpenAI with one-click setup. GitHub Copilot OAuth login supported.

🔧 **Custom API** — Supports Anthropic / OpenAI / compatible formats to fit any scenario.

### Automated Tasks (Loop Task)

🔁 **Describe Your Goal, AI Does the Rest** — Tell it what you want, and the AI automatically breaks it down into subtasks and executes them one by one.

📝 **Flexible Creation** — Three methods: AI-powered decomposition, manual creation, or import from a JSON file.

✅ **Quality Assurance** — Set acceptance criteria (quality gates) for each subtask. Failed tasks retry automatically, and interrupted tasks recover after app restart.

### Remote Access

🌍 **Cross-device Control** — Control SkillsFan on your desktop from your phone, tablet, or any browser. Assign tasks from your phone during a meeting, and the results are ready when you return.

🔗 **LAN + Public Internet** — Direct access on the same network, or generate a public HTTPS link with one click via Cloudflare Tunnel.

🔒 **Secure Access** — Token authentication + QR code scanning to keep your sessions safe.

### Scheduled Execution

⏰ **Automated Scheduling** — Supports Cron expressions or fixed intervals. Combined with launch-at-startup, let AI handle recurring work on schedule.

### Smart Interactions

⚡ **Streaming Output** — Character-by-character real-time display of AI responses.

🧠 **Thinking Process Visualization** — Expand to see every tool call and execution result. Supports four depth levels: Off / Low / Medium / High.

🎯 **Smart Follow-up Suggestions** — After each response, the AI offers 2-3 clickable follow-up directions for more efficient conversations.

📄 **File Understanding** — Paste or drag-and-drop images, PDFs, Word docs, and Excel files. The AI analyzes file content directly.

✏️ **Inject Messages** — Insert new instructions mid-generation to steer the AI in a different direction.

### Skills System

🧩 **Reusable AI Skill Packs** — Trigger preset AI workflows via `/` commands for quick access to common tasks.

🗂️ **Skill Management** — Browse in list or grid view, preview content, install and remove with ease.

### AI Browser

🌐 **Built-in AI Browser** — The AI can control a browser to navigate and interact with web pages for automated web interactions.

### And More

🌏 3 languages (English, Simplified Chinese, Traditional Chinese) · 🌓 Dark/light themes · 🧠 Cross-session memory · 🔍 Conversation search · 👥 Agent team collaboration (experimental) · 💻 System tray background mode · 📦 Auto-updates

---

<h2 id="download">Download</h2>

<div align="center">

[🇨🇳 China Download (skills.fan)](https://www.skills.fan/download) · [🌏 Global Download (skillsfan.com)](https://skillsfan.com/download)

Supports **macOS** (Apple Silicon / Intel) · **Windows**

</div>

Download, install, open. No Node.js, no npm, no command line required.

### Build from Source

```bash
git clone https://github.com/skillsfan/desktop.git
cd desktop
npm install
npm run dev
```

---

<h2 id="quick-start">Quick Start</h2>

1. **Download and launch SkillsFan**
2. **Set up your AI model** — Choose your AI provider (Zhipu, DeepSeek, Kimi, Claude, OpenAI, etc.) and enter your API key
3. **Start a conversation** — Try "Build me a personal website" or "Help me organize this data"
4. **See the results** — Files appear in real time in the side panel. Click to preview and edit.

> **Pro tip:** Type `/` to invoke Skills packs for quick access to preset AI workflows.

---

## How It Works

SkillsFan is a purely local desktop client with no backend dependency.

```
┌──────────────────────────────────┐
│         SkillsFan Desktop        │
│                                  │
│  Visual UI  ◄──►  Agent Engine   │
│      │               │           │
│      ▼               ▼           │
│  File Preview   Tool Exec & Loop │
└──────┬───────────────┬───────────┘
       │               │
  Local Files      AI Model API
 (Your Machine)   (Your API Key)
```

- **100% local** — Your data stays on your machine (only API calls go over the network)
- **No backend required** — Uses your own API keys, no middleman servers
- **True Agent** — Tool execution + automatic iteration, not just text generation

---

## Community

- [GitHub Discussions](https://github.com/skillsfan/desktop/discussions) — Questions & conversations
- [Issues](https://github.com/skillsfan/desktop/issues) — Bug reports & feature requests

---

## License

MIT License — See [LICENSE](../LICENSE) for details.

---

<div align="center">

**Give it a Star ⭐ to help more people discover this project**

[![Star History Chart](https://api.star-history.com/svg?repos=skillsfan/desktop&type=Date)](https://star-history.com/#skillsfan/desktop&Date)

[Back to top](#skillsfan)

</div>
