/**
 * Agent Module - Session Manager
 *
 * Manages V2 Session lifecycle including creation, reuse, cleanup,
 * and invalidation on config changes.
 *
 * V2 Session enables process reuse: subsequent messages in the same conversation
 * reuse the running CC process, avoiding process restart each time (cold start ~3-5s).
 */

import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk'
import { getConfig, onApiConfigChange } from '../config.service'
import { getConversation } from '../conversation.service'
import { ensureSkillsInitialized, hasSkills } from '../skill'
import { clearCompactionState, clearAllCompactionStates } from './compaction-monitor'
import type {
  V2SDKSession,
  V2SessionInfo,
  SessionConfig,
  SessionState,
  Thought
} from './types'
import {
  getHeadlessElectronPath,
  getWorkingDir,
  getApiCredentials
} from './helpers'
import { buildSdkOptions, resolveSdkTransport } from './sdk-options'
import { isUsageLimitActive } from '../../openai-compat-router/server/request-handler'

// ============================================
// Session Maps
// ============================================

/**
 * Active sessions map: conversationId -> SessionState
 * Tracks in-flight requests with abort controllers and accumulated thoughts
 */
export const activeSessions = new Map<string, SessionState>()

/**
 * V2 Sessions map: conversationId -> V2SessionInfo
 * Persistent sessions that can be reused across multiple messages
 */
export const v2Sessions = new Map<string, V2SessionInfo>()

/**
 * Sessions that should be invalidated after current in-flight request finishes
 * (e.g., model switch during streaming).
 */
const pendingInvalidations = new Set<string>()

// ============================================
// Session Cleanup
// ============================================

// Session cleanup interval (clean up sessions not used for 30 minutes)
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
let cleanupIntervalId: NodeJS.Timeout | null = null

/**
 * Start the session cleanup interval
 */
function startSessionCleanup(): void {
  if (cleanupIntervalId) return

  cleanupIntervalId = setInterval(() => {
    const now = Date.now()
    // Avoid TS downlevelIteration requirement (main process tsconfig doesn't force target=es2015)
    for (const [convId, info] of Array.from(v2Sessions.entries())) {
      if (now - info.lastUsedAt > SESSION_IDLE_TIMEOUT_MS) {
        console.log(`[Agent] Cleaning up idle V2 session: ${convId}`)
        try {
          info.session.close()
        } catch (e) {
          console.error(`[Agent] Error closing session ${convId}:`, e)
        }
        v2Sessions.delete(convId)
      }
    }
  }, 60 * 1000) // Check every minute
}

/**
 * Stop the session cleanup interval
 */
export function stopSessionCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }
}

// ============================================
// Session Config Comparison
// ============================================

/**
 * Check if session config requires rebuild
 * Only "process-level" params need rebuild; runtime params use setXxx() methods
 */
export function needsSessionRebuild(existing: V2SessionInfo, newConfig: SessionConfig): boolean {
  return existing.config.aiBrowserEnabled !== newConfig.aiBrowserEnabled
    || existing.config.hasSkills !== newConfig.hasSkills
    || existing.config.browserAutomationMode !== newConfig.browserAutomationMode
    || existing.config.customInstructionsHash !== newConfig.customInstructionsHash
    || existing.config.extensionHash !== newConfig.extensionHash
}

/**
 * Close and remove an existing V2 session (internal helper for rebuild)
 */
function closeV2SessionForRebuild(conversationId: string): void {
  const existing = v2Sessions.get(conversationId)
  if (existing) {
    console.log(`[Agent][${conversationId}] Closing V2 session for rebuild`)
    try {
      existing.session.close()
    } catch (e) {
      console.error(`[Agent][${conversationId}] Error closing session:`, e)
    }
    v2Sessions.delete(conversationId)
  }
}

// ============================================
// Session Creation
// ============================================

/**
 * Get or create V2 Session
 *
 * V2 Session enables process reuse: subsequent messages in the same conversation
 * reuse the running CC process, avoiding process restart each time (cold start ~3-5s).
 *
 * Note: Requires SDK patch for full parameter pass-through.
 * When sessionId is provided, CC restores conversation history from disk.
 *
 * @param spaceId - Space ID
 * @param conversationId - Conversation ID
 * @param sdkOptions - SDK options for session creation
 * @param sessionId - Optional session ID for resumption
 * @param config - Session configuration for rebuild detection
 */
export async function getOrCreateV2Session(
  spaceId: string,
  conversationId: string,
  sdkOptions: Record<string, any>,
  sessionId?: string,
  config?: SessionConfig
): Promise<V2SessionInfo['session']> {
  // Check if we have an existing session for this conversation
  const existing = v2Sessions.get(conversationId)
  if (existing) {
    // Check if config changed and requires rebuild
    if (config && needsSessionRebuild(existing, config)) {
      console.log(`[Agent][${conversationId}] Config changed (aiBrowser: ${existing.config.aiBrowserEnabled} → ${config.aiBrowserEnabled}, browserMode: ${existing.config.browserAutomationMode || 'ai-browser'} → ${config.browserAutomationMode || 'ai-browser'}), rebuilding session...`)
      closeV2SessionForRebuild(conversationId)
      // Fall through to create new session
    } else {
      console.log(`[Agent][${conversationId}] Reusing existing V2 session`)
      existing.lastUsedAt = Date.now()
      return existing.session
    }
  }

  // Create new session
  // If sessionId exists, pass resume to let CC restore history from disk
  // After first message, the process stays alive and maintains context in memory
  console.log(`[Agent][${conversationId}] Creating new V2 session...`)
  if (sessionId) {
    console.log(`[Agent][${conversationId}] With resume: ${sessionId}`)
  }
  const startTime = Date.now()

  // Requires SDK patch: resume parameter lets CC restore history from disk
  // Native SDK V2 Session doesn't support resume parameter
  if (sessionId) {
    sdkOptions.resume = sessionId
  }
  // Requires SDK patch: native SDK ignores most sdkOptions parameters
  // Use 'as any' to bypass type check, actual params handled by patched SDK
  const session = (await unstable_v2_createSession(sdkOptions as any)) as unknown as V2SDKSession

  console.log(`[Agent][${conversationId}] V2 session created in ${Date.now() - startTime}ms`)

  // Store session with config
  v2Sessions.set(conversationId, {
    session,
    spaceId,
    conversationId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    config: config || { aiBrowserEnabled: false, hasSkills: false }
  })

  // Start cleanup if not already running
  startSessionCleanup()

  return session
}

// ============================================
// Session Warm-up
// ============================================

/**
 * Warm up V2 Session (called when user switches conversations)
 *
 * Pre-initialize or reuse V2 Session to avoid delay when sending messages.
 * Frontend calls this when user clicks a conversation, no need to wait for completion.
 *
 * Flow:
 * 1. User clicks conversation A → frontend immediately calls ensureSessionWarm()
 * 2. V2 Session initializes in background (non-blocking UI)
 * 3. User finishes typing and sends → V2 Session ready, send directly (fast)
 *
 * Important: Parameters must be identical to sendMessage for session reliability
 */
export async function ensureSessionWarm(
  spaceId: string,
  conversationId: string
): Promise<void> {
  // Skip warm-up if provider is currently rate-limited (usage limit reached)
  if (isUsageLimitActive()) {
    console.log(`[Agent] Skipping session warm-up: provider usage limit active`)
    return
  }

  const config = getConfig()
  const workDir = getWorkingDir(spaceId)
  const conversation = getConversation(spaceId, conversationId)
  const sessionId = conversation?.sessionId
  const electronPath = getHeadlessElectronPath()

  // Create abortController - consistent with sendMessage
  const abortController = new AbortController()

  // Get API credentials based on current aiSources configuration
  const credentials = await getApiCredentials(config)
  console.log(`[Agent] Session warm using: ${credentials.provider}, model: ${credentials.model}`)

  const transport = await resolveSdkTransport(credentials)
  const anthropicBaseUrl = transport.anthropicBaseUrl
  const anthropicApiKey = transport.anthropicApiKey
  const sdkModel = transport.sdkModel
  if (transport.routed) {
    console.log(`[Agent] ${credentials.provider} provider enabled (warm): routing via ${anthropicBaseUrl}, apiType=${transport.apiType}`)
  }

  await ensureSkillsInitialized()
  const skillsAvailable = hasSkills()

  const { sdkOptions, addedMcpServers } = await buildSdkOptions({
    conversationId,
    spaceId,
    workDir,
    config: config as Record<string, any>,
    abortController,
    sdkModel,
    credentialsModel: credentials.model,
    anthropicBaseUrl,
    anthropicApiKey,
    electronPath,
    onStderr: (data: string) => {
      console.error(`[Agent][${conversationId}] CLI stderr (warm):`, data)
    },
    includeSkillMcp: skillsAvailable,
    routed: transport.routed
  })

  if (addedMcpServers.includes('skill')) {
    console.log(`[Agent] Skill MCP server added for warm-up: ${conversationId}`)
  }

  try {
    console.log(`[Agent] Warming up V2 session: ${conversationId}`)

    // Session config must match sendMessage to avoid rebuild
    const ci = (config as any).customInstructions
    const { getExtensionHash } = await import('../extension')
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: false,  // Default to false for warm-up (user hasn't enabled it yet)
      hasSkills: skillsAvailable,
      browserAutomationMode: (config as any).browserAutomation?.mode === 'system-browser' ? 'system-browser' : 'ai-browser',
      customInstructionsHash: ci?.enabled && ci?.content ? ci.content : undefined,
      extensionHash: getExtensionHash()
    }

    await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig)
    console.log(`[Agent] V2 session warmed up: ${conversationId}, hasSkills: ${skillsAvailable}`)
  } catch (error) {
    console.error(`[Agent] Failed to warm up session ${conversationId}:`, error)
    // Don't throw on warm-up failure, sendMessage() will reinitialize (just slower)
  }
}

// ============================================
// Session Lifecycle
// ============================================

/**
 * Close V2 session for a conversation
 */
export function closeV2Session(conversationId: string): void {
  const info = v2Sessions.get(conversationId)
  if (info) {
    console.log(`[Agent][${conversationId}] Closing V2 session`)
    try {
      info.session.close()
    } catch (e) {
      console.error(`[Agent] Error closing session:`, e)
    }
    v2Sessions.delete(conversationId)
    clearCompactionState(conversationId)
  }
}

/**
 * Close all V2 sessions (for app shutdown)
 */
export function closeAllV2Sessions(): void {
  console.log(`[Agent] Closing all ${v2Sessions.size} V2 sessions`)
  // Avoid TS downlevelIteration requirement
  for (const [convId, info] of Array.from(v2Sessions.entries())) {
    try {
      info.session.close()
    } catch (e) {
      console.error(`[Agent] Error closing session ${convId}:`, e)
    }
  }
  v2Sessions.clear()
  clearAllCompactionStates()

  stopSessionCleanup()
}

/**
 * Invalidate all V2 sessions due to API config change.
 * Called by config.service via callback when API config changes.
 *
 * Sessions are closed immediately, but users are not interrupted.
 * New sessions will be created with updated config on next message.
 */
export function invalidateAllSessions(): void {
  const count = v2Sessions.size
  if (count === 0) {
    console.log('[Agent] No active sessions to invalidate')
    return
  }

  console.log(`[Agent] Invalidating ${count} sessions due to API config change`)

  for (const [convId, info] of Array.from(v2Sessions.entries())) {
    // If a request is in flight, defer closing until it finishes
    if (activeSessions.has(convId)) {
      pendingInvalidations.add(convId)
      console.log(`[Agent] Deferring session close until idle: ${convId}`)
      continue
    }

    try {
      console.log(`[Agent] Closing session: ${convId}`)
      info.session.close()
    } catch (e) {
      console.error(`[Agent] Error closing session ${convId}:`, e)
    }
  }

  // Remove only sessions that were closed immediately
  for (const convId of Array.from(v2Sessions.keys())) {
    if (!activeSessions.has(convId)) {
      v2Sessions.delete(convId)
    }
  }
  console.log('[Agent] All sessions invalidated, will use new config on next message')
}

// ============================================
// Active Session State
// ============================================

/**
 * Create a new active session state
 */
export function createSessionState(
  spaceId: string,
  conversationId: string,
  abortController: AbortController
): SessionState {
  return {
    abortController,
    spaceId,
    conversationId,
    pendingPermissionResolve: null,
    pendingPermissionToolCall: null,
    thoughts: [],
    pendingUserQuestion: null,
    currentStreamingContent: '',
    taskProgressMap: new Map()
  }
}

/**
 * Register an active session
 */
export function registerActiveSession(conversationId: string, state: SessionState): void {
  activeSessions.set(conversationId, state)
}

/**
 * Unregister an active session
 */
export function unregisterActiveSession(conversationId: string): void {
  activeSessions.delete(conversationId)

  if (pendingInvalidations.has(conversationId)) {
    pendingInvalidations.delete(conversationId)
    closeV2Session(conversationId)
  }
}

/**
 * Get an active session by conversation ID
 */
export function getActiveSession(conversationId: string): SessionState | undefined {
  return activeSessions.get(conversationId)
}

/**
 * Get V2 session for a conversation (for IPC handlers like rewind)
 */
export function getV2Session(conversationId: string): V2SessionInfo | undefined {
  return v2Sessions.get(conversationId)
}

// ============================================
// Config Change Handler Registration
// ============================================

// Register for API config change notifications
// This is called once when the module loads
onApiConfigChange(() => {
  invalidateAllSessions()
})
