import { describe, expect, it } from 'vitest'
import {
  buildCronExpression,
  parseCronToState,
  defaultPickerState,
  scheduleToPickerState,
  pickerStateToSchedule,
  formatScheduleDescription,
  formatNextRunTime,
  ALL_DAYS,
  WEEKDAYS
} from '../../../src/renderer/components/loop-task/schedule/schedule-utils'

describe('buildCronExpression', () => {
  it('builds daily expression', () => {
    const state = { ...defaultPickerState(), hour: 9, minute: 0, selectedDays: [...ALL_DAYS] }
    expect(buildCronExpression(state)).toBe('0 9 * * *')
  })

  it('builds weekday expression', () => {
    const state = { ...defaultPickerState(), hour: 9, minute: 0, selectedDays: [...WEEKDAYS] }
    expect(buildCronExpression(state)).toBe('0 9 * * 1-5')
  })

  it('builds specific days expression', () => {
    const state = { ...defaultPickerState(), hour: 14, minute: 30, selectedDays: [1, 3, 5] }
    expect(buildCronExpression(state)).toBe('30 14 * * 1,3,5')
  })

  it('handles Sunday conversion (ISO 7 -> cron 0)', () => {
    const state = { ...defaultPickerState(), hour: 8, minute: 0, selectedDays: [6, 7] }
    expect(buildCronExpression(state)).toBe('0 8 * * 0,6')
  })
})

describe('parseCronToState', () => {
  it('parses daily cron', () => {
    const result = parseCronToState('0 9 * * *')
    expect(result.hour).toBe(9)
    expect(result.minute).toBe(0)
    expect(result.selectedDays).toEqual(ALL_DAYS)
  })

  it('parses weekday cron', () => {
    const result = parseCronToState('0 9 * * 1-5')
    expect(result.selectedDays).toEqual(WEEKDAYS)
  })

  it('parses comma-separated days', () => {
    const result = parseCronToState('30 14 * * 1,3,5')
    expect(result.hour).toBe(14)
    expect(result.minute).toBe(30)
    expect(result.selectedDays).toEqual([1, 3, 5])
  })

  it('rounds minute to nearest 5', () => {
    const result = parseCronToState('7 9 * * *')
    expect(result.minute).toBe(5)
  })

  it('returns empty object for invalid expression', () => {
    expect(parseCronToState('invalid')).toEqual({})
  })
})

describe('scheduleToPickerState / pickerStateToSchedule', () => {
  it('roundtrips cron schedule', () => {
    const schedule = { type: 'cron' as const, cronExpression: '0 9 * * 1-5', enabled: true }
    const picker = scheduleToPickerState(schedule)
    const result = pickerStateToSchedule(picker, true)

    expect(result.type).toBe('cron')
    expect(result.cronExpression).toBe('0 9 * * 1-5')
    expect(result.enabled).toBe(true)
  })

  it('roundtrips interval schedule', () => {
    const schedule = { type: 'interval' as const, intervalMs: 7_200_000, enabled: true }
    const picker = scheduleToPickerState(schedule)
    const result = pickerStateToSchedule(picker, true)

    expect(result.type).toBe('interval')
    expect(result.intervalMs).toBe(7_200_000)
    expect(result.enabled).toBe(true)
  })
})

describe('formatScheduleDescription', () => {
  const t = (key: string) => key

  it('describes daily cron', () => {
    const schedule = { type: 'cron' as const, cronExpression: '0 9 * * *', enabled: true }
    expect(formatScheduleDescription(schedule, t)).toContain('09:00')
  })

  it('describes interval in minutes', () => {
    const schedule = { type: 'interval' as const, intervalMs: 1_800_000, enabled: true }
    expect(formatScheduleDescription(schedule, t)).toContain('30')
  })

  it('describes interval in hours', () => {
    const schedule = { type: 'interval' as const, intervalMs: 7_200_000, enabled: true }
    expect(formatScheduleDescription(schedule, t)).toContain('2')
  })
})

describe('formatNextRunTime', () => {
  const t = (key: string) => key

  it('shows overdue for past time', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(formatNextRunTime(past, t)).toBe('Overdue')
  })

  it('shows minutes for near future', () => {
    const future = new Date(Date.now() + 30 * 60_000).toISOString()
    expect(formatNextRunTime(future, t)).toContain('30')
  })
})
