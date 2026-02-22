/**
 * Schedule utility functions - shared cron generation/parsing and formatting
 */

import type { TaskSchedule } from '../../../../shared/types/loop-task'

// ============================================================================
// Types
// ============================================================================

export interface SchedulePickerState {
  mode: 'fixed' | 'interval'
  // Fixed schedule fields
  hour: number       // 0-23
  minute: number     // 0-55 (step 5)
  selectedDays: number[]  // 1=Mon, 2=Tue, ..., 7=Sun (ISO weekday)
  // Interval fields
  intervalMs: number
}

// ============================================================================
// Constants
// ============================================================================

/** i18n keys for weekday abbreviations (ISO order: Mon=1 ... Sun=7) */
export const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** All 7 days selected */
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

/** Weekdays (Mon-Fri) */
export const WEEKDAYS = [1, 2, 3, 4, 5]

// ============================================================================
// Cron Generation
// ============================================================================

/**
 * Build a cron expression from the picker state
 */
export function buildCronExpression(state: SchedulePickerState): string {
  const min = state.minute
  const hour = state.hour

  // Convert ISO weekday (1=Mon...7=Sun) to cron weekday (0=Sun, 1=Mon...6=Sat)
  const cronDays = state.selectedDays
    .map(d => d === 7 ? 0 : d)
    .sort((a, b) => a - b)

  // All 7 days → use *
  if (cronDays.length === 7) {
    return `${min} ${hour} * * *`
  }

  // Weekdays Mon-Fri → use 1-5
  if (
    cronDays.length === 5 &&
    [1, 2, 3, 4, 5].every(d => cronDays.includes(d))
  ) {
    return `${min} ${hour} * * 1-5`
  }

  return `${min} ${hour} * * ${cronDays.join(',')}`
}

// ============================================================================
// Cron Parsing
// ============================================================================

/**
 * Parse a cron expression back into picker state fields.
 * Returns a partial state for fields it can determine.
 */
export function parseCronToState(expr: string): Partial<SchedulePickerState> {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return {}

  const [minStr, hourStr, , , dowStr] = parts

  // Check if hour/minute are simple numbers (not ranges or wildcards)
  if (minStr === '*' || hourStr === '*') {
    // Complex expression we can't represent, return partial
    return {}
  }

  const minute = parseInt(minStr, 10)
  const hour = parseInt(hourStr, 10)

  if (isNaN(minute) || isNaN(hour)) return {}

  // Round minute to nearest 5
  const roundedMinute = Math.round(minute / 5) * 5

  // Parse day-of-week
  let selectedDays: number[]
  if (dowStr === '*') {
    selectedDays = [...ALL_DAYS]
  } else if (dowStr === '1-5') {
    selectedDays = [...WEEKDAYS]
  } else if (dowStr === '0-6' || dowStr === '0-7') {
    selectedDays = [...ALL_DAYS]
  } else {
    // Parse comma-separated days, possibly with ranges
    selectedDays = []
    for (const part of dowStr.split(',')) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number)
        for (let i = start; i <= end; i++) {
          selectedDays.push(i === 0 ? 7 : i) // cron Sun=0 → ISO Sun=7
        }
      } else {
        const n = parseInt(part, 10)
        if (!isNaN(n)) {
          selectedDays.push(n === 0 ? 7 : n)
        }
      }
    }
    // Deduplicate and sort
    selectedDays = [...new Set(selectedDays)].sort((a, b) => a - b)
  }

  return {
    hour,
    minute: roundedMinute,
    selectedDays
  }
}

/**
 * Create a default picker state
 */
export function defaultPickerState(): SchedulePickerState {
  return {
    mode: 'fixed',
    hour: 9,
    minute: 0,
    selectedDays: [...ALL_DAYS],
    intervalMs: 3600000
  }
}

/**
 * Initialize picker state from an existing TaskSchedule
 */
export function scheduleToPickerState(schedule: TaskSchedule): SchedulePickerState {
  const base = defaultPickerState()

  if (schedule.type === 'interval') {
    return {
      ...base,
      mode: 'interval',
      intervalMs: schedule.intervalMs || 3600000
    }
  }

  if (schedule.type === 'cron' && schedule.cronExpression) {
    const parsed = parseCronToState(schedule.cronExpression)
    return {
      ...base,
      mode: 'fixed',
      hour: parsed.hour ?? 9,
      minute: parsed.minute ?? 0,
      selectedDays: parsed.selectedDays ?? [...ALL_DAYS]
    }
  }

  return base
}

/**
 * Convert picker state to TaskSchedule
 */
export function pickerStateToSchedule(
  state: SchedulePickerState,
  enabled: boolean
): TaskSchedule {
  if (state.mode === 'interval') {
    return {
      type: 'interval',
      intervalMs: state.intervalMs,
      enabled
    }
  }

  return {
    type: 'cron',
    cronExpression: buildCronExpression(state),
    enabled
  }
}

// ============================================================================
// Formatting
// ============================================================================

type TFunction = (key: string) => string

/**
 * Human-readable schedule description
 */
export function formatScheduleDescription(schedule: TaskSchedule, t: TFunction): string {
  if (schedule.type === 'cron' && schedule.cronExpression) {
    return describeCron(schedule.cronExpression, t)
  }
  if (schedule.type === 'interval' && schedule.intervalMs) {
    const minutes = Math.round(schedule.intervalMs / 60000)
    if (minutes < 60) {
      return t('Every {{count}} minutes').replace('{{count}}', String(minutes))
    }
    const hours = Math.round(minutes / 60)
    if (hours < 24) {
      return t('Every {{count}} hours').replace('{{count}}', String(hours))
    }
    const days = Math.round(hours / 24)
    return t('Every {{count}} days').replace('{{count}}', String(days))
  }
  return schedule.type
}

function describeCron(expr: string, t: TFunction): string {
  const parts = expr.split(' ')
  if (parts.length !== 5) return expr

  const [min, hour, , , dow] = parts

  // Every hour
  if (expr === '0 * * * *') return t('Runs every hour')

  if (min === '*' || hour === '*') return expr

  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`

  // Daily
  if (dow === '*') {
    return t('Runs daily at {{time}}').replace('{{time}}', time)
  }

  // Weekdays
  if (dow === '1-5') {
    return t('Runs on weekdays at {{time}}').replace('{{time}}', time)
  }

  // Single day
  const dayNames: Record<string, string> = {
    '0': t('Sun'), '1': t('Mon'), '2': t('Tue'), '3': t('Wed'),
    '4': t('Thu'), '5': t('Fri'), '6': t('Sat'), '7': t('Sun')
  }

  // Multiple specific days
  const dayList = dow.split(',')
  if (dayList.length === 1) {
    const dayName = dayNames[dayList[0]] || dayList[0]
    return t('Runs every {{day}} at {{time}}')
      .replace('{{day}}', dayName)
      .replace('{{time}}', time)
  }

  const dayNameList = dayList.map(d => dayNames[d] || d).join(', ')
  return t('Runs on {{days}} at {{time}}')
    .replace('{{days}}', dayNameList)
    .replace('{{time}}', time)
}

/**
 * Format next run time as relative time string
 */
export function formatNextRunTime(isoString: string, t: TFunction): string {
  const next = new Date(isoString)
  const now = new Date()
  const diffMs = next.getTime() - now.getTime()

  if (diffMs < 0) return t('Overdue')

  const diffMins = Math.round(diffMs / 60000)
  if (diffMins < 1) return t('Less than 1 min')
  if (diffMins < 60) return t('In {{count}} min').replace('{{count}}', String(diffMins))

  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return t('In {{count}} hours').replace('{{count}}', String(diffHours))

  const diffDays = Math.round(diffHours / 24)
  return t('In {{count}} days').replace('{{count}}', String(diffDays))
}
