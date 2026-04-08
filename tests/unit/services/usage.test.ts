import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

import { getHaloDir, initializeApp, saveConfig } from '../../../src/main/services/config.service'

function writeTranscriptToDir(projectsDir: string, records: Array<{
  timestamp: string
  sessionId: string
  model?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  costUSD?: number
}>): void {
  fs.mkdirSync(projectsDir, { recursive: true })

  const lines = records.map((record) => JSON.stringify({
    type: 'assistant',
    timestamp: record.timestamp,
    sessionId: record.sessionId,
    ...(record.costUSD != null ? { costUSD: record.costUSD } : {}),
    message: {
      role: 'assistant',
      model: record.model ?? 'claude-sonnet-4',
      usage: {
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        cache_read_input_tokens: record.cacheReadTokens,
        cache_creation_input_tokens: record.cacheCreationTokens,
      },
    },
  }))

  fs.writeFileSync(path.join(projectsDir, 'session.jsonl'), `${lines.join('\n')}\n`)
}

function writeTranscript(records: Parameters<typeof writeTranscriptToDir>[1]): void {
  writeTranscriptToDir(
    path.join(getHaloDir(), 'claude-code', 'embedded', 'projects', 'test-project'),
    records
  )
}

function writeNativeTranscript(records: Parameters<typeof writeTranscriptToDir>[1]): void {
  writeTranscriptToDir(
    path.join(path.dirname(getHaloDir()), '.claude', 'projects', 'test-project'),
    records
  )
}

async function loadUsageService() {
  vi.resetModules()
  return import('../../../src/main/services/usage.service')
}

describe('Usage Service', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    await initializeApp()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets realtime current session after app restart while keeping today totals', async () => {
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'))
    const { getUsageRealtime } = await loadUsageService()

    writeTranscript([
      {
        timestamp: '2026-04-07T09:58:30.000Z',
        sessionId: 'session-before-restart',
        inputTokens: 100,
        outputTokens: 50,
      },
      {
        timestamp: '2026-04-07T10:01:10.000Z',
        sessionId: 'session-after-restart',
        inputTokens: 40,
        outputTokens: 20,
      },
    ])

    vi.setSystemTime(new Date('2026-04-07T10:02:30.000Z'))
    const realtime = getUsageRealtime()

    expect(realtime.today.totalTokens).toBe(210)
    expect(realtime.today.messageCount).toBe(2)
    expect(realtime.currentSession.totalTokens).toBe(60)
    expect(realtime.currentSession.startedAt).toBe('2026-04-07T10:01:10.000Z')
    expect(realtime.speedSamples.some((sample) => sample.tokensPerMinute > 0)).toBe(true)
  })

  it('includes the current in-progress minute in realtime speed samples', async () => {
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'))
    const { getUsageRealtime } = await loadUsageService()

    writeTranscript([
      {
        timestamp: '2026-04-07T10:01:10.000Z',
        sessionId: 'session-after-restart',
        inputTokens: 100,
        outputTokens: 20,
      },
      {
        timestamp: '2026-04-07T10:03:10.000Z',
        sessionId: 'session-after-restart',
        inputTokens: 300,
        outputTokens: 60,
      },
    ])

    vi.setSystemTime(new Date('2026-04-07T10:03:20.000Z'))
    const realtime = getUsageRealtime()

    expect(realtime.currentSession.totalTokens).toBe(480)
    expect(realtime.speedSamples).toHaveLength(5)

    const completedMinute = realtime.speedSamples.find(
      (sample) => sample.timestamp === Date.parse('2026-04-07T10:01:00.000Z')
    )
    const currentMinute = realtime.speedSamples[realtime.speedSamples.length - 1]

    expect(completedMinute?.tokensPerMinute).toBe(120)
    expect(currentMinute.timestamp).toBe(Date.parse('2026-04-07T10:03:00.000Z'))
    expect(currentMinute.tokensPerMinute).toBe(360)
  })

  it('tracks non-cache speed separately for realtime pet tiers', async () => {
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'))
    const { getUsageRealtime } = await loadUsageService()

    writeTranscript([
      {
        timestamp: '2026-04-07T10:03:10.000Z',
        sessionId: 'session-after-restart',
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 300,
        cacheCreationTokens: 180,
      },
    ])

    vi.setSystemTime(new Date('2026-04-07T10:03:20.000Z'))
    const realtime = getUsageRealtime()
    const currentMinute = realtime.speedSamples[realtime.speedSamples.length - 1]

    expect(currentMinute?.tokensPerMinute).toBe(600)
    expect(currentMinute?.nonCacheTokensPerMinute).toBe(120)
  })

  it('does not price cache tokens at the input rate when cache pricing is unavailable', async () => {
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'))
    const { getUsageRealtime } = await loadUsageService()

    writeTranscript([
      {
        timestamp: '2026-04-07T10:03:10.000Z',
        sessionId: 'session-after-restart',
        model: 'moonshot-v1-8k',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 2000,
        cacheCreationTokens: 3000,
      },
    ])

    vi.setSystemTime(new Date('2026-04-07T10:03:20.000Z'))
    const realtime = getUsageRealtime()

    expect(realtime.currentSession.totalTokens).toBe(6500)
    expect(realtime.currentSession.costUsd).toBeCloseTo(0.000972, 6)
  })

  it('uses official Claude Code transcripts for realtime in native login mode', async () => {
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'))
    const { getUsageRealtime, getUsageHistory } = await loadUsageService()
    saveConfig({ terminal: { skipClaudeLogin: false } })

    writeTranscript([
      {
        timestamp: '2026-04-07T10:03:10.000Z',
        sessionId: 'embedded-session',
        model: 'claude-sonnet-4',
        inputTokens: 80,
        outputTokens: 20,
      },
    ])

    writeNativeTranscript([
      {
        timestamp: '2026-04-07T10:04:10.000Z',
        sessionId: 'native-session',
        model: 'claude-sonnet-4-5',
        inputTokens: 120,
        outputTokens: 30,
      },
    ])

    vi.setSystemTime(new Date('2026-04-07T10:04:20.000Z'))

    const realtime = getUsageRealtime()
    const history = getUsageHistory({
      granularity: 'day',
      dateRange: { from: '2026-04-07', to: '2026-04-07' }
    })

    expect(realtime.currentSession.totalTokens).toBe(150)
    expect(realtime.currentSession.startedAt).toBe('2026-04-07T10:04:10.000Z')
    expect(realtime.today.totalTokens).toBe(150)
    expect(realtime.today.messageCount).toBe(1)
    expect(history.summary.totalMessages).toBe(2)
    expect(history.summary.totalInputTokens).toBe(200)
    expect(history.summary.totalOutputTokens).toBe(50)
  })

  it('keeps realtime scoped to embedded transcripts in custom API mode while history still merges both sources', async () => {
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'))
    const { getUsageRealtime, getUsageHistory } = await loadUsageService()
    saveConfig({ terminal: { skipClaudeLogin: true } })

    writeTranscript([
      {
        timestamp: '2026-04-07T10:04:10.000Z',
        sessionId: 'embedded-session',
        model: 'claude-sonnet-4',
        inputTokens: 90,
        outputTokens: 10,
      },
    ])

    writeNativeTranscript([
      {
        timestamp: '2026-04-07T10:05:10.000Z',
        sessionId: 'native-session',
        model: 'claude-sonnet-4-5',
        inputTokens: 120,
        outputTokens: 30,
      },
    ])

    vi.setSystemTime(new Date('2026-04-07T10:05:20.000Z'))

    const realtime = getUsageRealtime()
    const history = getUsageHistory({
      granularity: 'day',
      dateRange: { from: '2026-04-07', to: '2026-04-07' }
    })

    expect(realtime.currentSession.totalTokens).toBe(100)
    expect(realtime.currentSession.startedAt).toBe('2026-04-07T10:04:10.000Z')
    expect(realtime.today.totalTokens).toBe(100)
    expect(realtime.today.messageCount).toBe(1)
    expect(history.summary.totalMessages).toBe(2)
    expect(history.summary.totalInputTokens).toBe(210)
    expect(history.summary.totalOutputTokens).toBe(40)
  })
})
