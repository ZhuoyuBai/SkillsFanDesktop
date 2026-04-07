import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

import { getHaloDir, initializeApp } from '../../../src/main/services/config.service'

function writeTranscript(records: Array<{
  timestamp: string
  sessionId: string
  inputTokens: number
  outputTokens: number
  costUSD?: number
}>): void {
  const projectsDir = path.join(getHaloDir(), 'claude-code', 'embedded', 'projects', 'test-project')
  fs.mkdirSync(projectsDir, { recursive: true })

  const lines = records.map((record) => JSON.stringify({
    type: 'assistant',
    timestamp: record.timestamp,
    sessionId: record.sessionId,
    costUSD: record.costUSD ?? 0.01,
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4',
      usage: {
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
      },
    },
  }))

  fs.writeFileSync(path.join(projectsDir, 'session.jsonl'), `${lines.join('\n')}\n`)
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

  it('only calculates speed from completed one-minute buckets', async () => {
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
    const latestClosedMinute = realtime.speedSamples[realtime.speedSamples.length - 1]

    expect(completedMinute?.tokensPerMinute).toBe(120)
    expect(latestClosedMinute.timestamp).toBe(Date.parse('2026-04-07T10:02:00.000Z'))
    expect(latestClosedMinute.tokensPerMinute).toBe(0)
  })
})
