# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SkillsFan is a cross-platform desktop application that wraps Claude Code in a visual interface. Built with Electron + React + TypeScript, it provides a GUI alternative to the CLI while maintaining full agent capabilities.

## Development Commands

```bash
npm run dev              # Start development server (uses ~/.skillsfan-dev for data)
npm run build            # Build application
npm run test             # Run all tests (check + unit)
npm run test:unit        # Unit tests only (vitest)
npm run test:unit:watch  # Unit tests in watch mode
npm run test:e2e         # E2E tests (Playwright)
npm run i18n             # Extract and translate i18n strings (run before committing new UI text)
```

Build for specific platforms:
```bash
npm run build:mac        # macOS (arm64 + x64)
npm run build:win        # Windows
npm run build:linux      # Linux
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
  - `http/` - Remote access HTTP/WebSocket server
- `src/preload/` - Preload scripts exposing IPC to renderer
- `src/renderer/` - React frontend
  - `pages/` - Page components (HomePage, SpacePage, SettingsPage)
  - `stores/` - Zustand state management
  - `api/` - Unified API adapter (works for both IPC and HTTP modes)
  - `components/` - UI components
  - `i18n/` - Internationalization

### Bootstrap Phases

The app uses two-phase initialization to optimize startup time (see `src/main/bootstrap/`):

1. **Essential** - Services required for first screen render (<500ms target)
2. **Extended** - All other services, loaded after window is visible

When adding new services, default to Extended unless the feature is needed immediately on app open.

### Adding New IPC Channels

When adding a new IPC event, update these 3 files:
1. `src/preload/index.ts` - Expose to `window.skillsfan`
2. `src/renderer/api/transport.ts` - Add to `methodMap` (for event listeners)
3. `src/renderer/api/index.ts` - Export unified API method

### Dual Transport Architecture

The renderer API (`src/renderer/api/index.ts`) provides a unified interface that works in:
- **Electron mode** - Uses IPC via `window.skillsfan`
- **Remote mode** - Uses HTTP/WebSocket for remote access from browsers

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
All user-facing text must use `t()` for i18n support:
```tsx
import { useTranslation } from 'react-i18next'

function Component() {
  const { t } = useTranslation()
  return <Button>{t('Save')}</Button>  // Good
  // return <Button>Save</Button>      // Bad - breaks i18n
}
```

Run `npm run i18n` after adding new UI text.

### Icons
Use `lucide-react` for icons.

## Data Storage

- App data stored in `~/.skillsfan/` (production) or `~/.skillsfan-dev/` (development)
- Each Space has isolated files, conversations, and context
- Configuration in `config.json`
