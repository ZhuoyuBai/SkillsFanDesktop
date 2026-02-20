/**
 * Scheduler Service - Cron expression and interval scheduling for loop tasks
 *
 * Uses the `croner` library for cron expression parsing and scheduling.
 * Each task with an active schedule gets a dedicated cron job or interval timer.
 *
 * Features:
 * - Cron expressions (e.g., '0 9 * * 1-5' = weekdays 9am)
 * - Fixed interval scheduling (minimum 1 minute)
 * - Skip tasks that are already running or paused
 * - Integration with retry-handler for failure recovery
 *
 * Inspired by OpenClaw's cron service with stagger and timer clamping.
 */

import { Cron } from 'croner'
import type { TaskSchedule } from '../../shared/types/loop-task'
import { getTask, updateTask } from './loop-task.service'
import { handleTaskFailure } from './retry-handler'

interface ScheduledJob {
  taskId: string
  spaceId: string
  cron: Cron | null
  intervalTimer: NodeJS.Timeout | null
}

// Active scheduled jobs
const activeJobs = new Map<string, ScheduledJob>()

// Execute callback (registered by Ralph IPC handler)
let executeCallback: ((spaceId: string, taskId: string) => Promise<void>) | null = null

/**
 * Register the callback that actually executes a task.
 * Called by the Ralph module during initialization.
 */
export function registerExecuteCallback(
  cb: (spaceId: string, taskId: string) => Promise<void>
): void {
  executeCallback = cb
  console.log('[Scheduler] Execute callback registered')
}

/**
 * Start scheduling a task
 */
export function scheduleTask(
  spaceId: string,
  taskId: string,
  schedule: TaskSchedule
): void {
  // Always unschedule first (idempotent)
  unscheduleTask(taskId)

  if (!schedule.enabled || schedule.type === 'manual') return

  const job: ScheduledJob = {
    taskId,
    spaceId,
    cron: null,
    intervalTimer: null
  }

  if (schedule.type === 'cron' && schedule.cronExpression) {
    try {
      const timezone = schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      job.cron = new Cron(schedule.cronExpression, {
        timezone
      }, () => {
        triggerTaskExecution(spaceId, taskId)
      })

      // Calculate and store next scheduled time
      const next = job.cron.nextRun()
      if (next) {
        updateTaskScheduleInfo(spaceId, taskId, { nextScheduledAt: next.toISOString() })
      }

      console.log(`[Scheduler] Cron scheduled: task=${taskId}, expr="${schedule.cronExpression}", tz=${timezone}, next=${next?.toISOString()}`)
    } catch (e) {
      console.error(`[Scheduler] Invalid cron expression for task ${taskId}: "${schedule.cronExpression}"`, e)
      return
    }
  }

  if (schedule.type === 'interval' && schedule.intervalMs && schedule.intervalMs >= 60000) {
    job.intervalTimer = setInterval(
      () => triggerTaskExecution(spaceId, taskId),
      schedule.intervalMs
    )
    console.log(`[Scheduler] Interval scheduled: task=${taskId}, interval=${schedule.intervalMs}ms`)
  }

  activeJobs.set(taskId, job)
}

/**
 * Stop scheduling a task
 */
export function unscheduleTask(taskId: string): void {
  const job = activeJobs.get(taskId)
  if (!job) return

  if (job.cron) {
    job.cron.stop()
  }
  if (job.intervalTimer) {
    clearInterval(job.intervalTimer)
  }

  activeJobs.delete(taskId)
  console.log(`[Scheduler] Unscheduled task: ${taskId}`)
}

/**
 * Trigger task execution (skip if already running or paused)
 */
async function triggerTaskExecution(spaceId: string, taskId: string): Promise<void> {
  const task = getTask(spaceId, taskId)
  if (!task) {
    unscheduleTask(taskId)
    return
  }

  // Don't trigger if task is already running or paused
  if (task.status === 'running' || task.status === 'paused') {
    console.log(`[Scheduler] Skipping task ${taskId} (status: ${task.status})`)
    return
  }

  // Update last scheduled time
  updateTaskScheduleInfo(spaceId, taskId, {
    lastScheduledAt: new Date().toISOString()
  })

  // Update next scheduled time for cron jobs
  const job = activeJobs.get(taskId)
  if (job?.cron) {
    const next = job.cron.nextRun()
    if (next) {
      updateTaskScheduleInfo(spaceId, taskId, { nextScheduledAt: next.toISOString() })
    }
  }

  if (!executeCallback) {
    console.warn(`[Scheduler] No execute callback registered, cannot run task ${taskId}`)
    return
  }

  console.log(`[Scheduler] Triggering task execution: ${taskId}`)
  try {
    await executeCallback(spaceId, taskId)
  } catch (e) {
    console.error(`[Scheduler] Task execution failed: ${taskId}`, e)
    handleTaskFailure(spaceId, taskId, e as Error, triggerTaskExecution)
  }
}

/**
 * Update schedule-related fields on a task
 */
function updateTaskScheduleInfo(
  spaceId: string,
  taskId: string,
  scheduleUpdates: { lastScheduledAt?: string; nextScheduledAt?: string }
): void {
  const task = getTask(spaceId, taskId)
  if (!task?.schedule) return

  const updatedSchedule = { ...task.schedule, ...scheduleUpdates }
  updateTask(spaceId, taskId, { schedule: updatedSchedule })
}

/**
 * Get the number of active scheduled jobs
 */
export function getActiveJobCount(): number {
  return activeJobs.size
}

/**
 * Shutdown all scheduled jobs (called on app exit)
 */
export function shutdownScheduler(): void {
  for (const [taskId] of Array.from(activeJobs)) {
    unscheduleTask(taskId)
  }
  console.log('[Scheduler] All jobs stopped')
}
