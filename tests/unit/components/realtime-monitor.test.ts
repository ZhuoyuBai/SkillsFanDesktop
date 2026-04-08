import { describe, expect, it } from 'vitest'
import {
  projectFiveHourCost,
  projectFiveHourTokens,
} from '../../../src/renderer/components/usage/RealtimeMonitor'
import {
  getHistorySummaryColumnCount,
  getRealtimeMonitorColumnCount,
} from '../../../src/renderer/components/usage/usage-card-layout'

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

  it('keeps realtime stat cards at a fixed width and only switches between one-row and two-row layouts', () => {
    expect(getRealtimeMonitorColumnCount(500)).toBe(2)
    expect(getRealtimeMonitorColumnCount(1075)).toBe(2)
    expect(getRealtimeMonitorColumnCount(1076)).toBe(4)
  })

  it('keeps today summary cards fixed-width and switches between one row and two rows', () => {
    expect(getHistorySummaryColumnCount(531)).toBe(1)
    expect(getHistorySummaryColumnCount(532)).toBe(2)
  })
})
