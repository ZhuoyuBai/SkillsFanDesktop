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
import { getSpace, getSpaceMetaDir } from './space.service'
import { v4 as uuidv4 } from 'uuid'
import type {
  LoopTask,
  LoopTaskMeta,
  LoopTaskIndex,
  CreateLoopTaskConfig,
  UserStory
} from '../../shared/types/loop-task'

const INDEX_VERSION = 1

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
    writeFileSync(indexPath, JSON.stringify(index, null, 2))
    console.log(`[LoopTask] Index written with ${tasks.length} tasks`)
  } catch (error) {
    console.error('[LoopTask] Failed to write index:', error)
  }
}

function toMeta(task: LoopTask): LoopTaskMeta {
  const completedCount = task.stories.filter((s) => s.status === 'completed').length

  return {
    id: task.id,
    spaceId: task.spaceId,
    name: task.name,
    projectDir: task.projectDir,
    status: task.status,
    storyCount: task.stories.length,
    completedCount,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
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
    createdAt: now,
    updatedAt: now
  }

  const tasksDir = getTasksDir(spaceId)

  if (!existsSync(tasksDir)) {
    mkdirSync(tasksDir, { recursive: true })
  }

  writeFileSync(join(tasksDir, `${id}.json`), JSON.stringify(task, null, 2))

  // Update index
  updateIndexEntry(tasksDir, spaceId, id, toMeta(task))

  console.log(`[LoopTask] Task created: ${id}, ${task.stories.length} stories`)

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
      const task = JSON.parse(readFileSync(filePath, 'utf-8'))
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
  writeFileSync(join(tasksDir, `${taskId}.json`), JSON.stringify(updated, null, 2))

  // Update index
  updateIndexEntry(tasksDir, spaceId, taskId, toMeta(updated))

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
export function deleteTask(spaceId: string, taskId: string): boolean {
  const tasksDir = getTasksDir(spaceId)
  const filePath = join(tasksDir, `${taskId}.json`)

  if (existsSync(filePath)) {
    rmSync(filePath)

    // Update index (remove entry)
    updateIndexEntry(tasksDir, spaceId, taskId, null)

    console.log(`[LoopTask] Task deleted: ${taskId}`)
    return true
  }

  return false
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
