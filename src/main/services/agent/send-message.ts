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
import {
  formatCanvasContext,
  buildMessageContent,
  parseSDKMessage,
  extractSingleUsage,
  extractResultUsage
} from './message-utils'
import { getMemoryIndexManager } from '../memory'
import { agentQueue } from './lane-queue'

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
      images: images  // Include images in the saved message
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
      ralphSystemPromptAppend: ralphMode?.systemPromptAppend || ''
    })

    if (addedMcpServers.includes('ai-browser')) {
      console.log(`[Agent][${conversationId}] AI Browser MCP server added`)
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
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: !!aiBrowserEnabled,
      hasSkills: skillsAvailable
    }

    // Get or create persistent V2 session for this conversation
    // Pass config for rebuild detection when aiBrowserEnabled changes
    const v2Session = await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig)

    // Dynamic runtime parameter adjustment (via SDK patch)
    // These can be changed without rebuilding the session
    try {
      // Set model dynamically (allows model switching without session rebuild)
      // Note: For OpenAI-compat/OAuth providers, model is encoded in apiKey and always fresh
      // This setModel call is mainly for pure Anthropic API sessions
      if (v2Session.setModel) {
        await v2Session.setModel(sdkModel)
        console.log(`[Agent][${conversationId}] Model set: ${sdkModel}`)
      }

      // Set thinking tokens dynamically
      if (v2Session.setMaxThinkingTokens) {
        await v2Session.setMaxThinkingTokens(thinkingEnabled ? 10240 : null)
        console.log(`[Agent][${conversationId}] Thinking mode: ${thinkingEnabled ? 'ON (10240 tokens)' : 'OFF'}`)
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
  // Strategy: keyword search + recent conversation fallback
  // Keyword search alone can miss semantic gaps (e.g., "职业" vs "产品经理")
  // Recent fallback ensures the model always has some cross-conversation context
  let memoryPrefix = ''
  if (!ralphMode?.enabled && memoryManager.enabled) {
    try {
      // 1. Keyword-based search (searches both content and conversation titles)
      let fragments = memoryManager.searchRelevant(
        spaceId, message, conversationId, 5
      )

      // 2. Fallback: if few keyword results, supplement with recent conversations
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

  // Inject Canvas Context prefix if available
  // This provides AI awareness of what user is currently viewing
  const canvasPrefix = formatCanvasContext(canvasContext)
  const runtimePrefix = messagePrefix ? `${messagePrefix}\n\n` : ''
  const messageWithContext = memoryPrefix + memoryFlushPrefix + canvasPrefix + runtimePrefix + message

  // Build message content (text-only or multi-modal with images/PDFs/text)
  const messageContent = buildMessageContent(messageWithContext, images, attachments)

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

      // Extract token usage from result message
      tokenUsage = extractResultUsage(msg, lastSingleUsage)
      if (tokenUsage) {
        console.log(`[Agent][${conversationId}] Token usage (single API):`, tokenUsage)
      }
    }
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
        tokenUsage: tokenUsage || undefined  // Include token usage if available
      })
      console.log(`[Agent][${conversationId}] Saved ${sessionState.thoughts.length} thoughts${tokenUsage ? ' with tokenUsage' : ''} to backend`)
    }
    sendToRenderer('agent:complete', spaceId, conversationId, {
      type: 'complete',
      duration: 0,
      tokenUsage  // Include token usage data
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
      tokenUsage  // Include token usage data
    })
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
