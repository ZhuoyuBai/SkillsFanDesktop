import { describe, expect, it } from 'vitest'
import { calculateMaxIterations } from '../../../src/shared/types/loop-task'

describe('calculateMaxIterations', () => {
  it('returns story count when no retry and no loop', () => {
    expect(calculateMaxIterations(5)).toBe(5)
  })

  it('returns story count when retry mode is skip', () => {
    expect(calculateMaxIterations(5, { onFailure: 'skip', maxRetries: 3 })).toBe(5)
  })

  it('multiplies by retries in retry mode', () => {
    expect(calculateMaxIterations(5, { onFailure: 'retry', maxRetries: 3 })).toBe(20)
  })

  it('multiplies by max loops when loop is enabled', () => {
    expect(calculateMaxIterations(5, undefined, { enabled: true, maxLoops: 3 })).toBe(15)
  })

  it('combines retry and loop', () => {
    expect(
      calculateMaxIterations(
        5,
        { onFailure: 'retry', maxRetries: 2 },
        { enabled: true, maxLoops: 3 }
      )
    ).toBe(45)
  })

  it('caps at 500', () => {
    expect(
      calculateMaxIterations(
        100,
        { onFailure: 'retry', maxRetries: 5 },
        { enabled: true, maxLoops: 10 }
      )
    ).toBe(500)
  })

  it('treats disabled loop as 1 loop', () => {
    expect(calculateMaxIterations(5, undefined, { enabled: false, maxLoops: 10 })).toBe(5)
  })

  it('handles zero stories', () => {
    expect(calculateMaxIterations(0)).toBe(0)
  })
})
