import { describe, expect, it } from 'vitest'
import { calculateBackoff, DEFAULT_RETRY_CONFIG } from '../../../src/main/services/retry-handler'

describe('Retry Handler', () => {
  describe('calculateBackoff', () => {
    it('returns initialBackoffMs for first failure', () => {
      expect(calculateBackoff(DEFAULT_RETRY_CONFIG, 0)).toBe(30_000)
    })

    it('doubles for each subsequent failure by default', () => {
      expect(calculateBackoff(DEFAULT_RETRY_CONFIG, 1)).toBe(60_000)
      expect(calculateBackoff(DEFAULT_RETRY_CONFIG, 2)).toBe(120_000)
    })

    it('caps at maxBackoffMs', () => {
      expect(calculateBackoff(DEFAULT_RETRY_CONFIG, 100)).toBe(3_600_000)
    })

    it('uses custom retry config', () => {
      const config = {
        ...DEFAULT_RETRY_CONFIG,
        initialBackoffMs: 1_000,
        backoffMultiplier: 3,
        maxBackoffMs: 10_000
      }

      expect(calculateBackoff(config, 0)).toBe(1_000)
      expect(calculateBackoff(config, 1)).toBe(3_000)
      expect(calculateBackoff(config, 2)).toBe(9_000)
      expect(calculateBackoff(config, 3)).toBe(10_000)
    })
  })
})
