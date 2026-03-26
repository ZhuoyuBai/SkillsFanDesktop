/**
 * Agent Module - Send Message
 *
 * Core message sending logic including:
 * - API credential resolution and routing
 * - V2 Session management
 * - SDK message streaming and processing
 * - Token-level streaming support
 * - Error handling and recovery
 */

import fs from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import { getConfig } from '../config.service'
import { getConversation, saveSessionId, addMessage, updateLastMessage } from '../conversation.service'
import {
  isAIBrowserTool
} from '../ai-browser/tool-utils'
import { ensureSkillsInitialized, getSkill, getSkillsSignature } from '../skill'
import type {
  AgentRequest,
  ToolCall,
  Thought,
  SessionState,
  SessionConfig,
  TokenUsage,
  SingleCallUsage
} from './types'
import {
  getHeadlessElectronPath,
  getWorkingDir,
  getApiCredentials,
  getApiCredentialsForSource,
  getEnabledMcpServers,
  sendToRenderer,
  setMainWindow
} from './helpers'
import {
  getOrCreateV2Session,
  closeV2Session,
  createSessionState,
  registerActiveSession,
  unregisterActiveSession,
  v2Sessions
} from './session-manager'
import { broadcastMcpStatus } from './mcp-manager'
import { buildSdkOptions, resolveSdkTransport } from './sdk-options'
import { isNoVisionModel } from '../../../shared/utils/vision-models'
import {
  formatCanvasContext,
  buildMessageContent,
  shouldSuppressSdkStatus,
  parseSDKMessageThoughts,
  normalizeToolThoughtInput,
  normalizeToolThoughtName,
  serializeToolResultContent,
  extractSingleUsage,
  extractResultUsage
} from './message-utils'
import { getMemoryIndexManager } from '../memory'
import { getEnabledExtensions, runBeforeSendMessageHooks, runHook } from '../extension'
import {
  updateCompactionState,
  shouldTriggerCompaction,
  markCompactionTriggered,
  buildCompactionPrompt,
  getCompactionStatus,
  clearCompactionState
} from './compaction-monitor'
import { agentQueue } from './lane-queue'
import {
  normalizeThinkingEffortForModel,
  thinkingEffortToBudgetTokens
} from '../../../shared/utils/openai-models'
import { isDuplicateActiveToolUse } from '../../../shared/utils/thought-dedupe'
import { normalizeSdkStatusText, stripLeadingSetModelStatus } from '../../../shared/utils/sdk-status'
import { resolveAccessibleAiSource } from '../ai-sources/hosted-ai-availability'
import { normalizeRepairableSendMessageResult } from './tool-repair'

function getRuntimeModelDisplayName(config: Record<string, any>, modelId: string): string {
  const aiSources = config.aiSources || {}
  const currentSource = aiSources.current
  const currentSourceConfig = currentSource ? aiSources[currentSource] : undefined
  return currentSourceConfig?.modelNames?.[modelId] || modelId
}

function getDirectRuntimeModelReply(
  message: string,
  config: Record<string, any>,
  modelId: string
): string | null {
  const compact = message
    .toLowerCase()
    .replace(/[`"'“”‘’\s]/g, '')
    .replace(/[，。！？、,:：;；（）()【】[\]{}]/g, '')

  const isDirectModelQuestion =
    /^(你(现在|当前)?(用的是|正在用的|是)?什么模型|当前(运行|使用|用的)?(的是)?什么模型|现在(运行|使用|用的)?(的是)?什么模型)$/.test(compact) ||
    /^(whatmodelareyou|whichmodelareyou|whatmodelareyouusing|whichmodelareyouusing|whatmodelisrunning|whichmodelisrunning)$/.test(compact)

  if (!isDirectModelQuestion) {
    return null
  }

  const displayName = getRuntimeModelDisplayName(config, modelId)
  const prefersEnglish = /[a-z]/i.test(message) && !/[\u4e00-\u9fff]/.test(message)

  if (prefersEnglish) {
    return displayName === modelId
      ? `The current runtime model is \`${modelId}\`.`
      : `The current runtime model is ${displayName} (ID: \`${modelId}\`).`
  }

  return displayName === modelId
    ? `当前运行模型是 \`${modelId}\`。`
    : `当前运行模型是 ${displayName}（ID: \`${modelId}\`）。`
}

const SESSION_RECOVERY_MAX_ATTEMPTS = 2
const SESSION_RECOVERY_ERROR_MESSAGE = 'Agent session disconnected while responding. Automatically retried once, but it still failed.'
const EMPTY_RESPONSE_ERROR_MESSAGE = 'Agent session ended without producing any response text.'

interface ProcessMessageStreamResult {
  finalContent: string
  hadTextContent: boolean
  hadPersistentActivity: boolean
  sawAnySdkMessage: boolean
  sawResult: boolean
  tokenUsage: TokenUsage | null
  userMessageUuid?: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

function isRecoverableSessionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('processtransport is not ready for writing')
    || message.includes('cannot write to terminated process')
    || message.includes('cannot write to process that exited with error')
    || message.includes('failed to write to process stdin')
    || message.includes('query closed before response received')
}

function canRetrySessionRecovery(sessionState: SessionState): boolean {
  if (sessionState.currentStreamingContent.trim()) {
    return false
  }

  return !sessionState.thoughts.some(thought =>
    thought.type === 'text'
    || thought.type === 'tool_use'
    || thought.type === 'tool_result'
    || thought.type === 'result'
  )
}

function resetSessionStateForRetry(sessionState: SessionState): void {
  sessionState.pendingPermissionResolve = null
  sessionState.pendingPermissionToolCall = null
  sessionState.pendingUserQuestion = null
  sessionState.currentStreamingContent = ''
  sessionState.thoughts.length = 0
}

function findToolUseThought(sessionState: SessionState, toolId: string): Thought | undefined {
  for (let i = sessionState.thoughts.length - 1; i >= 0; i -= 1) {
    const candidate = sessionState.thoughts[i]
    if (candidate.id === toolId && candidate.type === 'tool_use') {
      return candidate
    }
  }
  return undefined
}

function persistAssistantSnapshot(
  spaceId: string,
  conversationId: string,
  snapshot: {
    content?: string
    thoughts?: Thought[]
    tokenUsage?: TokenUsage | null
    userMessageUuid?: string
  },
  mode: 'update_last' | 'append_new' | 'none' = 'update_last'
): boolean {
  if (mode === 'none') {
    return false
  }

  const hasThoughts = Array.isArray(snapshot.thoughts) && snapshot.thoughts.length > 0
  const hasContent = typeof snapshot.content === 'string' && snapshot.content.length > 0
  const hasMetadata = Boolean(snapshot.tokenUsage || snapshot.userMessageUuid)

  if (!hasThoughts && !hasContent && !hasMetadata) {
    return false
  }

  if (mode === 'append_new') {
    if (!hasContent) {
      return false
    }

    addMessage(spaceId, conversationId, {
      role: 'assistant',
      content: snapshot.content ?? '',
      toolCalls: [],
      thoughts: hasThoughts ? [...snapshot.thoughts!] : undefined,
      tokenUsage: snapshot.tokenUsage || undefined,
      userMessageUuid: snapshot.userMessageUuid
    })
    return true
  }

  return Boolean(updateLastMessage(spaceId, conversationId, {
    content: snapshot.content ?? '',
    thoughts: hasThoughts ? [...snapshot.thoughts!] : undefined,
    tokenUsage: snapshot.tokenUsage || undefined,
    userMessageUuid: snapshot.userMessageUuid
  }))
}

// ============================================
// Send Message
// ============================================

/**
 * Send message to agent (supports multiple concurrent sessions)
 *
 * Uses Lane Queue to ensure messages to the same conversation are processed
 * serially, preventing race conditions from rapid message sending.
 */
export async function sendMessage(
  mainWindow: BrowserWindow | null,
  request: AgentRequest
): Promise<void> {
  const { conversationId } = request
  const suppressQueuedEvent = request.internalMessage?.suppressQueuedEvent === true

  // Check queue status and notify frontend if queued
  const status = agentQueue.getStatus(conversationId)
  if (status.running && !suppressQueuedEvent) {
    console.log(`[Agent] Message queued for conv=${conversationId}, position=${status.queued + 1}`)
    sendToRenderer('agent:queued', request.spaceId, conversationId, {
      type: 'queued',
      position: status.queued + 1
    })
  }

  // Enqueue through Lane Queue — same conversation serialized, different conversations parallel
  return agentQueue.enqueue(
    conversationId,
    () => sendMessageInternal(mainWindow, request),
    { overflow: 'reject', maxQueueLength: 3 }
  )
}

/**
 * Internal message sending logic (called via Lane Queue)
 */
async function sendMessageInternal(
  mainWindow: BrowserWindow | null,
  request: AgentRequest
): Promise<void> {
  setMainWindow(mainWindow)

  const {
    spaceId,
    conversationId,
    message,
    messagePrefix,
    resumeSessionId,
    images,
    attachments,
    aiBrowserEnabled,
    thinkingEnabled,
    canvasContext,
    ralphMode,
    internalMessage
  } = request
  const assistantPersistMode = internalMessage?.persistAssistantMode ?? 'update_last'
  const shouldPersistConversation = !ralphMode?.enabled
  const shouldPersistUserMessage = shouldPersistConversation && internalMessage?.persistUserMessage !== false
  const shouldCreateAssistantPlaceholder = shouldPersistConversation && assistantPersistMode === 'update_last'

  // Notify frontend that this queued message is now actually executing
  sendToRenderer('agent:start', spaceId, conversationId, {})

  const attCount = (images?.length || 0) + (attachments?.length || 0)
  console.log(`[Agent] sendMessage: conv=${conversationId}${attCount > 0 ? `, attachments=${attCount}` : ''}${aiBrowserEnabled ? ', AI Browser enabled' : ''}${thinkingEnabled ? ', thinking=ON' : ''}${canvasContext?.isOpen ? `, canvas tabs=${canvasContext.tabCount}` : ''}${ralphMode?.enabled ? ', Ralph mode' : ''}`)

  const config = getConfig()
  // Ralph mode uses projectDir as working directory
  const workDir = ralphMode?.enabled ? ralphMode.projectDir : getWorkingDir(spaceId)

  // Get API credentials based on current aiSources configuration
  let credentials = await getApiCredentials(config)
  const aiSources = ((config as any).aiSources || {}) as Record<string, any>
  const effectiveModelSource = request.modelSource
    ? resolveAccessibleAiSource(aiSources as any, request.modelSource) || request.modelSource
    : undefined

  // Allow request-level source/provider override (used by Loop Tasks for cross-provider model switching)
  if (request.modelSource) {
    credentials = await getApiCredentialsForSource(config, request.modelSource, request.model)
    console.log(`[Agent] Source override: ${request.modelSource}${effectiveModelSource && effectiveModelSource !== request.modelSource ? ` -> ${effectiveModelSource}` : ''}`)
  }

  // Allow request-level model override (used by Loop Tasks)
  if (request.model) {
    credentials.model = request.model
  }
  console.log(`[Agent] sendMessage using: ${credentials.provider}, model: ${credentials.model}${request.model ? ' (task override)' : ''}${effectiveModelSource ? ` source: ${effectiveModelSource}` : ''}`)

  const directRuntimeModelReply = !internalMessage &&
    !ralphMode?.enabled &&
    !messagePrefix &&
    (!images || images.length === 0) &&
    (!attachments || attachments.length === 0)
      ? getDirectRuntimeModelReply(message, config as Record<string, any>, credentials.model)
      : null

  if (directRuntimeModelReply) {
    addMessage(spaceId, conversationId, {
      role: 'user',
      content: message,
      images
    })

    addMessage(spaceId, conversationId, {
      role: 'assistant',
      content: '',
      toolCalls: []
    })

    updateLastMessage(spaceId, conversationId, {
      content: directRuntimeModelReply
    })

    sendToRenderer('agent:message', spaceId, conversationId, {
      type: 'message',
      content: directRuntimeModelReply,
      isComplete: true
    })
    sendToRenderer('agent:complete', spaceId, conversationId, {
      type: 'complete',
      duration: 0
    })
    return
  }

  const transport = await resolveSdkTransport(credentials)
  const anthropicBaseUrl = transport.anthropicBaseUrl
  const anthropicApiKey = transport.anthropicApiKey
  const sdkModel = transport.sdkModel
  if (transport.routed) {
    console.log(`[Agent] ${credentials.provider} provider enabled: routing via ${anthropicBaseUrl}, apiType=${transport.apiType}`)
  }

  // Get conversation for session resumption (skip for Ralph mode - no conversation history needed)
  let sessionId = resumeSessionId
  if (!ralphMode?.enabled) {
    const conversation = getConversation(spaceId, conversationId)
    sessionId = sessionId || conversation?.sessionId
  }

  // Create abort controller for this session
  const abortController = new AbortController()

  // Accumulate stderr for detailed error messages
  let stderrBuffer = ''

  // Register this session in the active sessions map
  const sessionState = createSessionState(spaceId, conversationId, abortController)
  registerActiveSession(conversationId, sessionState)

  if (shouldPersistUserMessage) {
    addMessage(spaceId, conversationId, {
      role: 'user',
      content: message,
      images: images,  // Include legacy images in the saved message
      attachments: attachments  // Persist all attachments for renderer restore
    })
  }

  if (shouldCreateAssistantPlaceholder) {
    addMessage(spaceId, conversationId, {
      role: 'assistant',
      content: '',
      toolCalls: []
    })
  }

  try {
    // Use headless Electron binary (outside .app bundle on macOS to prevent Dock icon)
    const electronPath = getHeadlessElectronPath()
    console.log(`[Agent] Using headless Electron as Node runtime: ${electronPath}`)

    // Ensure skills are loaded before creating session
    // This determines if Skill MCP server should be added and triggers session rebuild if needed
    await ensureSkillsInitialized(workDir, { forceRefresh: true })
    const skillsSignature = getSkillsSignature()

    // Log MCP servers if configured (only enabled ones)
    const enabledMcpServers = getEnabledMcpServers(config.mcpServers || {})
    const mcpServerNames = enabledMcpServers ? Object.keys(enabledMcpServers) : []
    if (mcpServerNames.length > 0) {
      console.log(`[Agent][${conversationId}] MCP servers configured: ${mcpServerNames.join(', ')}`)
    }

    // Session config for rebuild detection
    const ci = config.customInstructions
    const browserAutomationMode = config.browserAutomation?.mode === 'system-browser' ? 'system-browser' : 'ai-browser'
    const effectiveAiBrowserEnabled = !!aiBrowserEnabled && browserAutomationMode !== 'system-browser'
    const { getExtensionHash } = await import('../extension')
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: effectiveAiBrowserEnabled,
      skillsSignature,
      browserAutomationMode,
      customInstructionsHash: ci?.enabled && ci?.content ? ci.content : undefined,
      extensionHash: getExtensionHash()
    }

    for (let attempt = 1; attempt <= SESSION_RECOVERY_MAX_ATTEMPTS; attempt++) {
      const t0 = Date.now()
      console.log(`[Agent][${conversationId}] Getting or creating V2 session (attempt ${attempt}/${SESSION_RECOVERY_MAX_ATTEMPTS})...`)

      if (attempt > 1) {
        console.warn(`[Agent][${conversationId}] Rebuilding V2 session and retrying message (${attempt}/${SESSION_RECOVERY_MAX_ATTEMPTS})`)
        sendToRenderer('agent:status', spaceId, conversationId, {
          type: 'status',
          message: 'Session disconnected. Reconnecting and continuing...',
          subtype: 'session_recovery'
        })
        resetSessionStateForRetry(sessionState)
      }

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
          console.error(`[Agent][${conversationId}] CLI stderr:`, data)
          stderrBuffer += data
        },
        aiBrowserEnabled: !!aiBrowserEnabled,
        thinkingEnabled: !!thinkingEnabled,
        includeSkillMcp: skillsSignature.length > 0,
        ralphSystemPromptAppend: ralphMode?.systemPromptAppend || '',
        routed: transport.routed
      })

      if (addedMcpServers.includes('ai-browser')) {
        console.log(`[Agent][${conversationId}] AI Browser MCP server added`)
      }
      if (addedMcpServers.includes('web-tools')) {
        console.log(`[Agent][${conversationId}] Web Tools MCP server added`)
      }
      if (addedMcpServers.includes('skill')) {
        console.log(`[Agent][${conversationId}] Skill MCP server added`)
      }

      // Get or create persistent V2 session for this conversation
      // Pass config for rebuild detection when aiBrowserEnabled changes
      const v2Session = await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig)

      try {
        // Probe the transport before sending user input so dead cached sessions are rebuilt
        // here instead of surfacing as an empty completion later.
        if (v2Session.setPermissionMode) {
          await v2Session.setPermissionMode('acceptEdits')
        }

        // Dynamic runtime parameter adjustment (via SDK patch)
        // These can be changed without rebuilding the session
        try {
          // Only push model changes into the SDK for native Anthropic sessions.
          // Routed OpenAI/Codex sessions use a Claude-compatible transport model internally,
          // and surfacing that internal model name causes the assistant to misreport itself.
          if (v2Session.setModel && !transport.routed) {
            await v2Session.setModel(sdkModel)
            console.log(`[Agent][${conversationId}] Model set: ${sdkModel}`)
          } else if (transport.routed) {
            console.log(`[Agent][${conversationId}] Routed provider active, keeping runtime display model: ${credentials.model}`)
          }

          // Set thinking tokens dynamically (support effort levels)
          if (v2Session.setMaxThinkingTokens) {
            const effort = normalizeThinkingEffortForModel(
              credentials.model,
              request.thinkingEffort ?? (thinkingEnabled ? 'high' : undefined)
            )
            const thinkingTokens = thinkingEffortToBudgetTokens(effort)
            await v2Session.setMaxThinkingTokens(thinkingTokens)
            console.log(`[Agent][${conversationId}] Thinking: effort=${effort}, tokens=${thinkingTokens}`)
          }
        } catch (e) {
          if (isRecoverableSessionError(e)) {
            throw e
          }
          console.error(`[Agent][${conversationId}] Failed to set dynamic params:`, e)
        }
        console.log(`[Agent][${conversationId}] ⏱️ V2 session ready: ${Date.now() - t0}ms`)

        const streamResult = await processMessageStream(
          v2Session,
          sessionState,
          spaceId,
          conversationId,
          workDir,
          message,
          messagePrefix,
          images,
          attachments,
          canvasContext,
          credentials.model,
          abortController,
          assistantPersistMode,
          !internalMessage,
          ralphMode
        )

        if (abortController.signal.aborted) {
          console.log(`[Agent][${conversationId}] Aborted by user`)
          return
        }

        if (!streamResult.hadTextContent) {
          console.warn(
            `[Agent][${conversationId}] Session completed without text (sdkMessages=${streamResult.sawAnySdkMessage}, result=${streamResult.sawResult})`
          )

          if (!internalMessage && streamResult.hadPersistentActivity) {
            console.log(`[Agent][${conversationId}] Treating non-text assistant activity as a completed response`)
            return
          }

          if (attempt < SESSION_RECOVERY_MAX_ATTEMPTS && canRetrySessionRecovery(sessionState)) {
            closeV2Session(conversationId)
            continue
          }

          throw new Error(EMPTY_RESPONSE_ERROR_MESSAGE)
        }

        if (internalMessage?.onComplete) {
          try {
            internalMessage.onComplete({
              finalContent: streamResult.finalContent,
              hadPersistentActivity: streamResult.hadPersistentActivity,
              tokenUsage: streamResult.tokenUsage,
              userMessageUuid: streamResult.userMessageUuid
            })
          } catch (callbackError) {
            console.error(`[Agent][${conversationId}] internalMessage.onComplete failed:`, callbackError)
          }
        }

        return
      } catch (error) {
        if (attempt < SESSION_RECOVERY_MAX_ATTEMPTS && isRecoverableSessionError(error) && canRetrySessionRecovery(sessionState)) {
          console.warn(
            `[Agent][${conversationId}] Recoverable V2 session failure, retrying with fresh session: ${getErrorMessage(error)}`
          )
          closeV2Session(conversationId)
          continue
        }

        if (isRecoverableSessionError(error)) {
          throw new Error(`${SESSION_RECOVERY_ERROR_MESSAGE} Technical details: ${getErrorMessage(error)}`)
        }

        throw error
      }
    }

  } catch (error: unknown) {
    const err = error as Error

    // Don't report abort as error
    if (err.name === 'AbortError') {
      console.log(`[Agent][${conversationId}] Aborted by user`)
      return
    }

    console.error(`[Agent][${conversationId}] Error:`, error)

    // Extract detailed error message from stderr if available
    let errorMessage = err.message || 'Unknown error occurred'

    // Windows: Check for Git Bash related errors
    if (process.platform === 'win32') {
      const isExitCode1 = errorMessage.includes('exited with code 1') ||
                          errorMessage.includes('process exited') ||
                          errorMessage.includes('spawn ENOENT')
      const isBashError = stderrBuffer?.includes('bash') ||
                          stderrBuffer?.includes('ENOENT') ||
                          errorMessage.includes('ENOENT')

      if (isExitCode1 || isBashError) {
        // Check if Git Bash is properly configured
        const { detectGitBash } = require('../git-bash.service')
        const gitBashStatus = detectGitBash()

        if (!gitBashStatus.found) {
          errorMessage = 'Command execution environment not installed. Please restart the app and complete setup, or install manually in settings.'
        } else {
          // Git Bash found but still got error - could be path issue
          errorMessage = 'Command execution failed. This may be an environment configuration issue, please try restarting the app.\n\n' +
                        `Technical details: ${err.message}`
        }
      }
    }

    if (stderrBuffer && !errorMessage.includes('Command execution')) {
      // Try to extract the most useful error info from stderr
      const mcpErrorMatch = stderrBuffer.match(/Error: Invalid MCP configuration:[\s\S]*?(?=\n\s*at |$)/m)
      const genericErrorMatch = stderrBuffer.match(/Error: [\s\S]*?(?=\n\s*at |$)/m)
      if (mcpErrorMatch) {
        errorMessage = mcpErrorMatch[0].trim()
      } else if (genericErrorMatch) {
        errorMessage = genericErrorMatch[0].trim()
      }
    }

    // Try to extract friendly message from JSON error body embedded in error string
    // e.g., 'API Error: 402 {"type":"error","error":{"type":"billing_error","message":"Usage limit reached. Resets in ~40 minutes."}}'
    // e.g., 'API Error: 402 {"error":{"code":"402","message":"Insufficient account balance","type":"insufficient_balance"}}'
    const jsonMatch = errorMessage.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const errorType = parsed?.error?.type || parsed?.type
        const innerMsg = parsed?.error?.message || parsed?.message

        // Map known API error types to standardized keys for frontend i18n translation
        const ERROR_TYPE_MAP: Record<string, string> = {
          'insufficient_balance': 'Insufficient account balance',
          'insufficient_funds': 'Insufficient account balance',
          'billing_error': 'Billing error',
          'invalid_api_key': 'Invalid API key',
          'authentication_error': 'Invalid API key',
          'rate_limit_error': 'Rate limit exceeded',
          'model_not_found': 'Model not found',
          'overloaded_error': 'Service is temporarily overloaded',
          'server_error': 'Server error, please try again later',
        }

        const mapped = errorType ? ERROR_TYPE_MAP[errorType] : undefined
        if (mapped) {
          errorMessage = mapped
        } else if (innerMsg) {
          errorMessage = innerMsg
        }
      } catch {
        // Not valid JSON, keep original
      }
    }

    // Parse HTTP error codes from error messages (e.g., "402", "401", "503")
    let errorCode: number | undefined
    const httpCodeMatch = errorMessage.match(/\b(4\d{2}|5\d{2})\b/)
    if (httpCodeMatch) {
      errorCode = parseInt(httpCodeMatch[1], 10)
    }

    if (!ralphMode?.enabled && assistantPersistMode === 'update_last') {
      const errorThought: Thought = {
        id: `thought-error-${Date.now()}`,
        type: 'error',
        content: errorMessage,
        timestamp: new Date().toISOString(),
        isError: true
      }
      const persistedThoughts = [...sessionState.thoughts, errorThought]
      if (persistAssistantSnapshot(spaceId, conversationId, { thoughts: persistedThoughts }, 'update_last')) {
        console.log(`[Agent][${conversationId}] Persisted assistant snapshot for error recovery`)
      }
    }

    if (!internalMessage?.suppressErrorEvent) {
      sendToRenderer('agent:error', spaceId, conversationId, {
        type: 'error',
        error: errorMessage,
        errorCode
      })
    }

    if (internalMessage?.onError) {
      try {
        internalMessage.onError(errorMessage)
      } catch (callbackError) {
        console.error(`[Agent][${conversationId}] internalMessage.onError failed:`, callbackError)
      }
    }

    // Ralph mode: call onError callback
    if (ralphMode?.onError) {
      ralphMode.onError(errorMessage)
    }

    // Close V2 session on error (it may be in a bad state)
    closeV2Session(conversationId)
  } finally {
    // Clean up active session state (but keep V2 session for reuse)
    unregisterActiveSession(conversationId)
    console.log(`[Agent][${conversationId}] Active session state cleaned up. V2 sessions: ${v2Sessions.size}`)
  }
}

// ============================================
// Stream Processing
// ============================================

/**
 * Process the message stream from V2 session
 */
async function processMessageStream(
  v2Session: any,
  sessionState: SessionState,
  spaceId: string,
  conversationId: string,
  workDir: string,
  message: string,
  messagePrefix: AgentRequest['messagePrefix'],
  images: AgentRequest['images'],
  attachments: AgentRequest['attachments'],
  canvasContext: AgentRequest['canvasContext'],
  displayModel: string,
  abortController: AbortController,
  assistantPersistMode: 'update_last' | 'append_new' | 'none',
  allowThoughtOnlyCompletion: boolean,
  ralphMode?: AgentRequest['ralphMode']
): Promise<ProcessMessageStreamResult> {
  // Accumulate ALL text blocks (separated by double newlines) for complete output
  let accumulatedTextContent = ''
  let textBlockCount = 0
  let capturedSessionId: string | undefined
  let lastUserMessageUuid: string | undefined

  // Token usage tracking
  // lastSingleUsage: Last API call usage (single call, represents current context size)
  let lastSingleUsage: SingleCallUsage | null = null
  let tokenUsage: TokenUsage | null = null

  // Token-level streaming state
  let currentStreamingText = ''  // Accumulates text_delta tokens
  let isStreamingTextBlock = false  // True when inside a text content block
  let sawAnySdkMessage = false
  let sawResult = false

  // Tool call stack for parent-child relationship tracking
  // When a Skill tool is active, subsequent tool calls are marked as children
  interface ActiveToolCall {
    id: string
    toolName: string
  }
  let activeToolStack: ActiveToolCall[] = []
  interface StreamToolUseState {
    thought: Thought
    inputJson: string
  }
  const streamToolUses = new Map<number, StreamToolUseState>()

  const getVisibleAssistantContent = (content: string): string => stripLeadingSetModelStatus(content)

  const emitThought = (incomingThought: Thought | null | undefined): void => {
    if (!incomingThought) {
      return
    }

    let thought = incomingThought

    if (thought.type === 'tool_result') {
      const relatedToolUse = findToolUseThought(sessionState, thought.id)
      const recipient = typeof relatedToolUse?.toolInput?.recipient === 'string'
        ? relatedToolUse.toolInput.recipient
        : undefined
      thought = normalizeRepairableSendMessageResult({
        thought,
        toolName: relatedToolUse?.toolName,
        toolInput: relatedToolUse?.toolInput,
        recipientIsSkill: typeof recipient === 'string' && Boolean(getSkill(recipient))
      })
    }

    if (sessionState.thoughts.some(
      (existingThought) => existingThought.id === thought.id && existingThought.type === thought.type
    )) {
      console.log(`[Agent][${conversationId}] Skipping duplicate thought: ${thought.type} ${thought.id}`)
      return
    }

    if (thought.type === 'tool_use' && isDuplicateActiveToolUse(sessionState.thoughts, thought)) {
      console.log(
        `[Agent][${conversationId}] Skipping duplicate active tool_use: ${thought.toolName} ${JSON.stringify(thought.toolInput || {})}`
      )
      return
    }

    if (thought.type === 'tool_use' && thought.isSkillInvocation) {
      activeToolStack.push({ id: thought.id, toolName: thought.toolName! })
      console.log(`[Agent][${conversationId}] Skill tool pushed to stack: ${thought.toolName}, depth: ${activeToolStack.length}`)
    }

    if (thought.type === 'tool_result') {
      const topTool = activeToolStack[activeToolStack.length - 1]
      if (topTool && thought.id === topTool.id) {
        activeToolStack.pop()
        console.log(`[Agent][${conversationId}] Skill tool popped from stack: ${topTool.toolName}, depth: ${activeToolStack.length}`)
      }
    }

    sessionState.thoughts.push(thought)
    sendToRenderer('agent:thought', spaceId, conversationId, { thought })

    if (thought.type === 'text') {
      if (textBlockCount === 0) {
        accumulatedTextContent = getVisibleAssistantContent(accumulatedTextContent + thought.content)
        textBlockCount++

        if (ralphMode?.onOutput) {
          ralphMode.onOutput(accumulatedTextContent)
        }

        sendToRenderer('agent:message', spaceId, conversationId, {
          type: 'message',
          content: accumulatedTextContent,
          isComplete: false
        })
      }
      return
    }

    if (thought.type === 'tool_use') {
      if (!thought.parentToolId) {
        const toolCall: ToolCall = {
          id: thought.id,
          name: thought.toolName || '',
          status: 'running',
          input: thought.toolInput || {}
        }
        sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)
      }
      return
    }

    if (thought.type === 'tool_result') {
      if (!thought.parentToolId) {
        sendToRenderer('agent:tool-result', spaceId, conversationId, {
          type: 'tool_result',
          toolId: thought.id,
          result: thought.toolOutput || '',
          isError: thought.isError || false
        })
      }
      return
    }

    if (thought.type === 'result') {
      const finalContent = getVisibleAssistantContent(accumulatedTextContent || thought.content)
      sendToRenderer('agent:message', spaceId, conversationId, {
        type: 'message',
        content: finalContent,
        isComplete: true
      })
      if (!accumulatedTextContent && thought.content) {
        accumulatedTextContent = finalContent
      }
      console.log(`[Agent][${conversationId}] Result thought received, ${sessionState.thoughts.length} thoughts accumulated`)
    }
  }

  const t1 = Date.now()
  console.log(`[Agent][${conversationId}] Sending message to V2 session...`)
  if (images && images.length > 0) {
    console.log(`[Agent][${conversationId}] Message includes ${images.length} image(s)`)
  }

  // Inject memory flush hint if context was recently compressed
  let memoryFlushPrefix = ''
  const v2InfoForFlush = v2Sessions.get(conversationId)
  const memoryManager = getMemoryIndexManager()
  if (memoryManager.enabled && v2InfoForFlush?.needsMemoryFlush) {
    memoryFlushPrefix = '<memory_flush_hint>Context was recently compressed. If important context from our previous conversation has not been saved to MEMORY.md or memory/*.md, save it now before responding.</memory_flush_hint>\n\n'
    v2InfoForFlush.needsMemoryFlush = false
    console.log(`[Agent][${conversationId}] Memory flush hint injected`)
  }

  // Cross-conversation memory search — inject as message prefix (not system prompt)
  // This runs on every message send, so it works even when V2 session is reused
  //
  // Strategy: hybrid search (semantic + keyword) + recent conversation fallback
  // Semantic search catches meaning-level matches (e.g., "Python crawler" ↔ "requests web scraping")
  // Keyword search catches exact matches; recent fallback provides baseline context
  let memoryPrefix = ''
  if (!ralphMode?.enabled && memoryManager.enabled) {
    try {
      // Warm query embedding for semantic search (async but fast if model loaded)
      await memoryManager.warmQueryEmbedding(message)

      // 1. Hybrid search (semantic + keyword, merged and deduplicated)
      let fragments = memoryManager.searchRelevant(
        spaceId, message, conversationId, 5
      )

      // 2. Fallback: if few results, supplement with recent conversations
      if (fragments.length < 2) {
        const recentFragments = memoryManager.getRecentFragments(
          spaceId, conversationId, 3
        )
        // Merge and dedup by id
        const existingIds = new Set(fragments.map(f => f.id))
        for (const rf of recentFragments) {
          if (!existingIds.has(rf.id)) {
            fragments.push(rf)
            existingIds.add(rf.id)
          }
        }
        fragments = fragments.slice(0, 5)
        if (recentFragments.length > 0) {
          console.log(`[Agent] Memory fallback: added ${recentFragments.length} recent fragments`)
        }
      }

      if (fragments.length > 0) {
        memoryPrefix = `<related_history>\nThe following are messages from previous conversations with this user. Reference this information when answering questions about past discussions.\n\n${fragments.map((f: any) => `[${f.conversation_title}] (${f.role}):\n${f.content.slice(0, 500)}`).join('\n---\n')}\n</related_history>\n\n`
        console.log(`[Agent] Injected ${fragments.length} cross-conversation memory fragments into message`)
      }
    } catch (e) {
      // Memory system not critical - continue without it
    }
  }

  // Proactive compaction: if context usage was high on previous message, inject compaction request
  let compactionPrefix = ''
  const compactConfig = getConfig().conversation
  const autoCompact = compactConfig?.autoCompact !== false // default true
  if (autoCompact && !ralphMode?.enabled && shouldTriggerCompaction(conversationId)) {
    const status = getCompactionStatus(conversationId)
    if (status) {
      compactionPrefix = buildCompactionPrompt(status.usageRatio)
      markCompactionTriggered(conversationId)
      console.log(`[Agent][${conversationId}] Compaction prompt injected (${(status.usageRatio * 100).toFixed(0)}% usage)`)
    }
  }

  // Inject Canvas Context prefix if available
  // This provides AI awareness of what user is currently viewing
  const canvasPrefix = formatCanvasContext(canvasContext)
  const runtimePrefix = messagePrefix ? `${messagePrefix}\n\n` : ''
  let messageWithContext = compactionPrefix + memoryPrefix + memoryFlushPrefix + canvasPrefix + runtimePrefix + message

  // Extension hook: let extensions modify message before sending
  const enabledExtensions = getEnabledExtensions()
  if (enabledExtensions.length > 0) {
    messageWithContext = await runBeforeSendMessageHooks(
      enabledExtensions,
      messageWithContext,
      { spaceId, conversationId, workDir }
    )
  }

  // Check if user is sending images to a model that doesn't support vision
  const hasAnyImages = (images && images.length > 0) || (attachments && attachments.some(a => a.type === 'image'))
  if (hasAnyImages && isNoVisionModel(displayModel)) {
    sendToRenderer('agent:error', spaceId, conversationId, {
      type: 'error',
      error: 'The current model does not support image understanding. Please switch to a vision-capable model (e.g. Claude Sonnet, Claude Opus).',
      errorCode: 400
    })
    return
  }
  const finalMessage = messageWithContext
  const finalImages = images
  const finalAttachments = attachments

  // Build message content (text-only or multi-modal with images/PDFs/text)
  const messageContent = buildMessageContent(finalMessage, finalImages, finalAttachments)

  // Send message to V2 session and stream response
  // For multi-modal messages, we need to send as SDKUserMessage
  if (typeof messageContent === 'string') {
    v2Session.send(messageContent)
  } else {
    // Multi-modal message: construct SDKUserMessage
    const userMessage = {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: messageContent
      }
    }
    v2Session.send(userMessage as any)
  }

  // Track sub-agent step histories for expandable UI
  const taskStepHistories = new Map<string, Array<{ toolName: string; summary?: string; timestamp: number; toolUseCount: number }>>()

  // Stream messages from V2 session
  for await (const sdkMessage of v2Session.stream()) {
    sawAnySdkMessage = true

    // Handle abort - check this session's controller
    if (abortController.signal.aborted) {
      console.log(`[Agent][${conversationId}] Aborted`)
      break
    }

    // SDK status/progress messages → send as ephemeral status to frontend
    // These are the "status line" messages from Claude Code CLI (e.g., "Set model to ...", "Connecting to MCP...")
    if (sdkMessage.type === 'system') {
      const sub = (sdkMessage as any).subtype
      if (sub === 'local_command_output' || sub === 'status') {
        const rawStatusText = (sdkMessage as any).content || (sdkMessage as any).status || ''
        const statusText = typeof rawStatusText === 'string'
          ? normalizeSdkStatusText(rawStatusText)
          : ''
        console.log(`[Agent][${conversationId}] SDK status: ${sub} → ${JSON.stringify(statusText)} (suppress=${shouldSuppressSdkStatus(statusText)})`)
        if (statusText && !shouldSuppressSdkStatus(statusText)) {
          sendToRenderer('agent:status', spaceId, conversationId, {
            type: 'status',
            message: statusText,
            subtype: sub
          })
        }
        // Don't generate thought for status messages, but continue processing for session ID capture below
      }

      // Sub-agent task lifecycle events → forward to frontend for AgentTaskCard display
      if (sub === 'task_started') {
        const { task_id, tool_use_id, description } = sdkMessage as any
        console.log(`[Agent][${conversationId}] Task started: ${task_id} → ${description}`)
        taskStepHistories.set(task_id, [])
        sessionState.taskProgressMap.set(task_id, {
          taskId: task_id,
          toolUseId: tool_use_id,
          description: description || 'agent',
          status: 'running',
          stepHistory: []
        })
        sendToRenderer('agent:task-update', spaceId, conversationId, {
          type: 'task_started',
          taskId: task_id,
          toolUseId: tool_use_id,
          description,
        })
      }

      if (sub === 'task_progress') {
        const { task_id, description, usage, last_tool_name, summary } = sdkMessage as any
        // Accumulate step history: append when tool name differs from last entry
        const history = taskStepHistories.get(task_id) || []
        if (last_tool_name) {
          const lastEntry = history[history.length - 1]
          if (!lastEntry || lastEntry.toolName !== last_tool_name) {
            history.push({
              toolName: last_tool_name,
              summary,
              timestamp: Date.now(),
              toolUseCount: usage?.tool_uses || history.length + 1,
            })
          }
        }
        const existingTask = sessionState.taskProgressMap.get(task_id)
        if (existingTask) {
          sessionState.taskProgressMap.set(task_id, {
            ...existingTask,
            summary: summary || existingTask.summary,
            lastToolName: last_tool_name || existingTask.lastToolName,
            usage: usage || existingTask.usage,
            stepHistory: [...history]
          })
        }
        sendToRenderer('agent:task-update', spaceId, conversationId, {
          type: 'task_progress',
          taskId: task_id,
          description,
          summary,
          lastToolName: last_tool_name,
          usage,
          stepHistory: history,
        })
      }

      if (sub === 'task_notification') {
        const { task_id, status, summary, usage, output_file } = sdkMessage as any
        console.log(`[Agent][${conversationId}] Task ${status}: ${task_id}`)
        const history = taskStepHistories.get(task_id) || []
        // Read agent output from output_file if available
        let resultSummary = summary
        if (output_file) {
          try {
            resultSummary = await fs.readFile(output_file, 'utf-8')
          } catch { /* fallback to summary */ }
        }
        const existingTask = sessionState.taskProgressMap.get(task_id)
        if (existingTask) {
          sessionState.taskProgressMap.set(task_id, {
            ...existingTask,
            status: status || existingTask.status,
            summary: summary || existingTask.summary,
            resultSummary: resultSummary || existingTask.resultSummary,
            usage: usage || existingTask.usage,
            stepHistory: [...history]
          })
        }
        sendToRenderer('agent:task-update', spaceId, conversationId, {
          type: 'task_notification',
          taskId: task_id,
          status,
          summary,
          resultSummary,
          usage,
          stepHistory: history,
        })
      }
    }

    // Handle stream_event for token-level streaming and tool activity
    if (sdkMessage.type === 'stream_event') {
      const event = (sdkMessage as any).event
      if (!event) continue

      // DEBUG: Log all stream events with timestamp (ms since send)
      const elapsed = Date.now() - t1
      // For message_start, log the full event to see if it contains content structure hints
      if (event.type === 'message_start') {
        console.log(`[Agent][${conversationId}] 🔴 +${elapsed}ms message_start FULL:`, JSON.stringify(event))
      } else {
        console.log(`[Agent][${conversationId}] 🔴 +${elapsed}ms stream_event:`, JSON.stringify({
          type: event.type,
          index: event.index,
          content_block: event.content_block,
          delta: event.delta
        }))
      }

      // Text block started
      if (event.type === 'content_block_start' && event.content_block?.type === 'text') {
        isStreamingTextBlock = true
        currentStreamingText = event.content_block.text || ''
        textBlockCount++

        // Add separator between text blocks (not before the first one)
        if (textBlockCount > 1 && accumulatedTextContent) {
          accumulatedTextContent += '\n\n'
        }

        console.log(`[Agent][${conversationId}] ⏱️ Text block #${textBlockCount} started: ${Date.now() - t1}ms after send`)
      }

      if (
        event.type === 'content_block_start'
        && (event.content_block?.type === 'tool_use' || event.content_block?.type === 'server_tool_use')
      ) {
        const currentParentId = activeToolStack.length > 0
          ? activeToolStack[activeToolStack.length - 1].id
          : undefined
        const toolName = normalizeToolThoughtName(event.content_block?.name) || event.content_block?.name || 'tool'
        const toolInput = normalizeToolThoughtInput(toolName, event.content_block?.input) || {}
        const thought: Thought = {
          id: event.content_block?.id || `tool-${Date.now()}-${event.index ?? 0}`,
          type: 'tool_use',
          content: `Tool call: ${toolName}`,
          timestamp: new Date().toISOString(),
          toolName,
          toolInput,
          parentToolId: currentParentId,
          isSkillInvocation: toolName === 'Skill' || toolName === 'mcp__skill__Skill'
        }
        streamToolUses.set(event.index ?? -1, {
          thought,
          inputJson: ''
        })
        emitThought(thought)
      }

      if (event.type === 'content_block_start' && event.content_block?.type === 'web_search_tool_result') {
        const toolUseId = event.content_block?.tool_use_id || `web-search-${Date.now()}-${event.index ?? 0}`
        if (!findToolUseThought(sessionState, toolUseId)) {
          emitThought({
            id: toolUseId,
            type: 'tool_use',
            content: 'Tool call: WebSearch',
            timestamp: new Date().toISOString(),
            toolName: 'WebSearch',
            toolInput: {}
          })
        }

        emitThought({
          id: toolUseId,
          type: 'tool_result',
          content: 'Tool execution succeeded',
          timestamp: new Date().toISOString(),
          toolName: 'WebSearch',
          toolOutput: serializeToolResultContent(event.content_block?.content),
          isError: false
        })
      }

      // Text delta - accumulate locally, send full content to frontend
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && isStreamingTextBlock) {
        const delta = event.delta.text || ''
        currentStreamingText += delta

        // Update session state for inject feature
        sessionState.currentStreamingContent = getVisibleAssistantContent(accumulatedTextContent + currentStreamingText)

        // Ralph mode: call onOutput callback with full accumulated content
        if (ralphMode?.onOutput) {
          ralphMode.onOutput(getVisibleAssistantContent(accumulatedTextContent + currentStreamingText))
        }

        // Send full accumulated content (not just delta) for proper display
        const visibleContent = getVisibleAssistantContent(accumulatedTextContent + currentStreamingText)
        sendToRenderer('agent:message', spaceId, conversationId, {
          type: 'message',
          content: visibleContent,
          isComplete: false,
          isStreaming: true
        })
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        const streamToolState = streamToolUses.get(event.index ?? -1)
        if (streamToolState && typeof event.delta.partial_json === 'string') {
          streamToolState.inputJson += event.delta.partial_json
        }
      }

      // Text block ended
      if (event.type === 'content_block_stop') {
        const streamToolState = streamToolUses.get(event.index ?? -1)
        if (streamToolState) {
          if (streamToolState.inputJson) {
            try {
              const parsedInput = JSON.parse(streamToolState.inputJson) as Record<string, unknown>
              streamToolState.thought.toolInput = normalizeToolThoughtInput(streamToolState.thought.toolName, parsedInput) || streamToolState.thought.toolInput
            } catch (error) {
              console.warn(`[Agent][${conversationId}] Failed to parse stream tool input JSON:`, error)
            }
          }
          streamToolUses.delete(event.index ?? -1)
        }
      }

      if (event.type === 'content_block_stop' && isStreamingTextBlock) {
        isStreamingTextBlock = false
        // Accumulate this block's content
        accumulatedTextContent += currentStreamingText

        // Update session state for inject feature
        sessionState.currentStreamingContent = getVisibleAssistantContent(accumulatedTextContent)

        // Send full accumulated content
        const visibleContent = getVisibleAssistantContent(accumulatedTextContent)
        sendToRenderer('agent:message', spaceId, conversationId, {
          type: 'message',
          content: visibleContent,
          isComplete: false,
          isStreaming: false
        })
        console.log(`[Agent][${conversationId}] Text block #${textBlockCount} completed, block length: ${currentStreamingText.length}, total: ${accumulatedTextContent.length}`)
      }

      continue
    }

    // DEBUG: Log all SDK messages with timestamp
    const elapsed = Date.now() - t1
    console.log(`[Agent][${conversationId}] 🔵 +${elapsed}ms ${sdkMessage.type}:`,
      sdkMessage.type === 'assistant'
        ? JSON.stringify(
            Array.isArray((sdkMessage as any).message?.content)
              ? (sdkMessage as any).message.content.map((b: any) => ({ type: b.type, id: b.id, name: b.name, textLen: b.text?.length, thinkingLen: b.thinking?.length }))
              : (sdkMessage as any).message?.content
          )
        : sdkMessage.type === 'user'
          ? `tool_result or input`
          : ''
    )

    // Track user message UUID for file rewind support
    if (sdkMessage.type === 'user') {
      const uuid = (sdkMessage as any).uuid
      console.log(`[Agent][${conversationId}] User message UUID: ${uuid ?? 'NOT PRESENT'}`, JSON.stringify(Object.keys(sdkMessage)))
      if (uuid) {
        lastUserMessageUuid = uuid
      }
    }

    // Extract single API call usage from assistant message (represents current context size)
    if (sdkMessage.type === 'assistant') {
      const usage = extractSingleUsage(sdkMessage)
      if (usage) {
        lastSingleUsage = usage
      }
    }

    // Parse SDK message into Thoughts and send to renderer
    // Pass credentials.model to display the user's actual configured model
    // Pass current parent tool ID for child tool relationship tracking
    const currentParentId = activeToolStack.length > 0
      ? activeToolStack[activeToolStack.length - 1].id
      : undefined
    const thoughts = parseSDKMessageThoughts(sdkMessage, displayModel, currentParentId)
    for (const thought of thoughts) {
      emitThought(thought)
    }

    // Capture session ID and MCP status from system/result messages
    // Use type assertion for SDK message properties that may vary
    const msg = sdkMessage as Record<string, unknown>
    if (sdkMessage.type === 'system') {
      const subtype = msg.subtype as string | undefined
      const sessionIdFromMsg = msg.session_id || (msg.message as Record<string, unknown>)?.session_id
      if (sessionIdFromMsg) {
        capturedSessionId = sessionIdFromMsg as string
        console.log(`[Agent][${conversationId}] Captured session ID:`, capturedSessionId)
      }

      // Handle compact_boundary - context compression notification
      if (subtype === 'compact_boundary') {
        const compactMetadata = msg.compact_metadata as { trigger: 'manual' | 'auto'; pre_tokens: number } | undefined
        if (compactMetadata) {
          console.log(`[Agent][${conversationId}] Context compressed: trigger=${compactMetadata.trigger}, pre_tokens=${compactMetadata.pre_tokens}`)
          // Send compact notification to renderer
          sendToRenderer('agent:compact', spaceId, conversationId, {
            type: 'compact',
            trigger: compactMetadata.trigger,
            preTokens: compactMetadata.pre_tokens
          })

          // Flag memory flush for next message - prompt AI to save important context
          const v2Info = v2Sessions.get(conversationId)
          if (v2Info) {
            v2Info.needsMemoryFlush = true
            console.log(`[Agent][${conversationId}] Memory flush flagged for next message`)
          }
        }
      }

      // Extract MCP server status from system init message
      // SDKSystemMessage includes mcp_servers: { name: string; status: string }[]
      const mcpServers = msg.mcp_servers as Array<{ name: string; status: string }> | undefined
      if (mcpServers && mcpServers.length > 0) {
        console.log(`[Agent][${conversationId}] MCP server status:`, JSON.stringify(mcpServers))
        // Broadcast MCP status to frontend (global event, not conversation-specific)
        broadcastMcpStatus(mcpServers)
      }

      // Also capture tools list if available
      const tools = msg.tools as string[] | undefined
      if (tools) {
        console.log(`[Agent][${conversationId}] Available tools: ${tools.length}`)
      }
    } else if (sdkMessage.type === 'result') {
      sawResult = true

      if (!capturedSessionId) {
        const sessionIdFromMsg = msg.session_id || (msg.message as Record<string, unknown>)?.session_id
        capturedSessionId = sessionIdFromMsg as string
      }

      // Handle budget exceeded error
      const resultSubtype = msg.subtype as string | undefined
      if (resultSubtype === 'error_max_budget_usd') {
        console.log(`[Agent][${conversationId}] Budget exceeded`)
        sendToRenderer('agent:error', spaceId, conversationId, {
          type: 'error',
          error: 'Maximum budget exceeded. Please increase the budget limit in settings.',
          errorCode: 429
        })
      }

      // Extract token usage from result message
      tokenUsage = extractResultUsage(msg, lastSingleUsage)
      if (tokenUsage) {
        console.log(`[Agent][${conversationId}] Token usage (single API):`, tokenUsage)
      }
    }
  }

  // Update compaction monitor with token usage from this message
  if (tokenUsage && !ralphMode?.enabled) {
    const threshold = getConfig().conversation?.compactThreshold ?? 0.75
    updateCompactionState(conversationId, tokenUsage, threshold)
  }

  // Save session ID for future resumption (skip for Ralph mode - no conversation history needed)
  if (capturedSessionId && !ralphMode?.enabled) {
    saveSessionId(spaceId, conversationId, capturedSessionId)
    console.log(`[Agent][${conversationId}] Session ID saved:`, capturedSessionId)
  }

  // Ensure complete event is sent even if no result message was received
  let finalContent = accumulatedTextContent
  if (!finalContent) {
    if (currentStreamingText) {
      console.log(`[Agent][${conversationId}] Using fallback content from currentStreamingText: ${currentStreamingText.length} chars`)
      finalContent = currentStreamingText
    } else {
      console.log(`[Agent][${conversationId}] WARNING: No text content after SDK query completed`)
    }
  }
  finalContent = getVisibleAssistantContent(finalContent)

  const hadPersistentActivity = sessionState.thoughts.length > 0 || Boolean(tokenUsage) || Boolean(lastUserMessageUuid)

  if (!ralphMode?.enabled) {
    const persisted = persistAssistantSnapshot(spaceId, conversationId, {
      content: finalContent,
      thoughts: sessionState.thoughts,
      tokenUsage,
      userMessageUuid: lastUserMessageUuid
    }, assistantPersistMode)
    if (persisted) {
      console.log(
        `[Agent][${conversationId}] Saved assistant snapshot (${finalContent ? 'text' : 'thought-only'}) with ${sessionState.thoughts.length} thoughts${tokenUsage ? ' and tokenUsage' : ''}, userMessageUuid=${lastUserMessageUuid ?? 'NONE'}`
      )
    }
  }

  if (finalContent || (hadPersistentActivity && allowThoughtOnlyCompletion)) {
    console.log(
      `[Agent][${conversationId}] Sending final complete event ${finalContent ? `with text (${textBlockCount} blocks)` : 'without text'}`
    )
    const compactStatus = getCompactionStatus(conversationId)
    sendToRenderer('agent:complete', spaceId, conversationId, {
      type: 'complete',
      duration: 0,
      tokenUsage,
      userMessageUuid: lastUserMessageUuid,
      contextUsage: compactStatus ? compactStatus.usageRatio : undefined
    })
  }

  // Extension hook: notify extensions that message is complete
  if (finalContent && enabledExtensions.length > 0 && !ralphMode?.enabled) {
    runHook(enabledExtensions, 'onAfterMessage', {
      spaceId,
      conversationId,
      content: finalContent,
      tokenUsage: tokenUsage ? {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        contextWindow: tokenUsage.contextWindow
      } : undefined
    }).catch(() => {}) // Fire and forget
  }

  // Ralph mode: call onComplete callback
  // Ensure Ralph receives final accumulated output even when token-level stream events are unavailable.
  const finalRalphOutput = finalContent
  if (ralphMode?.onOutput && finalRalphOutput) {
    ralphMode.onOutput(finalRalphOutput)
  }

  if (ralphMode?.onComplete) {
    ralphMode.onComplete()
  }

  return {
    finalContent,
    hadTextContent: Boolean(finalContent),
    hadPersistentActivity,
    sawAnySdkMessage,
    sawResult,
    tokenUsage,
    userMessageUuid: lastUserMessageUuid
  }
}
