/**
 * Compaction Monitor - Tracks context window usage and triggers proactive compaction
 *
 * Monitors token usage per conversation and flags when context approaches capacity.
 * When flagged, the next message will include a compaction request asking the AI
 * to summarize and save important context before it's compressed.
 */

import type { TokenUsage } from './types'

interface CompactionState {
  lastInputTokens: number
  contextWindow: number
  usageRatio: number
  shouldCompact: boolean
  compactedAt?: number  // timestamp of last compaction
}

// Per-conversation compaction tracking
const compactionStates = new Map<string, CompactionState>()

// Default threshold: trigger compaction when context usage exceeds 75%
const DEFAULT_COMPACT_THRESHOLD = 0.75

// Cooldown: don't trigger compaction again within 2 minutes of last compaction
const COMPACT_COOLDOWN_MS = 2 * 60 * 1000

/**
 * Update compaction state after a message completes.
 * Returns true if compaction should be triggered.
 */
export function updateCompactionState(
  conversationId: string,
  tokenUsage: TokenUsage | null,
  threshold: number = DEFAULT_COMPACT_THRESHOLD
): boolean {
  if (!tokenUsage || tokenUsage.contextWindow <= 0) return false

  const usageRatio = tokenUsage.inputTokens / tokenUsage.contextWindow
  const existing = compactionStates.get(conversationId)

  // Check cooldown
  if (existing?.compactedAt && Date.now() - existing.compactedAt < COMPACT_COOLDOWN_MS) {
    // Update state but don't trigger
    compactionStates.set(conversationId, {
      lastInputTokens: tokenUsage.inputTokens,
      contextWindow: tokenUsage.contextWindow,
      usageRatio,
      shouldCompact: false,
      compactedAt: existing.compactedAt
    })
    return false
  }

  const shouldCompact = usageRatio >= threshold

  compactionStates.set(conversationId, {
    lastInputTokens: tokenUsage.inputTokens,
    contextWindow: tokenUsage.contextWindow,
    usageRatio,
    shouldCompact,
    compactedAt: existing?.compactedAt
  })

  if (shouldCompact) {
    console.log(
      `[Compaction][${conversationId}] Context usage at ${(usageRatio * 100).toFixed(1)}% ` +
      `(${tokenUsage.inputTokens}/${tokenUsage.contextWindow}), compaction recommended`
    )
  }

  return shouldCompact
}

/**
 * Check if compaction should be triggered for the next message.
 */
export function shouldTriggerCompaction(conversationId: string): boolean {
  return compactionStates.get(conversationId)?.shouldCompact ?? false
}

/**
 * Mark that compaction has been triggered (reset the flag and set cooldown).
 */
export function markCompactionTriggered(conversationId: string): void {
  const state = compactionStates.get(conversationId)
  if (state) {
    state.shouldCompact = false
    state.compactedAt = Date.now()
  }
}

/**
 * Get the current compaction status for a conversation.
 */
export function getCompactionStatus(conversationId: string): {
  usageRatio: number
  inputTokens: number
  contextWindow: number
  shouldCompact: boolean
} | null {
  const state = compactionStates.get(conversationId)
  if (!state) return null

  return {
    usageRatio: state.usageRatio,
    inputTokens: state.lastInputTokens,
    contextWindow: state.contextWindow,
    shouldCompact: state.shouldCompact
  }
}

/**
 * Build the compaction request prompt to inject before the user's message.
 */
export function buildCompactionPrompt(usageRatio: number): string {
  const pct = (usageRatio * 100).toFixed(0)
  return `<compaction_request>
The conversation context is approaching capacity (${pct}% used).
Before responding to the message below, please:
1. Identify the key decisions, context, and pending tasks from this conversation
2. Save them to MEMORY.md (or memory/*.md files) using the memory tool
3. Then respond to the user's message normally

This ensures important context is preserved when the conversation is automatically compressed.
</compaction_request>\n\n`
}

/**
 * Clean up compaction state for a conversation.
 */
export function clearCompactionState(conversationId: string): void {
  compactionStates.delete(conversationId)
}

/**
 * Clean up all compaction states.
 */
export function clearAllCompactionStates(): void {
  compactionStates.clear()
}
