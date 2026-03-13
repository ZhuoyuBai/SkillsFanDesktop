import type {
  CreateLoopTaskConfig,
  LoopTask,
  LoopTaskMeta,
  UserStory
} from '../../shared/types/loop-task'
import { canDelegateGatewayCommands, executeGatewayCommand } from '../commands'
import {
  addStory as addLegacyStory,
  createTask as createLegacyTask,
  deleteTask as deleteLegacyTask,
  getTask as getLegacyTask,
  listAllScheduledTasks as listLegacyScheduledTasks,
  listTasks as listLegacyTasks,
  recoverInterruptedTasks as recoverLegacyInterruptedTasks,
  removeStory as removeLegacyStory,
  renameTask as renameLegacyTask,
  reorderStories as reorderLegacyStories,
  resetAndRerun as resetLegacyTaskAndRerun,
  retryFailed as retryLegacyFailedStories,
  retryStory as retryLegacyStory,
  syncAllTasksToGatewaySessions as syncLegacyLoopTaskSessions,
  updateStory as updateLegacyStory,
  updateTask as updateLegacyTask
} from '../../main/services/loop-task.service'
import { listGatewaySessions, getGatewaySession } from '../sessions/store'
import type { GatewaySessionState } from '../sessions/types'

export type {
  CreateLoopTaskConfig,
  LoopTask,
  LoopTaskMeta,
  UserStory
}

export function listTasks(spaceId: string): LoopTaskMeta[] {
  return listLegacyTasks(spaceId)
}

export function listAllScheduledTasks(): (LoopTaskMeta & { spaceName?: string })[] {
  return listLegacyScheduledTasks()
}

export function createTaskLocally(spaceId: string, config: CreateLoopTaskConfig): LoopTask {
  return createLegacyTask(spaceId, config)
}

export async function createTask(spaceId: string, config: CreateLoopTaskConfig): Promise<LoopTask> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('loop-task.create', {
      spaceId,
      config
    })
  }

  return createTaskLocally(spaceId, config)
}

export function getTask(spaceId: string, taskId: string): LoopTask | null {
  return getLegacyTask(spaceId, taskId)
}

export function updateTaskLocally(spaceId: string, taskId: string, updates: Partial<LoopTask>): LoopTask | null {
  return updateLegacyTask(spaceId, taskId, updates)
}

export async function updateTask(
  spaceId: string,
  taskId: string,
  updates: Partial<LoopTask>
): Promise<LoopTask | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('loop-task.update', {
      spaceId,
      taskId,
      updates
    })
  }

  return updateTaskLocally(spaceId, taskId, updates)
}

export function renameTaskLocally(spaceId: string, taskId: string, name: string): LoopTask | null {
  return renameLegacyTask(spaceId, taskId, name)
}

export async function renameTask(spaceId: string, taskId: string, name: string): Promise<LoopTask | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('loop-task.rename', {
      spaceId,
      taskId,
      name
    })
  }

  return renameTaskLocally(spaceId, taskId, name)
}

export async function deleteTaskLocally(spaceId: string, taskId: string): Promise<boolean> {
  return await deleteLegacyTask(spaceId, taskId)
}

export async function deleteTask(spaceId: string, taskId: string): Promise<boolean> {
  if (canDelegateGatewayCommands()) {
    await executeGatewayCommand('loop-task.delete', {
      spaceId,
      taskId
    })
    return true
  }

  return await deleteTaskLocally(spaceId, taskId)
}

export function addStoryLocally(
  spaceId: string,
  taskId: string,
  story: Omit<UserStory, 'id' | 'status'>
): UserStory | null {
  return addLegacyStory(spaceId, taskId, story)
}

export async function addStory(
  spaceId: string,
  taskId: string,
  story: Omit<UserStory, 'id' | 'status'>
): Promise<UserStory | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('loop-task.add-story', {
      spaceId,
      taskId,
      story
    })
  }

  return addStoryLocally(spaceId, taskId, story)
}

export function updateStoryLocally(
  spaceId: string,
  taskId: string,
  storyId: string,
  updates: Partial<UserStory>
): boolean {
  return updateLegacyStory(spaceId, taskId, storyId, updates)
}

export async function updateStory(
  spaceId: string,
  taskId: string,
  storyId: string,
  updates: Partial<UserStory>
): Promise<boolean> {
  if (canDelegateGatewayCommands()) {
    await executeGatewayCommand('loop-task.update-story', {
      spaceId,
      taskId,
      storyId,
      updates
    })
    return true
  }

  return updateStoryLocally(spaceId, taskId, storyId, updates)
}

export function removeStoryLocally(spaceId: string, taskId: string, storyId: string): boolean {
  return removeLegacyStory(spaceId, taskId, storyId)
}

export async function removeStory(spaceId: string, taskId: string, storyId: string): Promise<boolean> {
  if (canDelegateGatewayCommands()) {
    await executeGatewayCommand('loop-task.remove-story', {
      spaceId,
      taskId,
      storyId
    })
    return true
  }

  return removeStoryLocally(spaceId, taskId, storyId)
}

export function reorderStoriesLocally(
  spaceId: string,
  taskId: string,
  fromIndex: number,
  toIndex: number
): boolean {
  return reorderLegacyStories(spaceId, taskId, fromIndex, toIndex)
}

export async function reorderStories(
  spaceId: string,
  taskId: string,
  fromIndex: number,
  toIndex: number
): Promise<boolean> {
  if (canDelegateGatewayCommands()) {
    await executeGatewayCommand('loop-task.reorder-stories', {
      spaceId,
      taskId,
      fromIndex,
      toIndex
    })
    return true
  }

  return reorderStoriesLocally(spaceId, taskId, fromIndex, toIndex)
}

export function retryStoryLocally(spaceId: string, taskId: string, storyId: string): LoopTask | null {
  return retryLegacyStory(spaceId, taskId, storyId)
}

export async function retryStory(spaceId: string, taskId: string, storyId: string): Promise<LoopTask | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('loop-task.retry-story', {
      spaceId,
      taskId,
      storyId
    })
  }

  return retryStoryLocally(spaceId, taskId, storyId)
}

export function retryFailedLocally(spaceId: string, taskId: string): LoopTask | null {
  return retryLegacyFailedStories(spaceId, taskId)
}

export async function retryFailed(spaceId: string, taskId: string): Promise<LoopTask | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('loop-task.retry-failed', {
      spaceId,
      taskId
    })
  }

  return retryFailedLocally(spaceId, taskId)
}

export function resetAndRerunLocally(spaceId: string, taskId: string): LoopTask | null {
  return resetLegacyTaskAndRerun(spaceId, taskId)
}

export async function resetAndRerun(spaceId: string, taskId: string): Promise<LoopTask | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('loop-task.reset-all', {
      spaceId,
      taskId
    })
  }

  return resetAndRerunLocally(spaceId, taskId)
}

export function recoverInterruptedTasks(): { recoveredCount: number; recoveredTaskIds: string[] } {
  return recoverLegacyInterruptedTasks()
}

export function syncAllGatewayLoopTaskSessions(): { syncedCount: number; syncedTaskIds: string[] } {
  return syncLegacyLoopTaskSessions()
}

export interface LoopTaskDiagnosticEntry {
  session: GatewaySessionState
  taskId?: string
  taskName?: string
  taskStatus?: string
  storyCount?: number
  completedCount?: number
}

export function getLoopTasksBySessionKey(sessionKey: string): LoopTaskDiagnosticEntry[] {
  const directSession = getGatewaySession(sessionKey)
  if (directSession && directSession.metadata?.automationKind === 'loop-task') {
    return [{
      session: directSession,
      taskId: directSession.metadata.taskId as string | undefined,
      taskName: directSession.metadata.taskName as string | undefined,
      taskStatus: directSession.metadata.taskStatus as string | undefined,
      storyCount: directSession.metadata.storyCount as number | undefined,
      completedCount: directSession.metadata.completedCount as number | undefined
    }]
  }

  const automationSessions = listGatewaySessions({ channel: 'automation' })
  return automationSessions
    .filter((s) => {
      if (s.metadata?.automationKind !== 'loop-task') return false
      return s.sessionKey === sessionKey || s.mainSessionKey === sessionKey
    })
    .map((s) => ({
      session: s,
      taskId: s.metadata?.taskId as string | undefined,
      taskName: s.metadata?.taskName as string | undefined,
      taskStatus: s.metadata?.taskStatus as string | undefined,
      storyCount: s.metadata?.storyCount as number | undefined,
      completedCount: s.metadata?.completedCount as number | undefined
    }))
}
