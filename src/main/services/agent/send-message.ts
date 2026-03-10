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

import { BrowserWindow } from 'electron'
import { getConfig } from '../config.service'
import { getConversation, saveSessionId, addMessage, updateLastMessage } from '../conversation.service'
import {
  isAIBrowserTool
} from '../ai-browser/tool-utils'
import { hasSkills, ensureSkillsInitialized } from '../skill'
import type {
  AgentRequest,
  ToolCall,
  Thought,
  SessionConfig,
  TokenUsage,
  SingleCallUsage
} from './types'
import {
  getHeadlessElectronPath,
  getWorkingDir,
  getApiCredentials,
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
import { preprocessImages } from './image-preprocess'
import { generateSuggestions } from './suggestion-generator'
import {
  formatCanvasContext,
  buildMessageContent,
  parseSDKMessage,
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

  // Check queue status and notify frontend if queued
  const status = agentQueue.getStatus(conversationId)
  if (status.running) {
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
    ralphMode
  } = request

  // Notify frontend that this queued message is now actually executing
  sendToRenderer('agent:start', spaceId, conversationId, {})

  const attCount = (images?.length || 0) + (attachments?.length || 0)
  console.log(`[Agent] sendMessage: conv=${conversationId}${attCount > 0 ? `, attachments=${attCount}` : ''}${aiBrowserEnabled ? ', AI Browser enabled' : ''}${thinkingEnabled ? ', thinking=ON' : ''}${canvasContext?.isOpen ? `, canvas tabs=${canvasContext.tabCount}` : ''}${ralphMode?.enabled ? ', Ralph mode' : ''}`)

  const config = getConfig()
  // Ralph mode uses projectDir as working directory
  const workDir = ralphMode?.enabled ? ralphMode.projectDir : getWorkingDir(spaceId)

  // Get API credentials based on current aiSources configuration
  let credentials = await getApiCredentials(config)

  // Allow request-level source/provider override (used by Loop Tasks for cross-provider model switching)
  if (request.modelSource) {
    const aiSources = (config as any).aiSources || {}
    const currentSource = aiSources.current || 'custom'

    if (request.modelSource !== currentSource) {
      const targetConfig = aiSources[request.modelSource]
      if (targetConfig) {
        const isOAuth = targetConfig && typeof targetConfig === 'object' && 'loggedIn' in targetConfig
        if (!isOAuth && targetConfig.apiKey) {
          // Custom API provider - construct credentials directly
          credentials = {
            baseUrl: targetConfig.apiUrl || 'https://api.anthropic.com',
            apiKey: targetConfig.apiKey,
            model: request.model || targetConfig.model || 'claude-opus-4-5-20251101',
            provider: targetConfig.provider === 'openai' ? 'openai' : 'anthropic',
            customHeaders: targetConfig.customHeaders,
            apiType: targetConfig.apiType
          }
          console.log(`[Agent] Source override: ${request.modelSource} (custom API)`)
        }
        // For OAuth targets different from current, model override below handles it
      }
    }
  }

  // Allow request-level model override (used by Loop Tasks)
  if (request.model) {
    credentials.model = request.model
  }
  console.log(`[Agent] sendMessage using: ${credentials.provider}, model: ${credentials.model}${request.model ? ' (task override)' : ''}${request.modelSource ? ` source: ${request.modelSource}` : ''}`)

  const directRuntimeModelReply = !ralphMode?.enabled &&
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

  // Add user message to conversation (skip for Ralph mode - no conversation history needed)
  if (!ralphMode?.enabled) {
    addMessage(spaceId, conversationId, {
      role: 'user',
      content: message,
      images: images,  // Include legacy images in the saved message
      attachments: attachments  // Persist all attachments for renderer restore
    })

    // Add placeholder for assistant response
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
        console.error(`[Agent][${conversationId}] CLI stderr:`, data)
        stderrBuffer += data
      },
      aiBrowserEnabled: !!aiBrowserEnabled,
      thinkingEnabled: !!thinkingEnabled,
      includeSkillMcp: skillsAvailable,
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

    const t0 = Date.now()
    console.log(`[Agent][${conversationId}] Getting or creating V2 session...`)

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
      hasSkills: skillsAvailable,
      browserAutomationMode,
      customInstructionsHash: ci?.enabled && ci?.content ? ci.content : undefined,
      extensionHash: getExtensionHash()
    }

    // Get or create persistent V2 session for this conversation
    // Pass config for rebuild detection when aiBrowserEnabled changes
    const v2Session = await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig)

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
      console.error(`[Agent][${conversationId}] Failed to set dynamic params:`, e)
    }
    console.log(`[Agent][${conversationId}] ⏱️ V2 session ready: ${Date.now() - t0}ms`)

    // Process the stream
    await processMessageStream(
      v2Session,
      sessionState,
      spaceId,
      conversationId,
      message,
      messagePrefix,
      images,
      attachments,
      canvasContext,
      credentials.model,
      abortController,
      t0,
      ralphMode
    )

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
    const jsonMatch = errorMessage.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const innerMsg = parsed?.error?.message || parsed?.message
        if (innerMsg) {
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

    sendToRenderer('agent:error', spaceId, conversationId, {
      type: 'error',
      error: errorMessage,
      errorCode
    })

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
  sessionState: any,
  spaceId: string,
  conversationId: string,
  message: string,
  messagePrefix: AgentRequest['messagePrefix'],
  images: AgentRequest['images'],
  attachments: AgentRequest['attachments'],
  canvasContext: AgentRequest['canvasContext'],
  displayModel: string,
  abortController: AbortController,
  t0: number,
  ralphMode?: AgentRequest['ralphMode']
): Promise<void> {
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
  const STREAM_THROTTLE_MS = 30  // Throttle updates to ~33fps

  // Tool call stack for parent-child relationship tracking
  // When a Skill tool is active, subsequent tool calls are marked as children
  interface ActiveToolCall {
    id: string
    toolName: string
  }
  let activeToolStack: ActiveToolCall[] = []

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

  // Preprocess images for models that don't support vision
  // This describes images using a vision-capable model and injects text descriptions
  let finalMessage = messageWithContext
  let finalImages = images
  let finalAttachments = attachments
  const hasAnyImages = (images && images.length > 0) || (attachments && attachments.some(a => a.type === 'image'))
  if (hasAnyImages) {
    sendToRenderer('agent:message', spaceId, conversationId, {
      type: 'status',
      content: 'Analyzing images...'
    })
    const preprocessResult = await preprocessImages(messageWithContext, credentials.model, images, attachments)
    if (preprocessResult.preprocessed) {
      finalMessage = preprocessResult.enhancedMessage
      finalImages = preprocessResult.filteredImages
      finalAttachments = preprocessResult.filteredAttachments
      if (preprocessResult.error) {
        sendToRenderer('agent:message', spaceId, conversationId, {
          type: 'warning',
          content: preprocessResult.error
        })
      }
    }
  }

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

  // Stream messages from V2 session
  for await (const sdkMessage of v2Session.stream()) {
    // Handle abort - check this session's controller
    if (abortController.signal.aborted) {
      console.log(`[Agent][${conversationId}] Aborted`)
      break
    }

    // Handle stream_event for token-level streaming (text only)
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

      // Text delta - accumulate locally, send full content to frontend
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && isStreamingTextBlock) {
        const delta = event.delta.text || ''
        currentStreamingText += delta

        // Update session state for inject feature
        sessionState.currentStreamingContent = accumulatedTextContent + currentStreamingText

        // Ralph mode: call onOutput callback with full accumulated content
        if (ralphMode?.onOutput) {
          ralphMode.onOutput(accumulatedTextContent + currentStreamingText)
        }

        // Send full accumulated content (not just delta) for proper display
        sendToRenderer('agent:message', spaceId, conversationId, {
          type: 'message',
          content: accumulatedTextContent + currentStreamingText,
          isComplete: false,
          isStreaming: true
        })
      }

      // Text block ended
      if (event.type === 'content_block_stop' && isStreamingTextBlock) {
        isStreamingTextBlock = false
        // Accumulate this block's content
        accumulatedTextContent += currentStreamingText

        // Update session state for inject feature
        sessionState.currentStreamingContent = accumulatedTextContent

        // Send full accumulated content
        sendToRenderer('agent:message', spaceId, conversationId, {
          type: 'message',
          content: accumulatedTextContent,
          isComplete: false,
          isStreaming: false
        })
        console.log(`[Agent][${conversationId}] Text block #${textBlockCount} completed, block length: ${currentStreamingText.length}, total: ${accumulatedTextContent.length}`)
      }

      continue  // stream_event handled, skip normal processing
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

    // Parse SDK message into Thought and send to renderer
    // Pass credentials.model to display the user's actual configured model
    // Pass current parent tool ID for child tool relationship tracking
    const currentParentId = activeToolStack.length > 0
      ? activeToolStack[activeToolStack.length - 1].id
      : undefined
    const thought = parseSDKMessage(sdkMessage, displayModel, currentParentId)

    if (thought) {
      if (sessionState.thoughts.some(
        (existingThought) => existingThought.id === thought.id && existingThought.type === thought.type
      )) {
        console.log(`[Agent][${conversationId}] Skipping duplicate thought: ${thought.type} ${thought.id}`)
        continue
      }

      if (thought.type === 'tool_use' && isDuplicateActiveToolUse(sessionState.thoughts, thought)) {
        console.log(
          `[Agent][${conversationId}] Skipping duplicate active tool_use: ${thought.toolName} ${JSON.stringify(thought.toolInput || {})}`
        )
        continue
      }

      // Track Skill tool calls in stack (for parent-child relationship)
      if (thought.type === 'tool_use' && thought.isSkillInvocation) {
        activeToolStack.push({ id: thought.id, toolName: thought.toolName! })
        console.log(`[Agent][${conversationId}] Skill tool pushed to stack: ${thought.toolName}, depth: ${activeToolStack.length}`)
      }

      // Pop from stack when Skill result comes back
      if (thought.type === 'tool_result') {
        const topTool = activeToolStack[activeToolStack.length - 1]
        if (topTool && thought.id === topTool.id) {
          activeToolStack.pop()
          console.log(`[Agent][${conversationId}] Skill tool popped from stack: ${topTool.toolName}, depth: ${activeToolStack.length}`)
        }
      }

      // Accumulate thought in backend session (Single Source of Truth)
      sessionState.thoughts.push(thought)

      // Send ALL thoughts to renderer for real-time display in thought process area
      // This includes text blocks - they appear in the timeline during generation
      sendToRenderer('agent:thought', spaceId, conversationId, { thought })

      // Handle specific thought types
      if (thought.type === 'text') {
        // Text blocks are handled via stream_event for token-level streaming
        // Only use this fallback for non-streaming SDKs (when textBlockCount is still 0)
        // If textBlockCount > 0, content was already accumulated via stream_event - skip to avoid duplication
        if (textBlockCount === 0) {
          accumulatedTextContent += thought.content
          textBlockCount++

          // Ralph mode: non-streaming fallback still needs output callback.
          if (ralphMode?.onOutput) {
            ralphMode.onOutput(accumulatedTextContent)
          }

          // Send streaming update with accumulated content
          sendToRenderer('agent:message', spaceId, conversationId, {
            type: 'message',
            content: accumulatedTextContent,
            isComplete: false
          })
        }
      } else if (thought.type === 'tool_use') {
        // Only send tool-call event for top-level tools (not children of Skill)
        if (!thought.parentToolId) {
          const toolCall: ToolCall = {
            id: thought.id,
            name: thought.toolName || '',
            status: 'running',
            input: thought.toolInput || {}
          }
          sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)
        }
      } else if (thought.type === 'tool_result') {
        // Only send tool-result event for top-level tools (not children of Skill)
        if (!thought.parentToolId) {
          sendToRenderer('agent:tool-result', spaceId, conversationId, {
            type: 'tool_result',
            toolId: thought.id,
            result: thought.toolOutput || '',
            isError: thought.isError || false
          })
        }
      } else if (thought.type === 'result') {
        // Final result - use accumulated text content
        const finalContent = accumulatedTextContent || thought.content
        sendToRenderer('agent:message', spaceId, conversationId, {
          type: 'message',
          content: finalContent,
          isComplete: true
        })
        // Fallback: if no text block was received, use result content for persistence
        if (!accumulatedTextContent && thought.content) {
          accumulatedTextContent = thought.content
        }
        // Note: updateLastMessage is called after loop to include tokenUsage
        console.log(`[Agent][${conversationId}] Result thought received, ${sessionState.thoughts.length} thoughts accumulated`)
      }
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
  if (accumulatedTextContent) {
    console.log(`[Agent][${conversationId}] Sending final complete event with accumulated text (${textBlockCount} blocks)`)
    // Backend saves complete message with thoughts and tokenUsage (Single Source of Truth)
    // Skip for Ralph mode - no conversation history needed
    if (!ralphMode?.enabled) {
      updateLastMessage(spaceId, conversationId, {
        content: accumulatedTextContent,
        thoughts: sessionState.thoughts.length > 0 ? [...sessionState.thoughts] : undefined,
        tokenUsage: tokenUsage || undefined,  // Include token usage if available
        userMessageUuid: lastUserMessageUuid  // SDK UUID for file rewind
      })
      console.log(`[Agent][${conversationId}] Saved ${sessionState.thoughts.length} thoughts${tokenUsage ? ' with tokenUsage' : ''} to backend, userMessageUuid=${lastUserMessageUuid ?? 'NONE'}`)
    }
    const compactStatus = getCompactionStatus(conversationId)
    sendToRenderer('agent:complete', spaceId, conversationId, {
      type: 'complete',
      duration: 0,
      tokenUsage,  // Include token usage data
      userMessageUuid: lastUserMessageUuid,  // For file rewind support
      contextUsage: compactStatus ? compactStatus.usageRatio : undefined  // Context window usage ratio
    })
  } else {
    console.log(`[Agent][${conversationId}] WARNING: No text content after SDK query completed`)
    // CRITICAL: Still send complete event to unblock frontend
    // This can happen if content_block_stop is missing from SDK response

    // Fallback: Try to use currentStreamingText if available (content_block_stop was missed)
    const fallbackContent = currentStreamingText || ''
    if (fallbackContent && !ralphMode?.enabled) {
      console.log(`[Agent][${conversationId}] Using fallback content from currentStreamingText: ${fallbackContent.length} chars`)
      updateLastMessage(spaceId, conversationId, {
        content: fallbackContent,
        thoughts: sessionState.thoughts.length > 0 ? [...sessionState.thoughts] : undefined,
        tokenUsage: tokenUsage || undefined
      })
    }

    sendToRenderer('agent:complete', spaceId, conversationId, {
      type: 'complete',
      duration: 0,
      tokenUsage,  // Include token usage data
      userMessageUuid: lastUserMessageUuid  // For file rewind support
    })
  }

  // AI-powered follow-up suggestions - fire and forget, don't block completion
  if (!ralphMode?.enabled && (accumulatedTextContent || currentStreamingText)) {
    const sugContent = accumulatedTextContent || currentStreamingText || ''
    const toolsUsed = sessionState.thoughts
      .filter((t: any) => t.type === 'tool_use' && t.toolName)
      .map((t: any) => t.toolName!)
    generateSuggestions(message, sugContent, [...new Set(toolsUsed)])
      .then(suggestions => {
        if (suggestions.length > 0) {
          sendToRenderer('agent:suggestions', spaceId, conversationId, { type: 'suggestions', suggestions })
        }
      })
      .catch(() => {}) // Silent failure - frontend falls back to static suggestions
  }

  // Extension hook: notify extensions that message is complete
  if (enabledExtensions.length > 0 && !ralphMode?.enabled) {
    const finalContent = accumulatedTextContent || currentStreamingText || ''
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
  const finalRalphOutput = accumulatedTextContent || currentStreamingText
  if (ralphMode?.onOutput && finalRalphOutput) {
    ralphMode.onOutput(finalRalphOutput)
  }

  if (ralphMode?.onComplete) {
    ralphMode.onComplete()
  }
}
