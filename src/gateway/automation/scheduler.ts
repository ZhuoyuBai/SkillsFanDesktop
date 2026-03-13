import type { TaskSchedule } from '../../shared/types/loop-task'
import {
  getActiveJobCount as getLegacyActiveJobCount,
  registerExecuteCallback as registerLegacyExecuteCallback,
  scheduleTask as scheduleLegacyTask,
  shutdownScheduler as shutdownLegacyScheduler,
  unscheduleTask as unscheduleLegacyTask
} from '../../main/services/scheduler.service'

export function registerExecuteCallback(
  cb: (spaceId: string, taskId: string) => Promise<void>
): void {
  registerLegacyExecuteCallback(cb)
}

export function scheduleTask(spaceId: string, taskId: string, schedule: TaskSchedule): void {
  scheduleLegacyTask(spaceId, taskId, schedule)
}

export function unscheduleTask(taskId: string): void {
  unscheduleLegacyTask(taskId)
}

export function getActiveJobCount(): number {
  return getLegacyActiveJobCount()
}

export function shutdownScheduler(): void {
  shutdownLegacyScheduler()
}
