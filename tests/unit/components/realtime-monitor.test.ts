import { describe, expect, it } from 'vitest'
import {
  projectFiveHourCost,
  projectFiveHourTokens,
} from '../../../src/renderer/components/usage/RealtimeMonitor'

describe('realtime monitor projections', () => {
  it('projects five-hour token usage from the current token speed', () => {
    expect(projectFiveHourTokens(120)).toBe(36000)
    expect(projectFiveHourTokens(0)).toBe(0)
    expect(projectFiveHourTokens(null)).toBeNull()
  })

  it('projects five-hour cost from the current cost speed', () => {
    expect(projectFiveHourCost(0.015)).toBeCloseTo(4.5, 6)
    expect(projectFiveHourCost(0)).toBe(0)
    expect(projectFiveHourCost(undefined)).toBeNull()
  })
})
