import { describe, expect, it } from 'vitest'
import type { UsageRealtimeData } from '../../../src/shared/types/usage'
import {
  determineRawState,
  mergeLiveOutputState,
  unwrapUsageRealtimeData,
} from '../../../src/renderer/components/pet/usePetState'

function createRealtimeData(
  speedSamples: Array<{ tokensPerMinute: number; nonCacheTokensPerMinute?: number }>
): UsageRealtimeData {
  return {
    currentSession: {
      totalTokens: 0,
      costUsd: 0,
      startedAt: null,
    },
    today: {
      totalTokens: 0,
      costUsd: 0,
      messageCount: 0,
    },
    speedSamples: speedSamples.map((sample) => ({
      ...sample,
      nonCacheTokensPerMinute: sample.nonCacheTokensPerMinute ?? sample.tokensPerMinute,
    })),
  }
}

describe('pet state helpers', () => {
  it('unwraps successful realtime usage responses', () => {
    const data = createRealtimeData([{ tokensPerMinute: 120 }])

    expect(
      unwrapUsageRealtimeData({
        success: true,
        data,
      })
    ).toEqual(data)
  })

  it('returns null for failed or empty realtime usage responses', () => {
    expect(unwrapUsageRealtimeData({ success: false })).toBeNull()
    expect(unwrapUsageRealtimeData({ success: true })).toBeNull()
    expect(unwrapUsageRealtimeData(null)).toBeNull()
  })

  it('maps weighted token speed samples to activity states', () => {
    expect(determineRawState([])).toBe('sleeping')
    expect(determineRawState([{ tokensPerMinute: 50, nonCacheTokensPerMinute: 50 }])).toBe('normal')
    expect(
      determineRawState([
        { tokensPerMinute: 12000, nonCacheTokensPerMinute: 12000 },
        { tokensPerMinute: 15000, nonCacheTokensPerMinute: 15000 },
        { tokensPerMinute: 18000, nonCacheTokensPerMinute: 18000 },
      ])
    ).toBe('busy')
    expect(
      determineRawState([
        { tokensPerMinute: 95000, nonCacheTokensPerMinute: 95000 },
        { tokensPerMinute: 110000, nonCacheTokensPerMinute: 110000 },
        { tokensPerMinute: 130000, nonCacheTokensPerMinute: 130000 },
      ])
    ).toBe('overwhelmed')
  })

  it('uses non-cache token speed for busy tiers', () => {
    expect(
      determineRawState([
        { tokensPerMinute: 70000, nonCacheTokensPerMinute: 800 },
        { tokensPerMinute: 90000, nonCacheTokensPerMinute: 900 },
        { tokensPerMinute: 110000, nonCacheTokensPerMinute: 1000 },
      ])
    ).toBe('normal')
  })

  it('wakes the pet as soon as live terminal output starts', () => {
    expect(mergeLiveOutputState('sleeping', true)).toBe('normal')
    expect(mergeLiveOutputState('normal', true)).toBe('normal')
    expect(mergeLiveOutputState('busy', true)).toBe('busy')
    expect(mergeLiveOutputState('sleeping', false)).toBe('sleeping')
  })
})
