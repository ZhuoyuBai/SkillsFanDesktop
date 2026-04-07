/**
 * Usage Statistics Service
 *
 * Aggregates token usage and cost from both legacy SkillsFan conversation files
 * and embedded Claude Code transcript JSONL files used by the terminal-first UI.
 */

import { basename, join } from 'path'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { getHaloDir, getTempSpacePath } from './config.service'
import { getSpaceMetaDir, listSpaces } from './space.service'
import type {
  UsageHistoryResponse,
  UsageHistoryQuery,
  UsageRealtimeData,
  UsagePeriod,
  UsageByModel
} from '../../shared/types/usage'

interface ExtractedRecord {
  timestamp: string
  conversationId: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
}

interface FileCacheEntry {
  mtimeMs: number
  records: ExtractedRecord[]
}

interface TranscriptLine {
  type?: string
  timestamp?: string
  sessionId?: string
  costUSD?: number
  message?: {
    role?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
}

const fileCache = new Map<string, FileCacheEntry>()
const SAMPLE_INTERVAL_MS = 30_000
const MAX_SAMPLES = 10

function getConversationsDir(spacePath: string): string {
  const tempPath = getTempSpacePath()
  if (spacePath === tempPath) {
    return join(spacePath, 'conversations')
  }
  return join(getSpaceMetaDir(spacePath), 'conversations')
}

function extractModel(message: Record<string, unknown>): string {
  const thoughts = message.thoughts as Array<{ type?: string; content?: string }> | undefined
  if (!thoughts) return 'unknown'
  for (const thought of thoughts) {
    if (
      thought.type === 'system' &&
      typeof thought.content === 'string' &&
      thought.content.startsWith('Connected | Model:')
    ) {
      return thought.content.replace('Connected | Model:', '').trim()
    }
  }
  return 'unknown'
}

function extractRecordsFromConversationFile(filePath: string): ExtractedRecord[] {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as {
      messages?: Array<Record<string, unknown>>
    }
    if (!data.messages || !Array.isArray(data.messages)) return []

    const conversationId = basename(filePath, '.json')
    const records: ExtractedRecord[] = []

    for (const message of data.messages) {
      if (message.role !== 'assistant') continue

      const usage = message.tokenUsage as {
        inputTokens?: number
        outputTokens?: number
        cacheReadTokens?: number
        cacheCreationTokens?: number
        totalCostUsd?: number
      } | undefined

      if (!usage) continue

      records.push({
        timestamp: (message.timestamp as string) || '',
        conversationId,
        model: extractModel(message),
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        cacheReadTokens: usage.cacheReadTokens || 0,
        cacheCreationTokens: usage.cacheCreationTokens || 0,
        costUsd: usage.totalCostUsd || 0
      })
    }

    return records
  } catch {
    return []
  }
}

function extractRecordsFromTranscriptFile(filePath: string): ExtractedRecord[] {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const lines = raw.split('\n')
    const fallbackConversationId = basename(filePath, '.jsonl')
    const records: ExtractedRecord[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let entry: TranscriptLine
      try {
        entry = JSON.parse(trimmed) as TranscriptLine
      } catch {
        continue
      }

      const usage = entry.message?.usage
      if (
        entry.type !== 'assistant' ||
        entry.message?.role !== 'assistant' ||
        !entry.timestamp ||
        usage?.input_tokens == null
      ) {
        continue
      }

      records.push({
        timestamp: entry.timestamp,
        conversationId: entry.sessionId || fallbackConversationId,
        model: entry.message?.model || 'unknown',
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        costUsd: entry.costUSD || 0
      })
    }

    return records
  } catch {
    return []
  }
}

function collectFiles(
  dirPath: string,
  predicate: (name: string) => boolean,
  results: string[] = []
): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dirPath)
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry)
    try {
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        collectFiles(fullPath, predicate, results)
      } else if (stat.isFile() && predicate(entry)) {
        results.push(fullPath)
      }
    } catch {
      // Skip inaccessible paths
    }
  }

  return results
}

function scanConversationDir(
  dirPath: string,
  predicate: (name: string) => boolean,
  extractor: (filePath: string) => ExtractedRecord[]
): ExtractedRecord[] {
  if (!existsSync(dirPath)) return []

  const allRecords: ExtractedRecord[] = []
  const files = collectFiles(dirPath, predicate)

  for (const filePath of files) {
    try {
      const stat = statSync(filePath)
      const cached = fileCache.get(filePath)
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        allRecords.push(...cached.records)
      } else {
        const records = extractor(filePath)
        fileCache.set(filePath, { mtimeMs: stat.mtimeMs, records })
        allRecords.push(...records)
      }
    } catch {
      // Skip inaccessible files
    }
  }

  return allRecords
}

function scanLegacyConversationFiles(): ExtractedRecord[] {
  const allRecords: ExtractedRecord[] = []
  const tempPath = getTempSpacePath()

  if (existsSync(tempPath)) {
    allRecords.push(
      ...scanConversationDir(
        getConversationsDir(tempPath),
        (name) => name.endsWith('.json') && name !== 'index.json',
        extractRecordsFromConversationFile
      )
    )
  }

  for (const space of listSpaces()) {
    allRecords.push(
      ...scanConversationDir(
        getConversationsDir(space.path),
        (name) => name.endsWith('.json') && name !== 'index.json',
        extractRecordsFromConversationFile
      )
    )
  }

  return allRecords
}

function scanEmbeddedClaudeProjects(): ExtractedRecord[] {
  const projectsDir = join(getHaloDir(), 'claude-code', 'embedded', 'projects')
  return scanConversationDir(projectsDir, (name) => name.endsWith('.jsonl'), extractRecordsFromTranscriptFile)
}

function scanAllUsageRecords(forceRefresh: boolean): { records: ExtractedRecord[]; scannedFiles: number; cacheHit: boolean } {
  if (forceRefresh) {
    fileCache.clear()
  }

  const initialCacheSize = fileCache.size
  const records = [
    ...scanLegacyConversationFiles(),
    ...scanEmbeddedClaudeProjects()
  ]

  return {
    records,
    scannedFiles: fileCache.size,
    cacheHit: fileCache.size === initialCacheSize && !forceRefresh
  }
}

function getRecordTotalTokens(record: ExtractedRecord): number {
  return record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheCreationTokens
}

function getDateKey(timestamp: string, granularity: 'day' | 'week' | 'month'): string {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return 'unknown'

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')

  switch (granularity) {
    case 'day':
      return `${yyyy}-${mm}-${dd}`
    case 'week': {
      const d = new Date(date)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      d.setDate(diff)
      const wy = d.getFullYear()
      const wm = String(d.getMonth() + 1).padStart(2, '0')
      const wd = String(d.getDate()).padStart(2, '0')
      return `${wy}-${wm}-${wd}`
    }
    case 'month':
      return `${yyyy}-${mm}`
    default:
      return `${yyyy}-${mm}-${dd}`
  }
}

function isInDateRange(timestamp: string, from?: string, to?: string): boolean {
  if (!from && !to) return true
  const ts = new Date(timestamp).getTime()
  if (isNaN(ts)) return false
  if (from && ts < new Date(from).getTime()) return false
  if (to && ts > new Date(to + 'T23:59:59.999Z').getTime()) return false
  return true
}

function buildSpeedSamples(records: ExtractedRecord[]): UsageRealtimeData['speedSamples'] {
  if (records.length === 0) return []

  const now = Date.now()
  const samples: UsageRealtimeData['speedSamples'] = []

  for (let index = MAX_SAMPLES - 1; index >= 0; index--) {
    const bucketEnd = now - index * SAMPLE_INTERVAL_MS
    const bucketStart = bucketEnd - SAMPLE_INTERVAL_MS

    let bucketTokens = 0
    let bucketCost = 0

    for (const record of records) {
      const timestamp = new Date(record.timestamp).getTime()
      if (timestamp > bucketStart && timestamp <= bucketEnd) {
        bucketTokens += getRecordTotalTokens(record)
        bucketCost += record.costUsd
      }
    }

    samples.push({
      timestamp: bucketEnd,
      tokensPerMinute: Math.round((bucketTokens / SAMPLE_INTERVAL_MS) * 60_000),
      costPerMinute: Math.round(((bucketCost / SAMPLE_INTERVAL_MS) * 60_000) * 10000) / 10000
    })
  }

  return samples
}

export function getUsageHistory(query: UsageHistoryQuery): UsageHistoryResponse {
  const { records, scannedFiles, cacheHit } = scanAllUsageRecords(query.forceRefresh || false)
  const filtered = records.filter((record) =>
    record.timestamp && isInDateRange(record.timestamp, query.dateRange?.from, query.dateRange?.to)
  )

  const periodMap = new Map<string, {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
    costUsd: number
    messageCount: number
    conversationIds: Set<string>
    models: Set<string>
  }>()

  const modelMap = new Map<string, {
    inputTokens: number
    outputTokens: number
    costUsd: number
    messageCount: number
  }>()

  let totalCostUsd = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalCacheCreationTokens = 0
  let totalMessages = 0
  const allConversationIds = new Set<string>()

  for (const record of filtered) {
    totalCostUsd += record.costUsd
    totalInputTokens += record.inputTokens
    totalOutputTokens += record.outputTokens
    totalCacheReadTokens += record.cacheReadTokens
    totalCacheCreationTokens += record.cacheCreationTokens
    totalMessages++
    allConversationIds.add(record.conversationId)

    const key = getDateKey(record.timestamp, query.granularity)
    let period = periodMap.get(key)
    if (!period) {
      period = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        messageCount: 0,
        conversationIds: new Set(),
        models: new Set()
      }
      periodMap.set(key, period)
    }

    period.inputTokens += record.inputTokens
    period.outputTokens += record.outputTokens
    period.cacheReadTokens += record.cacheReadTokens
    period.cacheCreationTokens += record.cacheCreationTokens
    period.costUsd += record.costUsd
    period.messageCount++
    period.conversationIds.add(record.conversationId)
    period.models.add(record.model)

    let model = modelMap.get(record.model)
    if (!model) {
      model = { inputTokens: 0, outputTokens: 0, costUsd: 0, messageCount: 0 }
      modelMap.set(record.model, model)
    }
    model.inputTokens += record.inputTokens
    model.outputTokens += record.outputTokens
    model.costUsd += record.costUsd
    model.messageCount++
  }

  const periods: UsagePeriod[] = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      period,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheReadTokens: data.cacheReadTokens,
      cacheCreationTokens: data.cacheCreationTokens,
      costUsd: Math.round(data.costUsd * 1000000) / 1000000,
      messageCount: data.messageCount,
      conversationCount: data.conversationIds.size,
      modelsUsed: Array.from(data.models)
    }))

  const byModel: UsageByModel[] = Array.from(modelMap.entries())
    .sort(([, a], [, b]) => b.costUsd - a.costUsd)
    .map(([model, data]) => ({
      model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      costUsd: Math.round(data.costUsd * 1000000) / 1000000,
      messageCount: data.messageCount
    }))

  const timestamps = filtered.map((record) => record.timestamp).filter(Boolean).sort()

  return {
    summary: {
      totalCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalMessages,
      totalConversations: allConversationIds.size
    },
    periods,
    byModel,
    meta: {
      dateRange: {
        from: timestamps[0] || '',
        to: timestamps[timestamps.length - 1] || ''
      },
      scannedFiles,
      cacheHit
    }
  }
}

export function getUsageRealtime(): UsageRealtimeData {
  const { records } = scanAllUsageRecords(false)
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayRecords = records.filter((record) => record.timestamp && record.timestamp.startsWith(todayStr))

  let todayTokens = 0
  let todayCost = 0
  for (const record of todayRecords) {
    todayTokens += getRecordTotalTokens(record)
    todayCost += record.costUsd
  }

  const latestRecord = records.reduce<ExtractedRecord | null>((latest, record) => {
    if (!latest) return record
    return new Date(record.timestamp).getTime() > new Date(latest.timestamp).getTime() ? record : latest
  }, null)

  const currentSessionRecords = latestRecord
    ? records.filter((record) => record.conversationId === latestRecord.conversationId)
    : []

  let currentSessionTokens = 0
  let currentSessionCost = 0
  let currentSessionStartedAt: string | null = null

  for (const record of currentSessionRecords) {
    currentSessionTokens += getRecordTotalTokens(record)
    currentSessionCost += record.costUsd
    if (!currentSessionStartedAt || record.timestamp < currentSessionStartedAt) {
      currentSessionStartedAt = record.timestamp
    }
  }

  return {
    currentSession: {
      totalTokens: currentSessionTokens,
      costUsd: Math.round(currentSessionCost * 1000000) / 1000000,
      startedAt: currentSessionStartedAt
    },
    today: {
      totalTokens: todayTokens,
      costUsd: Math.round(todayCost * 1000000) / 1000000,
      messageCount: todayRecords.length
    },
    speedSamples: buildSpeedSamples(currentSessionRecords)
  }
}
