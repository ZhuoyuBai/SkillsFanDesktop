/**
 * Agent Module - Helper Functions
 *
 * Utility functions shared across the agent module.
 * Includes working directory management, Electron path handling,
 * API credential resolution, and renderer communication.
 */

import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, readlinkSync, readFileSync, writeFileSync } from 'fs'
import { getConfig, getTempSpacePath } from '../config.service'
import { getSpace } from '../space.service'
import { getAISourceManager } from '../ai-sources'
import { broadcastToAll, broadcastToWebSocket } from '../../http/websocket'
import type { ApiCredentials, MainWindowRef } from './types'

// ============================================
// Headless Electron Path Management
// ============================================

// Cached path to headless Electron binary (outside .app bundle to prevent Dock icon on macOS)
let headlessElectronPath: string | null = null

/**
 * Get the path to the headless Electron binary.
 *
 * On macOS, when spawning Electron as a child process with ELECTRON_RUN_AS_NODE=1,
 * macOS still shows a Dock icon because it detects the .app bundle structure
 * before Electron checks the environment variable.
 *
 * Solution: Create a symlink to the Electron binary outside the .app bundle.
 * When the symlink is not inside a .app bundle, macOS doesn't register it
 * as a GUI application and no Dock icon appears.
 *
 * Why symlink instead of copy?
 * - The Electron binary depends on Electron Framework.framework via @rpath
 * - Copying just the binary breaks the framework loading
 * - Symlinks preserve the framework resolution because the real binary is still in .app
 *
 * This is a novel solution discovered while building Halo - most Electron apps
 * that spawn child processes suffer from this Dock icon flashing issue.
 */
export function getHeadlessElectronPath(): string {
  // Return cached path if already set up
  if (headlessElectronPath && existsSync(headlessElectronPath)) {
    return headlessElectronPath
  }

  const electronPath = process.execPath

  // On non-macOS platforms or if not inside .app bundle, use original path
  if (process.platform !== 'darwin' || !electronPath.includes('.app/')) {
    headlessElectronPath = electronPath
    console.log('[Agent] Using original Electron path (not macOS or not .app bundle):', headlessElectronPath)
    return headlessElectronPath
  }

  // macOS: Create symlink to Electron binary outside .app bundle to prevent Dock icon
  try {
    // Use app's userData path for the symlink (persistent across sessions)
    const userDataPath = app.getPath('userData')
    const headlessDir = join(userDataPath, 'headless-electron')
    const headlessSymlinkPath = join(headlessDir, 'electron-node')

    // Create directory if needed
    if (!existsSync(headlessDir)) {
      mkdirSync(headlessDir, { recursive: true })
    }

    // Check if symlink exists and points to correct target
    let needsSymlink = true

    if (existsSync(headlessSymlinkPath)) {
      try {
        const stat = lstatSync(headlessSymlinkPath)
        if (stat.isSymbolicLink()) {
          const currentTarget = readlinkSync(headlessSymlinkPath)
          if (currentTarget === electronPath) {
            needsSymlink = false
          } else {
            // Symlink exists but points to wrong target, remove it
            console.log('[Agent] Symlink target changed, recreating...')
            unlinkSync(headlessSymlinkPath)
          }
        } else {
          // Not a symlink (maybe old copy), remove it
          console.log('[Agent] Removing old non-symlink file...')
          unlinkSync(headlessSymlinkPath)
        }
      } catch {
        // If we can't read it, try to remove and recreate
        try {
          unlinkSync(headlessSymlinkPath)
        } catch { /* ignore */ }
      }
    }

    if (needsSymlink) {
      console.log('[Agent] Creating symlink for headless Electron mode...')
      console.log('[Agent] Target:', electronPath)
      console.log('[Agent] Symlink:', headlessSymlinkPath)

      symlinkSync(electronPath, headlessSymlinkPath)

      console.log('[Agent] Symlink created successfully')
    }

    headlessElectronPath = headlessSymlinkPath
    console.log('[Agent] Using headless Electron symlink:', headlessElectronPath)
    return headlessElectronPath
  } catch (error) {
    // Fallback to original path if symlink fails
    console.error('[Agent] Failed to set up headless Electron symlink, falling back to original:', error)
    headlessElectronPath = electronPath
    return headlessElectronPath
  }
}

// ============================================
// Working Directory Management
// ============================================

/**
 * Get working directory for a space
 */
export function getWorkingDir(spaceId: string): string {
  console.log(`[Agent] getWorkingDir called with spaceId: ${spaceId}`)

  // Ralph mode uses special spaceId, actual working dir is set via ralphMode.projectDir
  // Return temp path as fallback (will be overridden by ralphMode.projectDir in send-message.ts)
  if (spaceId === '__ralph__') {
    console.log(`[Agent] Ralph mode detected, returning temp path (will be overridden by projectDir)`)
    return getTempSpacePath()
  }

  if (spaceId === 'halo-temp') {
    const artifactsDir = join(getTempSpacePath(), 'artifacts')
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true })
    }
    console.log(`[Agent] Using temp space artifacts dir: ${artifactsDir}`)
    return artifactsDir
  }

  const space = getSpace(spaceId)
  console.log(`[Agent] getSpace result:`, space ? { id: space.id, name: space.name, path: space.path } : null)

  if (space) {
    console.log(`[Agent] Using space path: ${space.path}`)
    return space.path
  }

  console.log(`[Agent] WARNING: Space not found, falling back to temp path`)
  return getTempSpacePath()
}

// ============================================
// API Credentials
// ============================================

/**
 * Get API credentials based on current aiSources configuration
 * This is the central place that determines which API to use
 * Now uses AISourceManager for unified access
 */
export async function getApiCredentials(config: ReturnType<typeof getConfig>): Promise<ApiCredentials> {
  const manager = getAISourceManager()
  await manager.ensureInitialized()

  // Debug logging
  console.log('[AgentService] getApiCredentials called')

  // Ensure token is valid for OAuth providers
  const aiSources = (config as any).aiSources
  const currentSource = aiSources?.current || 'custom'

  // Get current source config to determine if it's OAuth or custom API
  const currentConfig = aiSources?.[currentSource]
  // OAuth providers have 'loggedIn' field, custom API providers have 'apiKey' but no 'loggedIn'
  const isOAuthProvider = currentConfig && typeof currentConfig === 'object' && 'loggedIn' in currentConfig

  console.log('[AgentService] currentSource:', currentSource)
  console.log('[AgentService] isOAuthProvider:', isOAuthProvider)
  console.log('[AgentService] aiSources:', JSON.stringify({
    current: aiSources?.current,
    hasCustom: !!aiSources?.custom?.apiKey,
    currentHasApiKey: currentConfig && 'apiKey' in currentConfig
  }, null, 2))

  // Only check OAuth token for actual OAuth providers (has 'loggedIn' field)
  let oauthTokenValid = true
  if (isOAuthProvider) {
    console.log('[AgentService] Checking OAuth token validity for:', currentSource)

    // For SkillsFan Credits: distinguish between not logged in vs token expired
    if (currentSource === 'skillsfan-credits') {
      const isLoggedIn = currentConfig?.loggedIn === true
      if (!isLoggedIn) {
        throw new Error('Please login to use SkillsFan Credits.')
      }
    }

    const tokenResult = await manager.ensureValidToken(currentSource)
    console.log('[AgentService] Token check result:', tokenResult.success)
    if (!tokenResult.success) {
      oauthTokenValid = false
      // Don't throw immediately - manager.getBackendConfig() may fall back to custom API
      console.log('[AgentService] OAuth token invalid, will try fallback in getBackendConfig')
    }
  }

  // Get backend config from manager (handles OAuth → custom API fallback)
  console.log('[AgentService] Calling manager.getBackendConfig()')
  const backendConfig = manager.getBackendConfig()
  console.log('[AgentService] backendConfig:', backendConfig ? { url: backendConfig.url, model: backendConfig.model, hasKey: !!backendConfig.key } : null)

  if (!backendConfig) {
    // No config available and no fallback - give specific error
    if (isOAuthProvider && !oauthTokenValid) {
      if (currentSource === 'skillsfan-credits') {
        throw new Error('Login session expired. Please login again.')
      }
      throw new Error('OAuth token expired or invalid. Please login again.')
    }
    throw new Error('No AI source configured. Please configure an API key or login.')
  }

  // Determine provider type based on whether we're using OAuth or custom API (including fallback)
  let provider: 'anthropic' | 'openai' | 'oauth'

  if (isOAuthProvider && oauthTokenValid) {
    provider = 'oauth'
    console.log(`[Agent] Using OAuth provider ${currentSource} via AISourceManager`)
  } else {
    // Custom API (either direct or fallback from OAuth provider)
    // Find the actual config that provided the backend config
    const effectiveConfig = currentConfig?.apiKey ? currentConfig : null
    const providerType = effectiveConfig?.provider || aiSources?.custom?.provider
    provider = providerType === 'openai' ? 'openai' : 'anthropic'
    console.log(`[Agent] Using custom API (${provider}) for source ${currentSource} via AISourceManager`)
  }

  return {
    baseUrl: backendConfig.url,
    apiKey: backendConfig.key,
    model: backendConfig.model || 'claude-opus-4-5-20251101',
    provider,
    customHeaders: backendConfig.headers,
    apiType: backendConfig.apiType
  }
}

/**
 * Infer OpenAI wire API type from URL or environment
 */
export function inferOpenAIWireApi(apiUrl: string): 'responses' | 'chat_completions' {
  // 1. Check environment variable override
  const envApiType = process.env.HALO_OPENAI_API_TYPE || process.env.HALO_OPENAI_WIRE_API
  if (envApiType) {
    const v = envApiType.toLowerCase()
    if (v.includes('response')) return 'responses'
    if (v.includes('chat')) return 'chat_completions'
  }
  // 2. Infer from URL
  if (apiUrl) {
    if (apiUrl.includes('/chat/completions') || apiUrl.includes('/chat_completions')) return 'chat_completions'
    if (apiUrl.includes('/responses')) return 'responses'
  }
  // 3. Default to chat_completions (most common for third-party providers)
  return 'chat_completions'
}

// ============================================
// MCP Server Filtering
// ============================================

/**
 * Filter out disabled MCP servers before passing to SDK
 */
export function getEnabledMcpServers(mcpServers: Record<string, any>): Record<string, any> | null {
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return null
  }

  const enabled: Record<string, any> = {}
  for (const [name, config] of Object.entries(mcpServers)) {
    if (!config.disabled) {
      // Remove the 'disabled' field before passing to SDK (it's a Halo extension)
      const { disabled, ...sdkConfig } = config as any
      enabled[name] = sdkConfig
    }
  }

  return Object.keys(enabled).length > 0 ? enabled : null
}

// ============================================
// System Prompt
// ============================================

/**
 * Build system prompt append - minimal context, preserve Claude Code's native behavior
 * @param workDir - Current working directory
 * @param modelInfo - The actual model being used (user-configured, may differ from SDK's internal model)
 */
export function buildSystemPromptAppend(
  workDir: string,
  modelInfo?: string,
  memoryEnabled?: boolean
): string {
  const modelLine = modelInfo ? `You are powered by ${modelInfo}.` : ''

  // Read or auto-create MEMORY.md (long-term memory)
  // Skip temp space (artifacts dir) - only for real workspaces
  // Skip if memory is explicitly disabled via config
  let memorySection = ''
  const memoryPath = join(workDir, 'MEMORY.md')
  const isTempSpace = workDir.includes('/artifacts') && workDir.includes('skillsfan')
  const shouldInjectMemory = memoryEnabled !== false

  if (!isTempSpace && shouldInjectMemory) {
    // Auto-create MEMORY.md with default template if it doesn't exist
    if (!existsSync(memoryPath)) {
      try {
        const template = `# Project Memory\n\n> This file is automatically loaded into every conversation.\n> AI will update it with important decisions, patterns, and context.\n> Keep it concise (under 200 lines). Use memory/*.md for detailed notes.\n`
        writeFileSync(memoryPath, template, 'utf-8')
        console.log(`[Agent] MEMORY.md auto-created at ${memoryPath}`)
      } catch (e) {
        console.error('[Agent] Failed to auto-create MEMORY.md:', e)
      }
    }

    // Read and inject into system prompt
    if (existsSync(memoryPath)) {
      try {
        const raw = readFileSync(memoryPath, 'utf-8')
        const lines = raw.split('\n')
        const content = lines.slice(0, 200).join('\n')
        const truncated = lines.length > 200 ? '\n[... truncated, use Read tool for full file]' : ''
        memorySection = `

## Project Memory

<project_memory>
${content}${truncated}
</project_memory>

### Memory Guidelines
- **MEMORY.md** (long-term): Stable knowledge auto-loaded above. Update with key decisions, patterns, preferences.
- **memory/*.md** (short-term): Topic or daily notes (e.g. memory/${new Date().toISOString().slice(0, 10)}.md). Create as needed. Search with Grep.
- Save important context proactively, especially when conversation grows long.
- Keep MEMORY.md under 200 lines. Move details to memory/ topic files.
`
        console.log(`[Agent] MEMORY.md loaded (${lines.length} lines${lines.length > 200 ? ', truncated to 200' : ''})`)
      } catch (e) {
        console.error('[Agent] Failed to read MEMORY.md:', e)
      }
    }
  }

  return `
You are SkillsFan (技能范), an AI assistant that helps users accomplish real work.
${modelLine}
All created files will be saved in the user's workspace. Current workspace: ${workDir}.
${memorySection}
## 任务规划工具

你有两个关键的任务管理工具，根据场景灵活使用：

### TodoWrite — 进度追踪器

用 TodoWrite 创建可视化任务列表，让用户看到你的计划和进度。适合：
- 多步骤工作流（创建 → 评估 → 优化）
- 需要向用户展示进度的复杂任务
- 任务需要调用 Skill 时，在描述中标注 [Skill: skill-name]

每完成一个任务立即更新状态（in_progress → completed）。

### Task — 并行子代理

用 Task 启动独立的子代理并行工作。适合：
- 多个独立的搜索/分析任务可以同时进行
- 需要不同视角审查同一个问题
- 希望加速互不依赖的工作

### 组合使用

TodoWrite 和 Task 可以组合：先用 TodoWrite 展示整体计划，再用 Task 并行执行其中的独立任务。

### Skill 调用

如果任务匹配某个可用的 Skill，优先调用 Skill 工具加载专业指令。
`
}

// ============================================
// Renderer Communication
// ============================================

// Current main window reference
let currentMainWindow: MainWindowRef = null

/**
 * Set the current main window reference
 */
export function setMainWindow(window: MainWindowRef): void {
  currentMainWindow = window
}

/**
 * Get the current main window reference
 */
export function getMainWindow(): MainWindowRef {
  return currentMainWindow
}

/**
 * Send event to renderer with session identifiers
 * Also broadcasts to WebSocket for remote clients
 */
export function sendToRenderer(
  channel: string,
  spaceId: string,
  conversationId: string,
  data: Record<string, unknown>
): void {
  // Always include spaceId and conversationId in event data
  const eventData = { ...data, spaceId, conversationId }

  // 1. Send to Electron renderer via IPC
  if (currentMainWindow && !currentMainWindow.isDestroyed()) {
    currentMainWindow.webContents.send(channel, eventData)
    console.log(`[Agent] Sent to renderer: ${channel}`, JSON.stringify(eventData).substring(0, 200))
  }

  // 2. Broadcast to remote WebSocket clients
  try {
    broadcastToWebSocket(channel, eventData)
  } catch (error) {
    // WebSocket module might not be initialized yet, ignore
  }
}

/**
 * Broadcast event to all clients (global event, not conversation-scoped)
 */
export function broadcastToAllClients(channel: string, data: Record<string, unknown>): void {
  // 1. Send to Electron renderer via IPC (global event)
  if (currentMainWindow && !currentMainWindow.isDestroyed()) {
    currentMainWindow.webContents.send(channel, data)
  }

  // 2. Broadcast to remote WebSocket clients
  try {
    broadcastToAll(channel, data)
  } catch (error) {
    // WebSocket module might not be initialized yet, ignore
  }
}
