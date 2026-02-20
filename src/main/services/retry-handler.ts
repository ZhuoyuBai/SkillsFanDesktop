/**
 * Retry Handler - Exponential backoff retry for loop tasks
 *
 * Backoff sequence (default config):
 *   Attempt 1: 30s → Attempt 2: 60s → Attempt 3: 120s → auto-pause
 *
 * After N consecutive failures, the task is automatically paused
 * and its schedule is disabled until manually resumed.
 *
 * Inspired by OpenClaw's cron retry with exponential backoff.
 */

import type { RetryConfig } from '../../shared/types/loop-task'
import { getTask, updateTask } from './loop-task.service'

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  enabled: true,
  maxRetries: 3,
  initialBackoffMs: 30_000,        // 30 seconds
  maxBackoffMs: 3_600_000,         // 1 hour
  backoffMultiplier: 2,
  pauseAfterConsecutiveFailures: 3
}

// Pending retry timers (taskId → timeout)
const retryTimers = new Map<string, NodeJS.Timeout>()

/**
 * Calculate backoff delay for a given failure count
 */
export function calculateBackoff(config: RetryConfig, failureCount: number): number {
  return Math.min(
    config.initialBackoffMs * Math.pow(config.backoffMultiplier, failureCount),
    config.maxBackoffMs
  )
}

/**
 * Handle task failure with exponential backoff retry
 *
 * @param spaceId - Space ID
 * @param taskId - Task ID
 * @param error - The error that caused the failure
 * @param triggerExecution - Callback to re-trigger task execution
 */
export function handleTaskFailure(
  spaceId: string,
  taskId: string,
  error: Error,
  triggerExecution?: (spaceId: string, taskId: string) => Promise<void>
): void {
  const task = getTask(spaceId, taskId)
  if (!task) return

  const config = task.retryConfig || DEFAULT_RETRY_CONFIG
  if (!config.enabled) {
    updateTask(spaceId, taskId, { status: 'failed' })
    return
  }

  const consecutiveFailures = (task.consecutiveFailures || 0) + 1

  // Auto-pause after too many consecutive failures
  if (consecutiveFailures >= config.pauseAfterConsecutiveFailures) {
    console.log(`[RetryHandler] Task ${taskId} auto-paused after ${consecutiveFailures} consecutive failures`)
    updateTask(spaceId, taskId, {
      status: 'paused',
      consecutiveFailures
    })
    // Cancel any pending retry timer
    cancelRetry(taskId)
    return
  }

  // Calculate backoff delay
  const backoffMs = calculateBackoff(config, consecutiveFailures - 1)
  console.log(`[RetryHandler] Task ${taskId} failed (${consecutiveFailures}/${config.pauseAfterConsecutiveFailures}), retry in ${backoffMs}ms`)

  updateTask(spaceId, taskId, {
    consecutiveFailures,
    status: 'idle'
  })

  // Schedule retry with backoff
  if (triggerExecution) {
    cancelRetry(taskId) // Cancel any existing timer
    const timer = setTimeout(() => {
      retryTimers.delete(taskId)
      triggerExecution(spaceId, taskId).catch(e => {
        console.error(`[RetryHandler] Retry failed for task ${taskId}:`, e)
      })
    }, backoffMs)
    retryTimers.set(taskId, timer)
  }
}

/**
 * Handle task success - reset consecutive failure count
 */
export function handleTaskSuccess(spaceId: string, taskId: string): void {
  const task = getTask(spaceId, taskId)
  if (task && (task.consecutiveFailures || 0) > 0) {
    updateTask(spaceId, taskId, { consecutiveFailures: 0 })
    console.log(`[RetryHandler] Task ${taskId} succeeded, failure count reset`)
  }
}

/**
 * Cancel a pending retry for a task
 */
export function cancelRetry(taskId: string): void {
  const timer = retryTimers.get(taskId)
  if (timer) {
    clearTimeout(timer)
    retryTimers.delete(taskId)
  }
}

/**
 * Cancel all pending retries (called on shutdown)
 */
export function cancelAllRetries(): void {
  for (const [taskId, timer] of Array.from(retryTimers)) {
    clearTimeout(timer)
  }
  retryTimers.clear()
}
