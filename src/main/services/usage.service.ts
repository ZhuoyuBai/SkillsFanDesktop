/**
 * Usage Statistics Service
 *
 * Aggregates token usage and cost from both legacy SkillsFan conversation files
 * and embedded Claude Code transcript JSONL files used by the terminal-first UI.
 */

import { basename, join } from 'path'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { getConfig, getHaloDir, getTempSpacePath } from './config.service'
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
const SAMPLE_INTERVAL_MS = 60_000
const MAX_SAMPLES = 5
const APP_SESSION_STARTED_AT = Date.now()

// ---------------------------------------------------------------------------
// Model pricing table (USD per 1M tokens)
// Chinese vendors are calibrated from official CNY pricing tables and converted
// to USD because the usage pipeline currently reports/render costs as `costUsd`.
// ---------------------------------------------------------------------------
interface ModelPricingRates {
  input: number
  output: number
  cacheRead?: number
  cacheCreation?: number
}

interface ModelPricingTier extends ModelPricingRates {
  minInputTokens?: number
  maxInputTokens?: number
  minOutputTokens?: number
  maxOutputTokens?: number
}

interface ModelPricing extends Partial<ModelPricingRates> {
  tiers?: ModelPricingTier[]
}

const CNY_PER_USD = 7.2
const cny = (amount: number): number => amount / CNY_PER_USD

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude (https://docs.anthropic.com/en/docs/about-claude/pricing)
  'claude-opus-4-6':             { input: 5,     output: 25,  cacheRead: 0.50,  cacheCreation: 6.25 },
  'claude-opus-4-5':             { input: 5,     output: 25,  cacheRead: 0.50,  cacheCreation: 6.25 },
  'claude-opus-4-1':             { input: 15,    output: 75,  cacheRead: 1.50,  cacheCreation: 18.75 },
  'claude-opus-4':               { input: 15,    output: 75,  cacheRead: 1.50,  cacheCreation: 18.75 },
  'claude-sonnet-4-6':           { input: 3,     output: 15,  cacheRead: 0.30,  cacheCreation: 3.75 },
  'claude-sonnet-4-5':           { input: 3,     output: 15,  cacheRead: 0.30,  cacheCreation: 3.75 },
  'claude-sonnet-4':             { input: 3,     output: 15,  cacheRead: 0.30,  cacheCreation: 3.75 },
  'claude-haiku-4-5':            { input: 1,     output: 5,   cacheRead: 0.10,  cacheCreation: 1.25 },
  'claude-haiku-3-5':            { input: 0.80,  output: 4,   cacheRead: 0.08,  cacheCreation: 1.00 },

  // DeepSeek V3.2 (https://api-docs.deepseek.com/zh-cn/quick_start/pricing)
  'deepseek-chat':               { input: cny(2),   output: cny(3),  cacheRead: cny(0.2) },
  'deepseek-reasoner':           { input: cny(2),   output: cny(3),  cacheRead: cny(0.2) },

  // Kimi / Moonshot (https://platform.moonshot.cn/docs/pricing/chat)
  'kimi-k2.5':                   { input: cny(4),   output: cny(21), cacheRead: cny(0.7) },
  'kimi-k2-0905-preview':        { input: cny(4),   output: cny(16), cacheRead: cny(1) },
  'kimi-k2-0711-preview':        { input: cny(4),   output: cny(16), cacheRead: cny(1) },
  'kimi-k2-turbo-preview':       { input: cny(8),   output: cny(58), cacheRead: cny(1) },
  'kimi-k2-thinking':            { input: cny(4),   output: cny(16), cacheRead: cny(1) },
  'kimi-k2-thinking-turbo':      { input: cny(8),   output: cny(58), cacheRead: cny(1) },
  'moonshot-v1-8k':              { input: cny(2),   output: cny(10) },
  'moonshot-v1-32k':             { input: cny(5),   output: cny(20) },
  'moonshot-v1-128k':            { input: cny(10),  output: cny(30) },
  'moonshot-v1-8k-vision-preview':   { input: cny(2),  output: cny(10) },
  'moonshot-v1-32k-vision-preview':  { input: cny(5),  output: cny(20) },
  'moonshot-v1-128k-vision-preview': { input: cny(10), output: cny(30) },

  // ZhiPu GLM (https://open.bigmodel.cn/pricing)
  // Context thresholds are in tokens; e.g. [0, 32) on the pricing page means < 32k tokens.
  'glm-5-turbo': {
    tiers: [
      { maxInputTokens: 32_000, input: cny(5), output: cny(22), cacheRead: cny(1.2), cacheCreation: 0 },
      { minInputTokens: 32_000, input: cny(7), output: cny(26), cacheRead: cny(1.8), cacheCreation: 0 }
    ]
  },
  'glm-5': {
    tiers: [
      { maxInputTokens: 32_000, input: cny(4), output: cny(18), cacheRead: cny(1), cacheCreation: 0 },
      { minInputTokens: 32_000, input: cny(6), output: cny(22), cacheRead: cny(1.5), cacheCreation: 0 }
    ]
  },
  'glm-4.7-flashx':              { input: cny(0.5), output: cny(3), cacheRead: cny(0.1), cacheCreation: 0 },
  'glm-4.7-flash':               { input: 0,        output: 0,      cacheRead: 0,        cacheCreation: 0 },
  'glm-4.7': {
    tiers: [
      { maxInputTokens: 32_000, maxOutputTokens: 200, input: cny(2), output: cny(8),  cacheRead: cny(0.4), cacheCreation: 0 },
      { maxInputTokens: 32_000, minOutputTokens: 200, input: cny(3), output: cny(14), cacheRead: cny(0.6), cacheCreation: 0 },
      { minInputTokens: 32_000, maxInputTokens: 200_000, input: cny(4), output: cny(16), cacheRead: cny(0.8), cacheCreation: 0 }
    ]
  },
  'glm-4.5-air': {
    tiers: [
      { maxInputTokens: 32_000, maxOutputTokens: 200, input: cny(0.8), output: cny(2), cacheRead: cny(0.16), cacheCreation: 0 },
      { maxInputTokens: 32_000, minOutputTokens: 200, input: cny(0.8), output: cny(6), cacheRead: cny(0.16), cacheCreation: 0 },
      { minInputTokens: 32_000, maxInputTokens: 128_000, input: cny(1.2), output: cny(8), cacheRead: cny(0.24), cacheCreation: 0 }
    ]
  },

  // MiniMax (https://platform.minimaxi.com/docs/guides/pricing-paygo)
  'minimax-m2.7':                { input: cny(2.1), output: cny(8.4),  cacheRead: cny(0.42), cacheCreation: cny(2.625) },
  'minimax-m2.7-highspeed':      { input: cny(4.2), output: cny(16.8), cacheRead: cny(0.42), cacheCreation: cny(2.625) },
  'minimax-m2.5':                { input: cny(2.1), output: cny(8.4),  cacheRead: cny(0.21), cacheCreation: cny(2.625) },
  'minimax-m2.5-highspeed':      { input: cny(4.2), output: cny(16.8), cacheRead: cny(0.21), cacheCreation: cny(2.625) },
  'm2-her':                      { input: cny(2.1), output: cny(8.4),  cacheRead: 0,         cacheCreation: 0 }
}

function getModelPricing(model: string): ModelPricing | undefined {
  const normalizedModel = model.toLowerCase()
  const exactMatch = MODEL_PRICING[normalizedModel]
  if (exactMatch) return exactMatch

  const prefixMatch = Object.entries(MODEL_PRICING)
    .sort(([a], [b]) => b.length - a.length)
    .find(([key]) => normalizedModel.startsWith(key))

  return prefixMatch?.[1]
}

function resolveModelPricing(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number
): ModelPricingRates | undefined {
  if (pricing.tiers) {
    const tier = pricing.tiers.find((candidate) => {
      if (candidate.minInputTokens != null && inputTokens < candidate.minInputTokens) return false
      if (candidate.maxInputTokens != null && inputTokens >= candidate.maxInputTokens) return false
      if (candidate.minOutputTokens != null && outputTokens < candidate.minOutputTokens) return false
      if (candidate.maxOutputTokens != null && outputTokens >= candidate.maxOutputTokens) return false
      return true
    })
    if (tier) return tier
  }

  if (pricing.input == null || pricing.output == null) return undefined

  return {
    input: pricing.input,
    output: pricing.output,
    cacheRead: pricing.cacheRead,
    cacheCreation: pricing.cacheCreation
  }
}

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): number {
  const pricing = getModelPricing(model)
  if (!pricing) return 0

  const resolvedPricing = resolveModelPricing(pricing, inputTokens, outputTokens)
  if (!resolvedPricing) return 0

  const cacheReadRate = resolvedPricing.cacheRead ?? 0
  const cacheCreationRate = resolvedPricing.cacheCreation ?? 0

  return (
    inputTokens * resolvedPricing.input +
    outputTokens * resolvedPricing.output +
    cacheReadTokens * cacheReadRate +
    cacheCreationTokens * cacheCreationRate
  ) / 1_000_000
}

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

      const inTok = usage.inputTokens || 0
      const outTok = usage.outputTokens || 0
      const cacheRead = usage.cacheReadTokens || 0
      const cacheCreate = usage.cacheCreationTokens || 0
      const modelName = extractModel(message)

      records.push({
        timestamp: (message.timestamp as string) || '',
        conversationId,
        model: modelName,
        inputTokens: inTok,
        outputTokens: outTok,
        cacheReadTokens: cacheRead,
        cacheCreationTokens: cacheCreate,
        costUsd: usage.totalCostUsd || estimateCost(modelName, inTok, outTok, cacheRead, cacheCreate)
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

      const inTok = usage.input_tokens || 0
      const outTok = usage.output_tokens || 0
      const cacheRead = usage.cache_read_input_tokens || 0
      const cacheCreate = usage.cache_creation_input_tokens || 0
      const modelName = entry.message?.model || 'unknown'

      records.push({
        timestamp: entry.timestamp,
        conversationId: entry.sessionId || fallbackConversationId,
        model: modelName,
        inputTokens: inTok,
        outputTokens: outTok,
        cacheReadTokens: cacheRead,
        cacheCreationTokens: cacheCreate,
        costUsd: entry.costUSD || estimateCost(modelName, inTok, outTok, cacheRead, cacheCreate)
      })
    }

    // Deduplicate: the SDK emits two entries per assistant turn —
    // an initial one (output_tokens=0) and a final one (output_tokens>0).
    // Keep only the most complete record per (sessionId, timestamp) pair.
    const deduped = new Map<string, ExtractedRecord>()
    for (const record of records) {
      const key = `${record.conversationId}|${record.timestamp}`
      const existing = deduped.get(key)
      if (!existing || record.outputTokens > existing.outputTokens) {
        deduped.set(key, record)
      }
    }
    return Array.from(deduped.values())
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

function scanNativeClaudeProjects(): ExtractedRecord[] {
  const projectsDir = join(homedir(), '.claude', 'projects')
  return scanConversationDir(projectsDir, (name) => name.endsWith('.jsonl'), extractRecordsFromTranscriptFile)
}

interface UsageScanOptions {
  forceRefresh: boolean
  includeLegacy?: boolean
  includeEmbedded?: boolean
  includeNative?: boolean
}

function scanUsageRecords({
  forceRefresh,
  includeLegacy = true,
  includeEmbedded = true,
  includeNative = true
}: UsageScanOptions): { records: ExtractedRecord[]; scannedFiles: number; cacheHit: boolean } {
  if (forceRefresh) {
    fileCache.clear()
  }

  const initialCacheSize = fileCache.size
  const records: ExtractedRecord[] = []

  if (includeLegacy) {
    records.push(...scanLegacyConversationFiles())
  }

  if (includeEmbedded) {
    records.push(...scanEmbeddedClaudeProjects())
  }

  if (includeNative) {
    records.push(...scanNativeClaudeProjects())
  }

  return {
    records,
    scannedFiles: fileCache.size,
    cacheHit: fileCache.size === initialCacheSize && !forceRefresh
  }
}

function scanAllUsageRecords(forceRefresh: boolean): { records: ExtractedRecord[]; scannedFiles: number; cacheHit: boolean } {
  return scanUsageRecords({
    forceRefresh,
    includeLegacy: true,
    includeEmbedded: true,
    includeNative: true
  })
}

function scanRealtimeUsageRecords(): ExtractedRecord[] {
  const useNativeClaudeProjects = getConfig().terminal?.skipClaudeLogin === false

  return scanUsageRecords({
    forceRefresh: false,
    includeLegacy: true,
    includeEmbedded: !useNativeClaudeProjects,
    includeNative: useNativeClaudeProjects
  }).records
}

function getRecordTotalTokens(record: ExtractedRecord): number {
  return record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheCreationTokens
}

function getRecordNonCacheTokens(record: ExtractedRecord): number {
  return record.inputTokens + record.outputTokens
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
  const currentMinuteStart = Math.floor(now / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS
  const samples: UsageRealtimeData['speedSamples'] = []

  for (let index = MAX_SAMPLES - 1; index >= 0; index--) {
    const bucketStart = currentMinuteStart - index * SAMPLE_INTERVAL_MS
    const bucketEnd = bucketStart + SAMPLE_INTERVAL_MS

    let bucketTokens = 0
    let bucketNonCacheTokens = 0
    let bucketCost = 0

    for (const record of records) {
      const timestamp = new Date(record.timestamp).getTime()
      if (timestamp > bucketStart && timestamp <= bucketEnd) {
        bucketTokens += getRecordTotalTokens(record)
        bucketNonCacheTokens += getRecordNonCacheTokens(record)
        bucketCost += record.costUsd
      }
    }

    samples.push({
      timestamp: bucketStart,
      tokensPerMinute: Math.round((bucketTokens / SAMPLE_INTERVAL_MS) * 60_000),
      nonCacheTokensPerMinute: Math.round((bucketNonCacheTokens / SAMPLE_INTERVAL_MS) * 60_000),
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
  const records = scanRealtimeUsageRecords()
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayRecords = records.filter((record) => record.timestamp && record.timestamp.startsWith(todayStr))
  const appSessionRecords = records.filter((record) => {
    const timestamp = new Date(record.timestamp).getTime()
    return !Number.isNaN(timestamp) && timestamp >= APP_SESSION_STARTED_AT
  })

  let todayTokens = 0
  let todayCost = 0
  for (const record of todayRecords) {
    todayTokens += getRecordTotalTokens(record)
    todayCost += record.costUsd
  }

  const latestRecord = appSessionRecords.reduce<ExtractedRecord | null>((latest, record) => {
    if (!latest) return record
    return new Date(record.timestamp).getTime() > new Date(latest.timestamp).getTime() ? record : latest
  }, null)

  const currentSessionRecords = latestRecord
    ? appSessionRecords.filter((record) => record.conversationId === latestRecord.conversationId)
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
