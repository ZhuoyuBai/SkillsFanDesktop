/**
 * Loop Task Service - Manages loop tasks with file-based persistence
 *
 * Performance optimization: Uses index.json for fast listing
 * - listTasks returns lightweight metadata (LoopTaskMeta)
 * - getTask loads full task on-demand
 * - Index is auto-rebuilt on first access if missing
 */

import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs'
import { atomicWriteJsonSync } from '../utils/atomic-write'
import { getSpace, getSpaceMetaDir, listSpaces } from './space.service'
import { v4 as uuidv4 } from 'uuid'
import {
  deleteLoopTaskGatewaySession,
  syncLoopTaskGatewaySession
} from '../../gateway/sessions'
import type {
  LoopTask,
  LoopTaskMeta,
  LoopTaskIndex,
  CreateLoopTaskConfig,
  UserStory,
  TaskSchedule
} from '../../shared/types/loop-task'
import { scheduleTask, unscheduleTask } from './scheduler.service'
import { getCurrentTask, stopTask as stopRalphTask } from './ralph'

const INDEX_VERSION = 1

function syncLoopTaskGatewaySessionSafely(task: LoopTask, reason: 'loop_task_create' | 'loop_task_update' | 'loop_task_restore'): void {
  try {
    syncLoopTaskGatewaySession(task, reason)
  } catch (error) {
    console.error(`[LoopTask] Failed to sync gateway session for task ${task.id}:`, error)
  }
}

function deleteLoopTaskGatewaySessionSafely(spaceId: string, taskId: string): void {
  try {
    deleteLoopTaskGatewaySession(spaceId, taskId)
  } catch (error) {
    console.error(`[LoopTask] Failed to delete gateway session for task ${taskId}:`, error)
  }
}

// ============================================================================
// Index Management Functions
// ============================================================================

function getTasksDir(spaceId: string): string {
  const space = getSpace(spaceId)

  if (!space) {
    throw new Error(`Space not found: ${spaceId}`)
  }

  const tasksDir = space.isTemp
    ? join(space.path, 'loop-tasks')
    : join(getSpaceMetaDir(space.path), 'loop-tasks')

  return tasksDir
}

function getIndexPath(tasksDir: string): string {
  return join(tasksDir, 'index.json')
}

function readIndex(tasksDir: string): LoopTaskIndex | null {
  const indexPath = getIndexPath(tasksDir)

  if (!existsSync(indexPath)) {
    return null
  }

  try {
    const content = readFileSync(indexPath, 'utf-8')
    const index = JSON.parse(content)

    // Validate index structure
    if (
      typeof index !== 'object' ||
      index === null ||
      typeof index.version !== 'number' ||
      !Array.isArray(index.tasks)
    ) {
      console.log('[LoopTask] Invalid index structure, will rebuild')
      return null
    }

    if (index.version !== INDEX_VERSION) {
      console.log(`[LoopTask] Index version mismatch, will rebuild`)
      return null
    }

    return index as LoopTaskIndex
  } catch (error) {
    console.error('[LoopTask] Failed to read index:', error)
    return null
  }
}

function writeIndex(tasksDir: string, tasks: LoopTaskMeta[]): void {
  const indexPath = getIndexPath(tasksDir)

  const index: LoopTaskIndex = {
    version: INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    tasks
  }

  try {
    atomicWriteJsonSync(indexPath, index)
    console.log(`[LoopTask] Index written with ${tasks.length} tasks`)
  } catch (error) {
    console.error('[LoopTask] Failed to write index:', error)
  }
}

function toMeta(task: LoopTask): LoopTaskMeta {
  const completedCount = task.stories.filter((s) => s.status === 'completed').length
  const failedCount = task.stories.filter((s) => s.status === 'failed').length

  return {
    id: task.id,
    spaceId: task.spaceId,
    name: task.name,
    projectDir: task.projectDir,
    status: task.status,
    storyCount: task.stories.length,
    completedCount,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    ...(failedCount > 0 && { failedCount }),
    ...(task.model && { model: task.model }),
    ...(task.modelSource && { modelSource: task.modelSource }),
    ...(task.schedule && { schedule: task.schedule })
  }
}

function fullScanTasks(tasksDir: string, spaceId: string): LoopTaskMeta[] {
  console.log(`[LoopTask] Full scan started for ${tasksDir}`)
  const metas: LoopTaskMeta[] = []

  if (!existsSync(tasksDir)) {
    return metas
  }

  const files = readdirSync(tasksDir).filter((f) => f.endsWith('.json') && f !== 'index.json')

  for (const file of files) {
    try {
      const content = readFileSync(join(tasksDir, file), 'utf-8')
      const task: LoopTask = JSON.parse(content)
      metas.push(toMeta(task))
    } catch (error) {
      console.error(`[LoopTask] Failed to read task ${file}:`, error)
    }
  }

  // Sort by updatedAt (most recent first)
  metas.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  console.log(`[LoopTask] Full scan completed: ${metas.length} tasks`)
  return metas
}

function updateIndexEntry(
  tasksDir: string,
  spaceId: string,
  taskId: string,
  meta: LoopTaskMeta | null
): void {
  let index = readIndex(tasksDir)

  if (!index) {
    // No index, do full scan first
    const metas = fullScanTasks(tasksDir, spaceId)
    index = { version: INDEX_VERSION, updatedAt: new Date().toISOString(), tasks: metas }
    // Continue to apply the current update below instead of returning early
  }

  const existingIndex = index.tasks.findIndex((t) => t.id === taskId)

  if (meta === null) {
    // Delete entry
    if (existingIndex !== -1) {
      index.tasks.splice(existingIndex, 1)
    }
  } else if (existingIndex !== -1) {
    // Update existing entry
    index.tasks[existingIndex] = meta
  } else {
    // Add new entry
    index.tasks.unshift(meta)
  }

  // Re-sort by updatedAt
  index.tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  writeIndex(tasksDir, index.tasks)
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * List all loop tasks for a space (returns lightweight metadata)
 */
export function listTasks(spaceId: string): LoopTaskMeta[] {
  const tasksDir = getTasksDir(spaceId)

  // Strategy 1: Try to read from index
  const index = readIndex(tasksDir)
  if (index) {
    console.log(`[LoopTask] Using index: ${index.tasks.length} tasks`)
    return index.tasks
  }

  // Strategy 2: Fallback to full scan + write index
  console.log(`[LoopTask] No index found, performing full scan`)
  const metas = fullScanTasks(tasksDir, spaceId)

  if (metas.length > 0) {
    writeIndex(tasksDir, metas)
  }

  return metas
}

/**
 * Create a new loop task
 */
export function createTask(spaceId: string, config: CreateLoopTaskConfig): LoopTask {
  const id = uuidv4()
  const now = new Date().toISOString()

  // Generate name from description if not provided
  const name = config.name || generateTaskName(config.description)

  // Generate branch name if not provided
  const branchName = config.branchName || generateBranchName(config.description)

  const task: LoopTask = {
    id,
    spaceId,
    name,
    projectDir: config.projectDir,
    branchName,
    description: config.description,
    source: config.source,
    stories: config.stories.map((s, index) => ({
      ...s,
      status: 'pending' as const,
      priority: s.priority || index + 1
    })),
    status: 'idle',
    storyCount: config.stories.length,
    completedCount: 0,
    currentStoryIndex: -1,
    iteration: 0,
    maxIterations: config.maxIterations,
    model: config.model,
    modelSource: config.modelSource,
    schedule: config.schedule || { type: 'manual', enabled: false },
    stepRetryConfig: config.stepRetryConfig || { onFailure: 'retry', maxRetries: 3 },
    loopConfig: config.loopConfig || { enabled: false, maxLoops: 1 },
    currentLoop: 0,
    createdAt: now,
    updatedAt: now
  }

  const tasksDir = getTasksDir(spaceId)

  if (!existsSync(tasksDir)) {
    mkdirSync(tasksDir, { recursive: true })
  }

  atomicWriteJsonSync(join(tasksDir, `${id}.json`), task)

  // Update index
  updateIndexEntry(tasksDir, spaceId, id, toMeta(task))

  console.log(`[LoopTask] Task created: ${id}, ${task.stories.length} stories`)

  // Start schedule if enabled
  if (task.schedule?.enabled) {
    scheduleTask(spaceId, task.id, task.schedule)
  }

  syncLoopTaskGatewaySessionSafely(task, 'loop_task_create')

  return task
}

/**
 * Get a specific loop task
 */
export function getTask(spaceId: string, taskId: string): LoopTask | null {
  const tasksDir = getTasksDir(spaceId)
  const filePath = join(tasksDir, `${taskId}.json`)

  if (existsSync(filePath)) {
    try {
      const task: LoopTask = JSON.parse(readFileSync(filePath, 'utf-8'))

      // Backward compatibility: fill defaults for new fields
      if (!task.stepRetryConfig) {
        task.stepRetryConfig = { onFailure: 'skip', maxRetries: 0 }
      } else if ('enabled' in task.stepRetryConfig && !('onFailure' in task.stepRetryConfig)) {
        // Migrate old format: enabled:boolean → onFailure:'retry'|'skip'
        const old = task.stepRetryConfig as unknown as { enabled: boolean; maxRetries: number }
        task.stepRetryConfig = { onFailure: old.enabled ? 'retry' : 'skip', maxRetries: old.maxRetries }
      }
      if (!task.loopConfig) {
        task.loopConfig = { enabled: false, maxLoops: 1 }
      }
      if (task.currentLoop === undefined) {
        task.currentLoop = 0
      }

      return task
    } catch (error) {
      console.error('[LoopTask] Failed to read task:', error)
    }
  }

  return null
}

/**
 * Update a loop task
 */
export function updateTask(
  spaceId: string,
  taskId: string,
  updates: Partial<LoopTask>
): LoopTask | null {
  const task = getTask(spaceId, taskId)

  if (!task) {
    return null
  }

  const updated: LoopTask = {
    ...task,
    ...updates,
    updatedAt: new Date().toISOString()
  }

  // Recalculate counts
  updated.storyCount = updated.stories.length
  updated.completedCount = updated.stories.filter((s) => s.status === 'completed').length

  const tasksDir = getTasksDir(spaceId)
  atomicWriteJsonSync(join(tasksDir, `${taskId}.json`), updated)

  // Update index
  updateIndexEntry(tasksDir, spaceId, taskId, toMeta(updated))

  // Update schedule if it changed
  if (updates.schedule) {
    if (updates.schedule.enabled) {
      scheduleTask(spaceId, taskId, updates.schedule)
    } else {
      unscheduleTask(taskId)
    }
  }

  syncLoopTaskGatewaySessionSafely(updated, 'loop_task_update')

  return updated
}

/**
 * Rename a loop task
 */
export function renameTask(spaceId: string, taskId: string, name: string): LoopTask | null {
  return updateTask(spaceId, taskId, { name })
}

/**
 * Delete a loop task
 */
export async function deleteTask(spaceId: string, taskId: string): Promise<boolean> {
  const tasksDir = getTasksDir(spaceId)
  const filePath = join(tasksDir, `${taskId}.json`)

  if (!existsSync(filePath)) {
    return false
  }

  const runningTask = getCurrentTask()
  if (runningTask && runningTask.id === taskId && runningTask.status === 'running') {
    console.log(`[LoopTask] Stopping running task before delete: ${taskId}`)
    await stopRalphTask(taskId)
  }

  // Stop any active schedule
  unscheduleTask(taskId)

  rmSync(filePath)

  // Update index (remove entry)
  updateIndexEntry(tasksDir, spaceId, taskId, null)
  deleteLoopTaskGatewaySessionSafely(spaceId, taskId)

  console.log(`[LoopTask] Task deleted: ${taskId}`)
  return true
}

/**
 * Add a story to a task
 */
export function addStory(
  spaceId: string,
  taskId: string,
  story: Omit<UserStory, 'id' | 'status'>
): UserStory | null {
  const task = getTask(spaceId, taskId)
  if (!task) return null

  const newStory: UserStory = {
    ...story,
    id: generateNextStoryId(task.stories),
    status: 'pending'
  }

  task.stories.push(newStory)
  updateTask(spaceId, taskId, { stories: task.stories })

  return newStory
}

/**
 * Update a story in a task
 */
export function updateStory(
  spaceId: string,
  taskId: string,
  storyId: string,
  updates: Partial<UserStory>
): boolean {
  const task = getTask(spaceId, taskId)
  if (!task) return false

  const storyIndex = task.stories.findIndex((s) => s.id === storyId)
  if (storyIndex === -1) return false

  task.stories[storyIndex] = {
    ...task.stories[storyIndex],
    ...updates
  }

  updateTask(spaceId, taskId, { stories: task.stories })
  return true
}

/**
 * Remove a story from a task
 */
export function removeStory(spaceId: string, taskId: string, storyId: string): boolean {
  const task = getTask(spaceId, taskId)
  if (!task) return false

  const storyIndex = task.stories.findIndex((s) => s.id === storyId)
  if (storyIndex === -1) return false

  task.stories.splice(storyIndex, 1)

  // Re-prioritize remaining stories
  task.stories.forEach((s, i) => {
    s.priority = i + 1
  })

  updateTask(spaceId, taskId, { stories: task.stories })
  return true
}

/**
 * Reorder stories in a task
 */
export function reorderStories(
  spaceId: string,
  taskId: string,
  fromIndex: number,
  toIndex: number
): boolean {
  const task = getTask(spaceId, taskId)
  if (!task) return false
  if (fromIndex < 0 || fromIndex >= task.stories.length) return false
  if (toIndex < 0 || toIndex >= task.stories.length) return false

  const [story] = task.stories.splice(fromIndex, 1)
  task.stories.splice(toIndex, 0, story)

  // Re-prioritize
  task.stories.forEach((s, i) => {
    s.priority = i + 1
  })

  updateTask(spaceId, taskId, { stories: task.stories })
  return true
}

/**
 * Retry a single failed story - reset to pending
 */
export function retryStory(spaceId: string, taskId: string, storyId: string): LoopTask | null {
  const task = getTask(spaceId, taskId)
  if (!task) return null

  const story = task.stories.find((s) => s.id === storyId)
  if (!story || story.status !== 'failed') return null

  story.status = 'pending'
  story.error = undefined
  story.startedAt = undefined
  story.completedAt = undefined
  story.duration = undefined
  story.retryCount = (story.retryCount || 0) + 1
  story.lastRetryAt = new Date().toISOString()

  // If task was failed, set back to idle so it can be restarted
  if (task.status === 'failed') {
    task.status = 'idle'
  }

  return updateTask(spaceId, taskId, { stories: task.stories, status: task.status })
}

/**
 * Retry all failed stories in a task
 */
export function retryFailed(spaceId: string, taskId: string): LoopTask | null {
  const task = getTask(spaceId, taskId)
  if (!task) return null

  let anyRetried = false
  for (const story of task.stories) {
    if (story.status === 'failed') {
      story.status = 'pending'
      story.error = undefined
      story.startedAt = undefined
      story.completedAt = undefined
      story.duration = undefined
      story.retryCount = (story.retryCount || 0) + 1
      story.lastRetryAt = new Date().toISOString()
      anyRetried = true
    }
  }

  if (!anyRetried) return task

  // If task was failed, set back to idle
  if (task.status === 'failed') {
    task.status = 'idle'
  }

  return updateTask(spaceId, taskId, { stories: task.stories, status: task.status })
}

/**
 * Reset all stories and rerun the task from scratch
 */
export function resetAndRerun(spaceId: string, taskId: string): LoopTask | null {
  const task = getTask(spaceId, taskId)
  if (!task) return null

  // Only allow reset when not running
  if (task.status === 'running') return null

  for (const story of task.stories) {
    story.status = 'pending'
    story.error = undefined
    story.startedAt = undefined
    story.completedAt = undefined
    story.duration = undefined
  }

  return updateTask(spaceId, taskId, {
    stories: task.stories,
    status: 'idle',
    iteration: 0,
    currentStoryIndex: -1,
    currentLoop: 0,
    startedAt: undefined,
    completedAt: undefined,
    consecutiveFailures: 0
  })
}

/**
 * List all scheduled tasks across all spaces
 */
export function listAllScheduledTasks(): (LoopTaskMeta & { spaceName?: string })[] {
  const spaces = listSpaces()
  const result: (LoopTaskMeta & { spaceName?: string })[] = []

  for (const space of spaces) {
    try {
      const tasks = listTasks(space.id)
      for (const task of tasks) {
        if (task.schedule && task.schedule.enabled && task.schedule.type !== 'manual') {
          result.push({ ...task, spaceName: space.name })
        }
      }
    } catch {
      // Skip spaces that fail to load
    }
  }

  return result
}

/**
 * Recover interrupted tasks after app crash/restart.
 * Resets stale running task/story states back to idle/pending.
 */
export function recoverInterruptedTasks(): { recoveredCount: number; recoveredTaskIds: string[] } {
  const spaces = listSpaces()
  const recoveredTaskIds: string[] = []

  for (const space of spaces) {
    let taskMetas: LoopTaskMeta[] = []
    try {
      taskMetas = listTasks(space.id)
    } catch (error) {
      console.error(`[LoopTask] Failed to list tasks for recovery, space=${space.id}:`, error)
      continue
    }

    for (const meta of taskMetas) {
      const task = getTask(space.id, meta.id)
      if (!task) continue

      const hasRunningStory = task.stories.some((story) => story.status === 'running')
      if (task.status !== 'running' && !hasRunningStory) {
        continue
      }

      const recoveredStories = task.stories.map((story) => {
        if (story.status !== 'running') {
          return story
        }
        return {
          ...story,
          status: 'pending' as const,
          startedAt: undefined,
          completedAt: undefined,
          duration: undefined
        }
      })

      updateTask(space.id, task.id, {
        status: 'idle',
        stories: recoveredStories,
        currentStoryIndex: -1,
        completedAt: undefined
      })

      recoveredTaskIds.push(task.id)
      console.log(`[LoopTask] Recovered interrupted task: ${task.id}`)
    }
  }

  return {
    recoveredCount: recoveredTaskIds.length,
    recoveredTaskIds
  }
}

export function syncAllTasksToGatewaySessions(): { syncedCount: number; syncedTaskIds: string[] } {
  const spaces = listSpaces()
  const syncedTaskIds: string[] = []

  for (const space of spaces) {
    let taskMetas: LoopTaskMeta[] = []
    try {
      taskMetas = listTasks(space.id)
    } catch (error) {
      console.error(`[LoopTask] Failed to list tasks for gateway sync, space=${space.id}:`, error)
      continue
    }

    for (const meta of taskMetas) {
      const task = getTask(space.id, meta.id)
      if (!task) {
        continue
      }

      syncLoopTaskGatewaySessionSafely(task, 'loop_task_restore')
      syncedTaskIds.push(task.id)
    }
  }

  return {
    syncedCount: syncedTaskIds.length,
    syncedTaskIds
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateTaskName(description: string): string {
  if (!description) return 'New Task'
  // Take first 30 chars of description
  const name = description.slice(0, 30)
  return description.length > 30 ? name + '...' : name
}

function generateBranchName(description: string): string {
  if (!description) return `ralph/task-${Date.now()}`

  // Convert to lowercase, replace spaces with hyphens, remove special chars
  const slug = description
    .toLowerCase()
    .slice(0, 30)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return `ralph/${slug || 'task'}`
}

function generateNextStoryId(stories: UserStory[]): string {
  const maxId = stories.reduce((max, s) => {
    const match = s.id.match(/US-(\d+)/)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)

  return `US-${String(maxId + 1).padStart(3, '0')}`
}
