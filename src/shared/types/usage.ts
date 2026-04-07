/**
 * Usage Statistics Types - Shared between main and renderer
 */

// Per-period aggregation (daily/weekly/monthly)
export interface UsagePeriod {
  period: string // "2026-04-07" (day) / "2026-W15" (week) / "2026-04" (month)
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
  messageCount: number
  conversationCount: number
  modelsUsed: string[]
}

// Per-model aggregation
export interface UsageByModel {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  messageCount: number
}

// History stats response
export interface UsageHistoryResponse {
  summary: {
    totalCostUsd: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheReadTokens: number
    totalCacheCreationTokens: number
    totalMessages: number
    totalConversations: number
  }
  periods: UsagePeriod[]
  byModel: UsageByModel[]
  meta: {
    dateRange: { from: string; to: string }
    scannedFiles: number
    cacheHit: boolean
  }
}

// Realtime usage data
export interface UsageRealtimeData {
  currentSession: {
    totalTokens: number
    costUsd: number
    startedAt: string | null
  }
  today: {
    totalTokens: number
    costUsd: number
    messageCount: number
  }
  speedSamples: Array<{
    timestamp: number // Unix ms
    tokensPerMinute: number
    costPerMinute: number
  }>
}

// History query params
export interface UsageHistoryQuery {
  dateRange?: { from: string; to: string }
  granularity: 'day' | 'week' | 'month'
  forceRefresh?: boolean
}
