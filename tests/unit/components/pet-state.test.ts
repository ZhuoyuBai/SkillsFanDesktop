import { describe, expect, it } from 'vitest'
import type { UsageRealtimeData } from '../../../src/shared/types/usage'
import {
  determineRawState,
  unwrapUsageRealtimeData,
} from '../../../src/renderer/components/pet/usePetState'

function createRealtimeData(
  speedSamples: Array<{ tokensPerMinute: number }>
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
    speedSamples,
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
    expect(determineRawState([{ tokensPerMinute: 50 }])).toBe('normal')
    expect(
      determineRawState([
        { tokensPerMinute: 70000 },
        { tokensPerMinute: 80000 },
        { tokensPerMinute: 90000 },
      ])
    ).toBe('busy')
    expect(
      determineRawState([
        { tokensPerMinute: 180000 },
        { tokensPerMinute: 220000 },
        { tokensPerMinute: 260000 },
      ])
    ).toBe('overwhelmed')
  })
})
