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
import { activeSessions, v2Sessions } from './session-manager'
import { updateLastMessage } from '../conversation.service'
import { sendMessage } from './send-message'
import { agentQueue } from './lane-queue'
import type { Thought, ImageAttachment } from './types'

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
 * @param request - Inject request with spaceId, conversationId, message, and optional images
 */
export async function interruptAndInject(
  mainWindow: BrowserWindow | null,
  request: {
    spaceId: string
    conversationId: string
    message: string
    images?: ImageAttachment[]
  }
): Promise<void> {
  const { spaceId, conversationId, message, images } = request

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

  // 4. Save partial assistant message with thoughts (if there's content)
  if (partialContent.trim() || thoughts.length > 0) {
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
    images
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
  spaceId?: string
} {
  const session = activeSessions.get(conversationId)
  if (!session) {
    return { isActive: false, thoughts: [] }
  }
  return {
    isActive: true,
    thoughts: [...session.thoughts],
    spaceId: session.spaceId
  }
}
