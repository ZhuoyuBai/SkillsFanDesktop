/**
 * Agent Module - Generation Control
 *
 * Functions for controlling agent generation including:
 * - Stop/abort generation
 * - Interrupt and inject user message
 * - Check if generating
 * - Get active sessions
 * - Get session state for recovery
 */

import { BrowserWindow } from 'electron'
import { stepReporterRuntime } from '../../../gateway/host-runtime/step-reporter/runtime'
import { activeSessions, v2Sessions } from './session-manager'
import { getConversation, updateLastMessage } from '../conversation.service'
import { sendMessage } from './send-message'
import { agentQueue } from './lane-queue'
import type { Thought, Attachment, ImageAttachment } from './types'
import type { HostStep } from '../../../shared/types/host-runtime'
import {
  killSubagentRun,
  listSubagentRunsForConversation,
  suppressAutoAnnounceForConversation
} from './subagent/runtime'

const CONTINUATION_PREFIX_MAX_CHARS = 1200

/**
 * Get the latest user message content before current injection.
 */
function getLatestUserMessage(spaceId: string, conversationId: string): string {
  const conversation = getConversation(spaceId, conversationId) as {
    messages?: Array<{ role?: string; content?: string }>
  } | null

  if (!conversation || !Array.isArray(conversation.messages)) {
    return ''
  }

  const messages = conversation.messages
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg?.role === 'user' && typeof msg.content === 'string' && msg.content.trim()) {
      return msg.content.trim()
    }
  }
  return ''
}

/**
 * Build a runtime-only prefix so follow-up messages sent during generation
 * continue the previous unfinished request instead of replacing it.
 */
function buildContinuationPrefix(previousUserMessage: string): string {
  if (!previousUserMessage) return ''

  const safePrevious = previousUserMessage.length > CONTINUATION_PREFIX_MAX_CHARS
    ? `${previousUserMessage.slice(0, CONTINUATION_PREFIX_MAX_CHARS)}...`
    : previousUserMessage

  return [
    '<follow_up_during_generation>',
    'The user sent a follow-up while your previous response was still generating.',
    'Treat the new user message as additive context. Do not drop unfinished intent from the previous user request.',
    'If the new message explicitly asks to replace/cancel the previous request, follow the new instruction.',
    `Previous unfinished user request:\n${safePrevious}`,
    '</follow_up_during_generation>'
  ].join('\n\n')
}

// ============================================
// Stop Generation
// ============================================

/**
 * Stop generation for a specific conversation or all conversations
 *
 * @param conversationId - Optional conversation ID. If not provided, stops all.
 */
export async function stopGeneration(conversationId?: string): Promise<void> {
  if (conversationId) {
    suppressAutoAnnounceForConversation(conversationId)

    for (const run of listSubagentRunsForConversation(conversationId, { includeCompleted: false })) {
      try {
        killSubagentRun(run.runId)
      } catch (error) {
        console.error(`[Agent] Failed to stop hosted subagent ${run.runId}:`, error)
      }
    }

    // Clear queued messages for this conversation
    const cleared = agentQueue.clearQueue(conversationId)
    if (cleared > 0) {
      console.log(`[Agent] Cleared ${cleared} queued messages for: ${conversationId}`)
    }

    // Stop specific session
    const session = activeSessions.get(conversationId)
    if (session) {
      session.abortController.abort()
      activeSessions.delete(conversationId)

      // Interrupt V2 Session and drain stale messages
      const v2Session = v2Sessions.get(conversationId)
      if (v2Session) {
        try {
          await (v2Session.session as any).interrupt()
          console.log(`[Agent] V2 session interrupted, draining stale messages...`)

          // Drain stale messages until we hit the result
          for await (const msg of v2Session.session.stream()) {
            console.log(`[Agent] Drained: ${msg.type}`)
            if (msg.type === 'result') break
          }
          console.log(`[Agent] Drain complete for: ${conversationId}`)
        } catch (e) {
          console.error(`[Agent] Failed to interrupt/drain V2 session:`, e)
        }
      }

      console.log(`[Agent] Stopped generation for conversation: ${conversationId}`)
    }
  } else {
    // Stop all sessions (backward compatibility)
    const allConversationIds = new Set<string>([
      ...Array.from(activeSessions.keys()),
      ...Array.from(v2Sessions.keys())
    ])

    for (const convId of allConversationIds) {
      suppressAutoAnnounceForConversation(convId)
      for (const run of listSubagentRunsForConversation(convId, { includeCompleted: false })) {
        try {
          killSubagentRun(run.runId)
        } catch (error) {
          console.error(`[Agent] Failed to stop hosted subagent ${run.runId}:`, error)
        }
      }
    }

    for (const [convId, session] of Array.from(activeSessions)) {
      session.abortController.abort()

      // Interrupt V2 Session
      const v2Session = v2Sessions.get(convId)
      if (v2Session) {
        try {
          await (v2Session.session as any).interrupt()
        } catch (e) {
          console.error(`[Agent] Failed to interrupt V2 session ${convId}:`, e)
        }
      }

      console.log(`[Agent] Stopped generation for conversation: ${convId}`)
    }
    activeSessions.clear()
    console.log('[Agent] All generations stopped')
  }
}

// ============================================
// Interrupt and Inject
// ============================================

/**
 * Interrupt current generation and inject a user message
 *
 * This allows users to send a message while the AI is generating.
 * The current generation is interrupted, partial content is saved,
 * and a new message is sent. The AI will respond considering both
 * the partial output and the new user input.
 *
 * @param mainWindow - Main window for IPC communication
 * @param request - Inject request with spaceId, conversationId, message, and optional attachments
 */
export async function interruptAndInject(
  mainWindow: BrowserWindow | null,
  request: {
    spaceId: string
    conversationId: string
    message: string
    images?: ImageAttachment[]
    attachments?: Attachment[]
  }
): Promise<void> {
  const { spaceId, conversationId, message, images, attachments } = request

  console.log(`[Agent] interruptAndInject: conv=${conversationId}`)

  // 0. Clear queued messages (user interrupt = don't need queued messages)
  const cleared = agentQueue.clearQueue(conversationId)
  if (cleared > 0) {
    console.log(`[Agent] Cleared ${cleared} queued messages for inject`)
  }

  // 1. Get current session state
  const sessionState = activeSessions.get(conversationId)
  const v2SessionInfo = v2Sessions.get(conversationId)

  if (!sessionState || !v2SessionInfo) {
    throw new Error('No active session to inject into')
  }

  const previousUserMessage = getLatestUserMessage(spaceId, conversationId)
  const continuationPrefix = buildContinuationPrefix(previousUserMessage)

  // 2. Capture current streaming content and thoughts before interruption
  const partialContent = sessionState.currentStreamingContent || ''
  const thoughts = [...sessionState.thoughts]

  console.log(`[Agent] Captured partial content: ${partialContent.length} chars, ${thoughts.length} thoughts`)

  // 3. Interrupt current generation (similar to stopGeneration)
  sessionState.abortController.abort()
  activeSessions.delete(conversationId)

  try {
    await (v2SessionInfo.session as any).interrupt()
    console.log(`[Agent] V2 session interrupted for inject, draining stale messages...`)

    // Drain stale messages until we hit the result
    for await (const msg of v2SessionInfo.session.stream()) {
      console.log(`[Agent] Drained: ${msg.type}`)
      if (msg.type === 'result') break
    }
    console.log(`[Agent] Drain complete for inject: ${conversationId}`)
  } catch (e) {
    console.error(`[Agent] Failed to interrupt/drain V2 session for inject:`, e)
  }

  // 4. Save partial assistant message only when there is visible text content.
  if (partialContent.trim()) {
    updateLastMessage(spaceId, conversationId, {
      content: partialContent,
      thoughts: thoughts
    })
    console.log(`[Agent] Saved partial assistant message`)
  }

  // 5. Send new message using sendMessage (it will add user message and new assistant placeholder)
  // The V2 session retains context, so the AI knows about the interrupted output
  console.log(`[Agent] Sending injected message...`)
  await sendMessage(mainWindow, {
    spaceId,
    conversationId,
    message,
    messagePrefix: continuationPrefix || undefined,
    images,
    attachments,
    aiBrowserEnabled: v2SessionInfo.config.aiBrowserEnabled
  })
}

// ============================================
// Generation Status
// ============================================

/**
 * Check if a conversation has an active generation
 */
export function isGenerating(conversationId: string): boolean {
  return activeSessions.has(conversationId)
}

/**
 * Get all active session conversation IDs
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys())
}

// ============================================
// Session State Recovery
// ============================================

/**
 * Get current session state for a conversation (for recovery after refresh)
 *
 * This is used by remote clients to recover the current state when they
 * reconnect or refresh the page during an active generation.
 */
export function getSessionState(conversationId: string): {
  isActive: boolean
  thoughts: Thought[]
  taskProgress: Array<{
    taskId: string
    toolUseId?: string
    description: string
    summary?: string
    resultSummary?: string
    lastToolName?: string
    status: 'running' | 'completed' | 'failed' | 'stopped'
    usage?: { total_tokens: number; tool_uses: number; duration_ms: number }
    stepHistory: Array<{
      toolName: string
      summary?: string
      timestamp: number
      toolUseCount: number
    }>
  }>
  subagentRuns: Array<{
    runId: string
    parentConversationId: string
    parentSpaceId: string
    childConversationId: string
    status: 'queued' | 'running' | 'waiting_announce' | 'completed' | 'failed' | 'killed' | 'timeout'
    task: string
    label?: string
    model?: string
    modelSource?: string
    thinkingEffort?: string
    spawnedAt: string
    startedAt?: string
    endedAt?: string
    latestSummary?: string
    resultSummary?: string
    error?: string
    announcedAt?: string
    tokenUsage?: {
      inputTokens: number
      outputTokens: number
      totalCostUsd?: number
    }
    toolUseId?: string
    durationMs?: number
  }>
  hostSteps: HostStep[]
  spaceId?: string
} {
  const session = activeSessions.get(conversationId)
  const subagentRuns = listSubagentRunsForConversation(conversationId)
  const hostSteps = stepReporterRuntime.listSteps(conversationId)
  if (!session) {
    return { isActive: false, thoughts: [], taskProgress: [], subagentRuns, hostSteps }
  }
  return {
    isActive: true,
    thoughts: [...session.thoughts],
    taskProgress: Array.from(session.taskProgressMap.values()).map(task => ({
      ...task,
      stepHistory: [...task.stepHistory]
    })),
    subagentRuns,
    hostSteps,
    spaceId: session.spaceId
  }
}
