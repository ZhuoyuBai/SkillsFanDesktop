# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

SkillsFan is a cross-platform desktop application that wraps Codex in a visual interface. Built with Electron + React + TypeScript using `electron-vite`, it provides a GUI alternative to the CLI while maintaining full agent capabilities.

## Development Commands

```bash
npm run dev              # Start dev server (uses ~/.skillsfan-dev for data)
npm run build            # Build application
npm run test             # Run all tests (check + unit)
npm run test:unit        # Unit tests only (vitest)
npm run test:unit:watch  # Unit tests in watch mode
npm run test:e2e         # E2E tests (Playwright)
npm run i18n             # Extract and translate i18n strings (run before committing new UI text)
```

Run a single unit test:
```bash
vitest run tests/unit/services/space.test.ts --config tests/vitest.config.ts
```

Run a single E2E test project:
```bash
playwright test --config tests/playwright.config.ts --project=smoke
```

Region-specific builds:
```bash
npm run build:mac:cn         # macOS for China region
npm run build:mac:overseas   # macOS for overseas region
npm run build:win:cn         # Windows for China region
npm run build:win:overseas   # Windows for overseas region
```

## Architecture

### Electron Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│                          Main Process                           │
│  ┌─────────────┐    ┌─────────────────────┐                     │
│  │  Bootstrap  │───►│     Services        │                     │
│  │  (phased)   │    │  (agent, config,    │                     │
│  └─────────────┘    │   space, remote...) │                     │
│         │           └─────────────────────┘                     │
│         ▼                      │                                │
│  ┌─────────────┐               │ IPC                            │
│  │ IPC Handlers│◄──────────────┘                                │
│  └─────────────┘                                                │
└─────────────────┬───────────────────────────────────────────────┘
                  │ contextBridge (preload)
┌─────────────────▼───────────────────────────────────────────────┐
│                      Renderer Process                           │
│  ┌──────────────┐   ┌─────────────┐   ┌────────────────────┐    │
│  │ React Pages  │──►│   Stores    │──►│ API (IPC/HTTP)     │    │
│  │  (UI)        │   │  (Zustand)  │   │ Unified interface  │    │
│  └──────────────┘   └─────────────┘   └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Directories

- `src/main/` - Electron main process
  - `services/` - Business logic (agent, config, space, conversation, ai-browser, etc.)
  - `ipc/` - IPC handlers mapping to services
  - `bootstrap/` - Phased initialization (Essential vs Extended services)
  - `http/` - Remote access HTTP/WebSocket server (Express + ws)
- `src/preload/` - Preload scripts exposing IPC to renderer
- `src/renderer/` - React frontend
  - `pages/` - Page components (HomePage, SpacePage, SettingsPage)
  - `stores/` - Zustand state management
  - `api/` - Unified API adapter (works for both IPC and HTTP modes)
  - `components/` - UI components
  - `i18n/` - Internationalization (locales: en, zh-CN, zh-TW, ja, es, fr, de)
- `src/shared/` - Types and interfaces shared between main and renderer
- `patches/` - patch-package patches (notably for `@anthropic-ai/Codex-agent-sdk`)

### Path Aliases (tsconfig)

- `@/*` → `src/renderer/*`
- `@main/*` → `src/main/*`
- `@shared` / `@shared/*` → `src/shared/*`

### Bootstrap Phases

The app uses two-phase initialization to optimize startup time (see `src/main/bootstrap/`):

1. **Essential** - Services required for first screen render (<500ms target): Config, Space, Conversation, Agent, Artifact, System, Updater, Auth
2. **Extended** - All other services, loaded after window is visible: Onboarding, Remote, Browser, AI Browser, Overlay, Search, etc.

When adding new services, default to Extended unless the feature is needed immediately on app open. Main sends `bootstrap:extended-ready` to renderer when extended services finish loading.

### Adding New IPC Channels

When adding a new IPC event, update these 3 files:
1. `src/preload/index.ts` - Expose to `window.skillsfan`
2. `src/renderer/api/transport.ts` - Add to `methodMap` (for event listeners)
3. `src/renderer/api/index.ts` - Export unified API method

### Dual Transport Architecture

The renderer API (`src/renderer/api/index.ts`) provides a unified interface that works in:
- **Electron mode** - Uses IPC via `window.skillsfan`
- **Remote mode** - Uses HTTP/WebSocket for remote access from browsers

### IPC Response Convention

All IPC handlers return `{ success: boolean, data?: T, error?: string }`.

### Event Naming

IPC events follow the format `{service}:{event}` (e.g., `agent:message`, `browser:state-change`).

### Agent Service

The agent integration lives in `src/main/services/agent/` with a modular split:
- `session-manager.ts` - Session lifecycle (create, warm, close); sessions are cached per conversation
- `send-message.ts` - Core message sending logic
- `control.ts` - Generation control (stop, inject, status)
- `permission-handler.ts` - Tool approval/rejection
- `mcp-manager.ts` - MCP server management

The `@anthropic-ai/Codex-agent-sdk` is patched via `patches/` — check the patch file when upgrading the SDK.

## Testing

- **Unit tests**: `tests/unit/**/*.test.ts` (vitest) — config at `tests/vitest.config.ts`, setup at `tests/unit/setup.ts`
- **E2E tests**: `tests/e2e/specs/**/*.spec.ts` (Playwright) — config at `tests/playwright.config.ts`, projects: `smoke`, `chat`, `remote`
- **Binary checks**: `tests/check/binaries.mjs` — verifies binary deps before packaging

Unit test setup mocks Electron APIs and creates isolated temp directories per test (via `globalThis.__HALO_TEST_DIR__`). Cleanup happens in `afterEach`.

## Code Guidelines

### Language
- All code and comments must be in **English**
- Commit messages use conventional format: `feat:`, `fix:`, `docs:`, etc.

### Styling
Use Tailwind CSS with theme variables, never hardcode colors:
```tsx
// Good
<div className="bg-background text-foreground border-border">

// Bad
<div className="bg-white text-black border-gray-200">
```

### Internationalization
All user-facing text must use `t()` for i18n support. Use English text as keys (not abstract IDs):
```tsx
import { useTranslation } from 'react-i18next'

function Component() {
  const { t } = useTranslation()
  return <Button>{t('Save')}</Button>  // Good - English text as key
  // return <Button>Save</Button>      // Bad - breaks i18n
}
```

Run `npm run i18n` after adding new UI text. This extracts keys and auto-translates via Codex API.

### Icons
Use `lucide-react` for icons.

## Build & Configuration

### Environment Variables
- `SKILLSFAN_DATA_DIR` - Override data directory (set to `~/.skillsfan-dev` in dev mode)
- `SKILLSFAN_REGION` - Build-time region (cn/overseas)
- `SKILLSFAN_API_URL` - API endpoint override

### Build-time Defines (electron.vite.config.ts)
- `__SKILLSFAN_REGION__` - Region setting injected at build time
- `__SKILLSFAN_API_URL__` - API endpoint injected at build time
- Analytics IDs loaded from `.env.local`

### product.json
Defines available auth providers (SkillsFan Credits, GitHub Copilot, Custom API) with multi-language labels and display configuration. Schema: `product.schema.json`.

## Data Storage

- App data stored in `~/.skillsfan/` (production) or `~/.skillsfan-dev/` (development)
- Each Space has isolated files, conversations, and context
- Configuration in `config.json`
- `config.service.ts`: `initializeApp()` must be called first — creates directory structure and loads config
