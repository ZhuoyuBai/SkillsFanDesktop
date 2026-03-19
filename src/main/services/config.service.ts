/**
 * Config Service - Manages application configuration
 */

import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { chmodSync, existsSync, mkdirSync } from 'fs'
import { chmod as chmodAsync } from 'fs/promises'
import { EventEmitter } from 'events'
import { atomicWriteJsonSync, atomicWriteJson, safeReadJsonSync, safeReadJson, cleanupTmpFiles } from '../utils/atomic-write'
import {
  getFallbackVisibleAiSource,
  isAiSourceHiddenByProductFeatures,
  isSkillsFanHostedAiEnabled
} from './ai-sources/hosted-ai-availability'

// Import analytics config type
import type { AnalyticsConfig } from './analytics/types'
import type { AISourcesConfig, CustomSourceConfig } from '../../shared/types'

// ============================================================================
// Config Change Notification (EventEmitter Pattern)
// ============================================================================
// When config changes, subscribers are notified via EventEmitter.
// This keeps config.service decoupled from downstream services.
// ============================================================================

type ApiConfigChangeHandler = () => void
type MemoryConfigChangeHandler = (enabled: boolean, retentionDays: number) => void

const CONFIG_EVENTS = {
  apiConfigChanged: 'api-config-changed',
  memoryConfigChanged: 'memory-config-changed'
} as const

const configEvents = new EventEmitter()
configEvents.setMaxListeners(50)

function emitConfigEventSafely(event: string, ...args: unknown[]): void {
  const listeners = configEvents.listeners(event)
  for (const listener of listeners) {
    try {
      (listener as (...eventArgs: unknown[]) => void)(...args)
    } catch (e) {
      console.error(`[Config] Error in ${event} handler:`, e)
    }
  }
}

/**
 * Register a callback to be notified when API config changes.
 * Used by agent.service to invalidate sessions on config change.
 *
 * @returns Unsubscribe function
 */
export function onApiConfigChange(handler: ApiConfigChangeHandler): () => void {
  configEvents.on(CONFIG_EVENTS.apiConfigChanged, handler)
  return () => {
    configEvents.off(CONFIG_EVENTS.apiConfigChanged, handler)
  }
}

/**
 * Register a callback to be notified when memory config changes.
 * Used by MemoryIndexManager to update its cached config.
 *
 * @returns Unsubscribe function
 */
export function onMemoryConfigChange(handler: MemoryConfigChangeHandler): () => void {
  configEvents.on(CONFIG_EVENTS.memoryConfigChanged, handler)
  return () => {
    configEvents.off(CONFIG_EVENTS.memoryConfigChanged, handler)
  }
}

// Types (shared with renderer)
interface HaloConfig {
  api: {
    provider: 'anthropic' | 'openai' | 'custom'
    apiKey: string
    apiUrl: string
    model: string
  }
  // Multi-source AI configuration (OAuth + Custom API)
  aiSources?: AISourcesConfig
  permissions: {
    fileAccess: 'allow' | 'ask' | 'deny'
    commandExecution: 'allow' | 'ask' | 'deny'
    networkAccess: 'allow' | 'ask' | 'deny'
    trustMode: boolean
  }
  appearance: {
    theme: 'light' | 'dark' | 'system'
  }
  system: {
    autoLaunch: boolean
    minimizeToTray: boolean
  }
  remoteAccess: {
    enabled: boolean
    port: number
  }
  onboarding: {
    completed: boolean
  }
  // MCP servers configuration (compatible with Cursor / Claude Desktop format)
  mcpServers: Record<string, McpServerConfig>
  isFirstLaunch: boolean
  // Analytics configuration (auto-generated on first launch)
  analytics?: AnalyticsConfig
  // Git Bash configuration (Windows only)
  gitBash?: {
    installed: boolean
    path: string | null
    skipped: boolean
  }
  // Spaces configuration (default space settings)
  spaces?: {
    defaultSpaceId: string | null  // null = Halo space
  }
  // Memory configuration (cross-conversation memory)
  memory?: {
    enabled: boolean        // Master toggle, default true
    retentionDays: number   // 0 = forever, 7/30/180
    semanticSearch?: boolean // Enable vector-based semantic search, default true
  }
  browserAutomation?: {
    mode: 'ai-browser' | 'system-browser'
  }
  // Custom instructions appended to system prompt
  customInstructions?: {
    enabled: boolean
    content: string
  }
  // Conversation compaction settings
  conversation?: {
    autoCompact?: boolean     // Proactive compaction prompts, default true
    compactThreshold?: number // Context usage ratio to trigger (0-1), default 0.75
  }
  // Feishu bot integration (remote control via chat)
  feishu?: {
    enabled: boolean
    appId: string
    appSecret: string
    pairingCode: string
    allowedChatIds: string[]
    defaultSpaceId?: string
    groupPolicy: 'mention' | 'all' | 'disabled'
  }
}

// MCP server configuration types
type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig | McpSseServerConfig

interface McpStdioServerConfig {
  type?: 'stdio'  // Optional, defaults to stdio
  command: string
  args?: string[]
  env?: Record<string, string>
  timeout?: number
  disabled?: boolean  // Halo extension: temporarily disable this server
}

interface McpHttpServerConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
  disabled?: boolean  // Halo extension: temporarily disable this server
}

interface McpSseServerConfig {
  type: 'sse'
  url: string
  headers?: Record<string, string>
  disabled?: boolean  // Halo extension: temporarily disable this server
}

// Paths
// Use os.homedir() instead of app.getPath('home') to respect HOME environment variable
// This is essential for E2E tests to run in isolated test directories
export function getHaloDir(): string {
  // 1. Support custom data directory via environment variable
  //    Useful for development to avoid conflicts with production data
  if (process.env.SKILLSFAN_DATA_DIR) {
    let dir = process.env.SKILLSFAN_DATA_DIR
    // Expand ~ to home directory (shell doesn't expand in env vars)
    if (dir.startsWith('~')) {
      dir = join(homedir(), dir.slice(1))
    }
    return dir
  }

  // 2. Auto-detect development mode: use separate directory
  //    app.isPackaged is false when running via electron-vite dev
  if (!app.isPackaged) {
    return join(homedir(), '.skillsfan-dev')
  }

  // 3. Production: use default directory
  return join(homedir(), '.skillsfan')
}

export function getConfigPath(): string {
  return join(getHaloDir(), 'config.json')
}

export function getTempSpacePath(): string {
  return join(getHaloDir(), 'temp')
}

export function getSpacesDir(): string {
  return join(getHaloDir(), 'spaces')
}

// Default model (GLM-5-Turbo)
const DEFAULT_MODEL = 'GLM-5-Turbo'

// Default configuration
const DEFAULT_CONFIG: HaloConfig = {
  api: {
    provider: 'anthropic',
    apiKey: '',
    apiUrl: 'https://api.anthropic.com',
    model: DEFAULT_MODEL
  },
  aiSources: {
    current: 'glm'
  },
  permissions: {
    fileAccess: 'allow',
    commandExecution: 'ask',
    networkAccess: 'allow',
    trustMode: false
  },
  appearance: {
    theme: 'light'
  },
  system: {
    autoLaunch: false,
    minimizeToTray: false
  },
  remoteAccess: {
    enabled: false,
    port: 3456
  },
  browserAutomation: {
    mode: 'ai-browser'
  },
  onboarding: {
    completed: false
  },
  mcpServers: {},  // Empty by default
  isFirstLaunch: true,
  spaces: {
    defaultSpaceId: null  // null = Halo space
  },
  memory: {
    enabled: true,
    retentionDays: 0  // 0 = forever
  },
  customInstructions: {
    enabled: false,
    content: ''
  }
}

// Active space tracker (in-memory, not persisted)
// Used by remote channels (Feishu) to create conversations in the user's current space
let activeSpaceId: string = 'skillsfan-temp'

export function setActiveSpaceId(spaceId: string): void {
  activeSpaceId = spaceId
}

export function getActiveSpaceId(): string {
  return activeSpaceId
}

const CONFIG_FILE_MODE = 0o600

function ensureConfigFilePermissions(configPath: string): void {
  if (process.platform === 'win32') return

  try {
    chmodSync(configPath, CONFIG_FILE_MODE)
  } catch (error) {
    console.warn('[Config] Failed to set config file permissions:', error)
  }
}

async function ensureConfigFilePermissionsAsync(configPath: string): Promise<void> {
  if (process.platform === 'win32') return

  try {
    await chmodAsync(configPath, CONFIG_FILE_MODE)
  } catch (error) {
    console.warn('[Config] Failed to set config file permissions (async):', error)
  }
}

function normalizeAiSources(parsed: Record<string, any>): AISourcesConfig {
  const raw = parsed?.aiSources
  const aiSources: AISourcesConfig = {
    ...(raw && typeof raw === 'object' ? raw : {})
  }

  if (!aiSources.current) {
    aiSources.current = isSkillsFanHostedAiEnabled() ? 'glm' : 'custom'
  }

  const legacyApi = parsed?.api
  const hasLegacyApi =
    typeof legacyApi?.apiKey === 'string' && legacyApi.apiKey.length > 0
  const hasNamedProviderConfigs = Object.keys(aiSources).some((key) => {
    if (key === 'current' || key === 'custom' || key === 'oauth') return false
    const source = aiSources[key]
    if (!source || typeof source !== 'object') return false

    if ('loggedIn' in source) {
      return Boolean(source.loggedIn)
    }

    if ('apiKey' in source) {
      return Boolean(source.apiKey)
    }

    return false
  })
  const shouldPromoteLegacyApiToCustom =
    !aiSources.custom &&
    hasLegacyApi &&
    (aiSources.current === 'custom' || !hasNamedProviderConfigs)

  if (shouldPromoteLegacyApiToCustom) {
    const provider = legacyApi?.provider === 'openai' ? 'openai' : 'anthropic'
    aiSources.custom = {
      provider,
      apiKey: legacyApi?.apiKey || '',
      apiUrl: legacyApi?.apiUrl || (provider === 'openai' ? 'https://api.openai.com' : 'https://api.anthropic.com'),
      model: legacyApi?.model || DEFAULT_MODEL
    } as CustomSourceConfig
  }

  if (aiSources.custom) {
    const provider = aiSources.custom.provider === 'openai' ? 'openai' : 'anthropic'
    aiSources.custom = {
      provider,
      apiKey: aiSources.custom.apiKey || '',
      apiUrl: aiSources.custom.apiUrl || (provider === 'openai' ? 'https://api.openai.com' : 'https://api.anthropic.com'),
      model: aiSources.custom.model || DEFAULT_MODEL
    }
  }

  if (aiSources.custom && aiSources.current !== 'custom') {
    const custom = aiSources.custom
    const duplicatedNamedProvider = Object.keys(aiSources).some((key) => {
      if (key === 'current' || key === 'custom' || key === 'oauth') return false
      const source = aiSources[key]
      if (!source || typeof source !== 'object' || !('apiKey' in source)) return false

      const normalizedProvider = source.provider === 'openai' ? 'openai' : 'anthropic'
      return (
        normalizedProvider === custom.provider &&
        (source.apiKey || '') === custom.apiKey &&
        (source.apiUrl || '') === custom.apiUrl &&
        (source.model || '') === custom.model
      )
    })

    if (duplicatedNamedProvider) {
      delete aiSources.custom
    }
  }

  if (isAiSourceHiddenByProductFeatures(aiSources.current)) {
    aiSources.current = getFallbackVisibleAiSource(aiSources)
  }

  // Migrate single custom API configs to configs[] array format
  for (const key of Object.keys(aiSources)) {
    if (key === 'current' || key === 'custom' || key === 'oauth') continue
    const source = aiSources[key]
    if (!source || typeof source !== 'object') continue
    if ('loggedIn' in source) continue // Skip OAuth providers
    if (!('apiKey' in source) || !(source as any).apiKey) continue
    const custom = source as CustomSourceConfig
    if (custom.configs && custom.configs.length > 0) continue // Already migrated
    // Create configs array from top-level fields
    custom.configs = [{
      provider: custom.provider,
      apiKey: custom.apiKey,
      apiUrl: custom.apiUrl,
      model: custom.model,
      label: custom.model || undefined
    }]
    custom.activeConfigIndex = 0
  }

  return aiSources
}

function getAiSourcesSignature(aiSources?: AISourcesConfig): string {
  if (!aiSources) return ''
  const current = aiSources.current || 'custom'

  // Model is included in signature: for non-Anthropic providers (OAuth, custom API),
  // the model is encoded inside ANTHROPIC_API_KEY via encodeBackendConfig().
  // setModel() only sets a fake Claude model, so actual model changes require session rebuild.

  // Get config for current source (could be provider ID like 'zhipu', 'deepseek', etc.)
  const currentConfig = aiSources[current] as Record<string, any> | undefined

  if (currentConfig && typeof currentConfig === 'object') {
    // Check if it's an OAuth config (has accessToken)
    if ('accessToken' in currentConfig) {
      return [
        'oauth',
        current,
        currentConfig.accessToken || '',
        currentConfig.refreshToken || '',
        currentConfig.tokenExpires || '',
        currentConfig.model || ''
      ].join('|')
    }

    // Custom API config (has apiKey) - includes provider IDs like 'zhipu', 'deepseek', etc.
    if ('apiKey' in currentConfig) {
      return [
        'custom',
        current,
        currentConfig.provider || '',
        currentConfig.apiUrl || '',
        currentConfig.apiKey || '',
        currentConfig.model || ''
      ].join('|')
    }
  }

  // Fallback to legacy custom field
  if (current === 'custom' || !currentConfig) {
    const custom = aiSources.custom
    return [
      'custom',
      custom?.provider || '',
      custom?.apiUrl || '',
      custom?.apiKey || '',
      custom?.model || ''
    ].join('|')
  }

  return current
}

function mergeConfigWithDefaults(parsed: Record<string, any>): HaloConfig {
  const aiSources = normalizeAiSources(parsed)
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    api: { ...DEFAULT_CONFIG.api, ...parsed.api },
    aiSources,
    permissions: { ...DEFAULT_CONFIG.permissions, ...parsed.permissions },
    appearance: { ...DEFAULT_CONFIG.appearance, ...parsed.appearance },
    system: { ...DEFAULT_CONFIG.system, ...parsed.system },
    onboarding: { ...DEFAULT_CONFIG.onboarding, ...parsed.onboarding },
    // mcpServers is a flat map, just use parsed value or default
    mcpServers: parsed.mcpServers || DEFAULT_CONFIG.mcpServers,
    // analytics: keep as-is (managed by analytics.service.ts)
    analytics: parsed.analytics,
    // spaces: merge with defaults
    spaces: { ...DEFAULT_CONFIG.spaces, ...parsed.spaces },
    // memory: merge with defaults
    memory: { ...DEFAULT_CONFIG.memory, ...parsed.memory },
    browserAutomation: { ...DEFAULT_CONFIG.browserAutomation, ...parsed.browserAutomation }
  }
}

function applyConfigUpdates(currentConfig: HaloConfig, config: Partial<HaloConfig>): HaloConfig {
  const newConfig = { ...currentConfig, ...config }

  // Deep merge for nested objects
  if (config.api) {
    newConfig.api = { ...currentConfig.api, ...config.api }
  }
  if (config.permissions) {
    newConfig.permissions = { ...currentConfig.permissions, ...config.permissions }
  }
  if (config.appearance) {
    newConfig.appearance = { ...currentConfig.appearance, ...config.appearance }
  }
  if (config.system) {
    newConfig.system = { ...currentConfig.system, ...config.system }
  }
  if (config.onboarding) {
    newConfig.onboarding = { ...currentConfig.onboarding, ...config.onboarding }
  }
  // mcpServers: replace entirely when provided (not merged)
  if (config.mcpServers !== undefined) {
    newConfig.mcpServers = config.mcpServers
  }
  // analytics: replace entirely when provided (managed by analytics.service.ts)
  if (config.analytics !== undefined) {
    newConfig.analytics = config.analytics
  }
  // gitBash: replace entirely when provided (Windows only)
  if ((config as any).gitBash !== undefined) {
    (newConfig as any).gitBash = (config as any).gitBash
  }
  // spaces: merge with current config
  if (config.spaces) {
    newConfig.spaces = { ...currentConfig.spaces, ...config.spaces }
  }
  // memory: merge with current config
  if (config.memory) {
    newConfig.memory = { ...currentConfig.memory, ...config.memory }
  }
  if (config.browserAutomation) {
    newConfig.browserAutomation = { ...currentConfig.browserAutomation, ...config.browserAutomation }
  }

  return newConfig
}

function notifyConfigChange(currentConfig: HaloConfig, newConfig: HaloConfig, updates: Partial<HaloConfig>): void {
  const previousAiSourcesSignature = getAiSourcesSignature(currentConfig.aiSources)
  const nextAiSourcesSignature = getAiSourcesSignature(newConfig.aiSources)
  const aiSourcesChanged = previousAiSourcesSignature !== nextAiSourcesSignature

  if (updates.api || updates.aiSources) {
    const apiChanged =
      !!updates.api &&
      (updates.api.provider !== currentConfig.api.provider ||
        updates.api.apiKey !== currentConfig.api.apiKey ||
        updates.api.apiUrl !== currentConfig.api.apiUrl)

    if ((apiChanged || aiSourcesChanged) && configEvents.listenerCount(CONFIG_EVENTS.apiConfigChanged) > 0) {
      console.log('[Config] API config changed, notifying subscribers...')
      setTimeout(() => {
        emitConfigEventSafely(CONFIG_EVENTS.apiConfigChanged)
      }, 0)
    }
  }

  // Detect memory config changes and notify subscribers
  if (updates.memory && configEvents.listenerCount(CONFIG_EVENTS.memoryConfigChanged) > 0) {
    const memoryChanged =
      updates.memory.enabled !== currentConfig.memory?.enabled ||
      updates.memory.retentionDays !== currentConfig.memory?.retentionDays
    if (memoryChanged) {
      const m = newConfig.memory!
      setTimeout(() => {
        emitConfigEventSafely(CONFIG_EVENTS.memoryConfigChanged, m.enabled, m.retentionDays)
      }, 0)
    }
  }
}

// Initialize app directories
export async function initializeApp(): Promise<void> {
  const haloDir = getHaloDir()
  const tempDir = getTempSpacePath()
  const spacesDir = getSpacesDir()
  const tempArtifactsDir = join(tempDir, 'artifacts')
  const tempConversationsDir = join(tempDir, 'conversations')

  // Create directories if they don't exist
  const dirs = [haloDir, tempDir, spacesDir, tempArtifactsDir, tempConversationsDir]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  // Clean up any residual .tmp files from previous crashes
  cleanupTmpFiles(haloDir)

  // Create default config if it doesn't exist
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    atomicWriteJsonSync(configPath, mergeConfigWithDefaults({}), { backup: true })
  }
  ensureConfigFilePermissions(configPath)
}

// Get configuration
export function getConfig(): HaloConfig {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return mergeConfigWithDefaults({})
  }

  try {
    const parsed = safeReadJsonSync(configPath, null as any)
    if (!parsed) return mergeConfigWithDefaults({})
    return mergeConfigWithDefaults(parsed)
  } catch (error) {
    console.error('Failed to read config:', error)
    return mergeConfigWithDefaults({})
  }
}

// Async config read for non-startup/IPC paths to avoid blocking the main thread.
export async function getConfigAsync(): Promise<HaloConfig> {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return mergeConfigWithDefaults({})
  }

  try {
    const parsed = await safeReadJson(configPath, null as any)
    if (!parsed) return mergeConfigWithDefaults({})
    return mergeConfigWithDefaults(parsed)
  } catch (error) {
    console.error('Failed to read config (async):', error)
    return mergeConfigWithDefaults({})
  }
}

// Save configuration
export function saveConfig(config: Partial<HaloConfig>): HaloConfig {
  const currentConfig = getConfig()
  const newConfig = applyConfigUpdates(currentConfig, config)

  const configPath = getConfigPath()
  atomicWriteJsonSync(configPath, newConfig, { backup: true })
  ensureConfigFilePermissions(configPath)
  notifyConfigChange(currentConfig, newConfig, config)

  return newConfig
}

export async function saveConfigAsync(config: Partial<HaloConfig>): Promise<HaloConfig> {
  const currentConfig = await getConfigAsync()
  const newConfig = applyConfigUpdates(currentConfig, config)
  const configPath = getConfigPath()

  await atomicWriteJson(configPath, newConfig, { backup: true })
  await ensureConfigFilePermissionsAsync(configPath)
  notifyConfigChange(currentConfig, newConfig, config)

  return newConfig
}

// Validate API connection
export async function validateApiConnection(
  apiKey: string,
  apiUrl: string,
  provider: string
): Promise<{ valid: boolean; message?: string; model?: string }> {
  try {
    const trimSlash = (s: string) => s.replace(/\/+$/, '')
    const normalizeOpenAIV1Base = (input: string) => {
      // Accept:
      // - https://host
      // - https://host/v1
      // - https://host/v1/chat/completions
      // - https://host/chat/completions
      let base = trimSlash(input)
      // If user pasted full chat/completions endpoint, strip it
      if (base.endsWith('/chat/completions')) {
        base = base.slice(0, -'/chat/completions'.length)
        base = trimSlash(base)
      }
      // If already contains /v1 anywhere, normalize to ".../v1"
      const v1Idx = base.indexOf('/v1')
      if (v1Idx >= 0) {
        base = base.slice(0, v1Idx + 3) // include "/v1"
        base = trimSlash(base)
        return base
      }
      return `${base}/v1`
    }

    // OpenAI compatible validation: GET /v1/models (does not depend on user-selected model)
    if (provider === 'openai') {
      const baseV1 = normalizeOpenAIV1Base(apiUrl)
      const modelsUrl = `${baseV1}/models`

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })

      if (response.ok) {
        const data: any = await response.json().catch(() => ({}))
        const modelId =
          data?.data?.[0]?.id ||
          data?.model ||
          undefined
        return { valid: true, model: modelId }
      }

      const errorText = await response.text().catch(() => '')
      return {
        valid: false,
        message: errorText || `HTTP ${response.status}`
      }
    }

    // Anthropic compatible validation: POST /v1/messages
    const base = trimSlash(apiUrl)
    const messagesUrl = `${base}/v1/messages`
    const response = await fetch(messagesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    })

    if (response.ok) {
      const data = await response.json()
      return {
        valid: true,
        model: data.model || DEFAULT_MODEL
      }
    } else {
      const error = await response.json().catch(() => ({}))
      return {
        valid: false,
        message: error.error?.message || `HTTP ${response.status}`
      }
    }
  } catch (error: unknown) {
    const err = error as Error
    return {
      valid: false,
      message: err.message || 'Connection failed'
    }
  }
}

/**
 * Set auto launch on system startup
 */
export function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true, // Start minimized
    // On macOS, also set to open at login for all users (requires admin)
    // path: process.execPath, // Optional: specify executable path
  })

  // Save to config
  saveConfig({ system: { autoLaunch: enabled, minimizeToTray: getConfig().system.minimizeToTray } })
  console.log(`[Config] Auto launch set to: ${enabled}`)
}

/**
 * Get current auto launch status
 */
export function getAutoLaunch(): boolean {
  const settings = app.getLoginItemSettings()
  return settings.openAtLogin
}

/**
 * Set minimize to tray behavior
 */
export function setMinimizeToTray(enabled: boolean): void {
  saveConfig({ system: { autoLaunch: getConfig().system.autoLaunch, minimizeToTray: enabled } })
  console.log(`[Config] Minimize to tray set to: ${enabled}`)
}

/**
 * Get minimize to tray setting
 */
export function getMinimizeToTray(): boolean {
  return getConfig().system.minimizeToTray
}
