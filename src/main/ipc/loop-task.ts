/**
 * Loop Task IPC Handlers
 * Handles IPC communication for loop task persistence and management
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs-extra'
import * as path from 'path'
import {
  listTasks,
  createTask,
  getTask,
  updateTask,
  renameTask,
  deleteTask,
  addStory,
  updateStory,
  removeStory,
  reorderStories,
  retryStory,
  retryFailed
} from '../services/loop-task.service'
import type { CreateLoopTaskConfig, LoopTask, UserStory } from '../../shared/types/loop-task'

export function registerLoopTaskHandlers(window: BrowserWindow | null): void {
  // List all tasks for a space
  ipcMain.handle('loop-task:list', async (_event, spaceId: string) => {
    try {
      const tasks = listTasks(spaceId)
      return { success: true, data: tasks }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[LoopTask IPC] list error:', err)
      return { success: false, error: err.message }
    }
  })

  // Create a new task
  ipcMain.handle(
    'loop-task:create',
    async (_event, spaceId: string, config: CreateLoopTaskConfig) => {
      try {
        const task = createTask(spaceId, config)
        return { success: true, data: task }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] create error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Get a specific task
  ipcMain.handle('loop-task:get', async (_event, spaceId: string, taskId: string) => {
    try {
      const task = getTask(spaceId, taskId)
      return { success: true, data: task }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[LoopTask IPC] get error:', err)
      return { success: false, error: err.message }
    }
  })

  // Update a task
  ipcMain.handle(
    'loop-task:update',
    async (_event, spaceId: string, taskId: string, updates: Partial<LoopTask>) => {
      try {
        const task = updateTask(spaceId, taskId, updates)
        return { success: true, data: task }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] update error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Rename a task
  ipcMain.handle(
    'loop-task:rename',
    async (_event, spaceId: string, taskId: string, name: string) => {
      try {
        const task = renameTask(spaceId, taskId, name)
        return { success: true, data: task }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] rename error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Delete a task
  ipcMain.handle('loop-task:delete', async (_event, spaceId: string, taskId: string) => {
    try {
      const result = deleteTask(spaceId, taskId)
      return { success: true, data: result }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[LoopTask IPC] delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // Add a story to a task
  ipcMain.handle(
    'loop-task:add-story',
    async (
      _event,
      spaceId: string,
      taskId: string,
      story: Omit<UserStory, 'id' | 'status'>
    ) => {
      try {
        const newStory = addStory(spaceId, taskId, story)
        return { success: true, data: newStory }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] add-story error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Update a story in a task
  ipcMain.handle(
    'loop-task:update-story',
    async (
      _event,
      spaceId: string,
      taskId: string,
      storyId: string,
      updates: Partial<UserStory>
    ) => {
      try {
        const result = updateStory(spaceId, taskId, storyId, updates)
        return { success: true, data: result }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] update-story error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Remove a story from a task
  ipcMain.handle(
    'loop-task:remove-story',
    async (_event, spaceId: string, taskId: string, storyId: string) => {
      try {
        const result = removeStory(spaceId, taskId, storyId)
        return { success: true, data: result }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] remove-story error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Reorder stories in a task
  ipcMain.handle(
    'loop-task:reorder-stories',
    async (_event, spaceId: string, taskId: string, fromIndex: number, toIndex: number) => {
      try {
        const result = reorderStories(spaceId, taskId, fromIndex, toIndex)
        return { success: true, data: result }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] reorder-stories error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Retry a single failed story
  ipcMain.handle(
    'loop-task:retry-story',
    async (_event, spaceId: string, taskId: string, storyId: string) => {
      try {
        const task = retryStory(spaceId, taskId, storyId)
        if (task) {
          return { success: true, data: task }
        }
        return { success: false, error: 'Story not found or not in failed state' }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] retry-story error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Retry all failed stories in a task
  ipcMain.handle(
    'loop-task:retry-failed',
    async (_event, spaceId: string, taskId: string) => {
      try {
        const task = retryFailed(spaceId, taskId)
        if (task) {
          return { success: true, data: task }
        }
        return { success: false, error: 'Task not found' }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] retry-failed error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Export prd.json - generate prd.json file for wizard step 2->3
  ipcMain.handle(
    'loop-task:export-prd',
    async (
      _event,
      config: {
        projectDir: string
        description: string
        stories: Array<{
          id: string
          title: string
          description: string
          acceptanceCriteria: string[]
          priority: number
          notes?: string
        }>
        branchName?: string
      }
    ) => {
      try {
        const prdPath = path.join(config.projectDir, 'prd.json')
        const prdContent = {
          project: path.basename(config.projectDir),
          branchName: config.branchName || `ralph/${Date.now()}`,
          description: config.description,
          userStories: config.stories.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            acceptanceCriteria: s.acceptanceCriteria,
            priority: s.priority,
            passes: false,
            notes: s.notes || ''
          }))
        }
        await fs.writeFile(prdPath, JSON.stringify(prdContent, null, 2))
        return { success: true, data: { path: prdPath } }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[LoopTask IPC] export-prd error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Delete prd.json - called when returning from wizard step 3->2
  ipcMain.handle('loop-task:delete-prd', async (_event, prdPath: string) => {
    try {
      if (await fs.pathExists(prdPath)) {
        await fs.remove(prdPath)
      }
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[LoopTask IPC] delete-prd error:', err)
      return { success: false, error: err.message }
    }
  })

  // Read file content - generic file reader
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      if (!(await fs.pathExists(filePath))) {
        return { success: false, error: 'File not found' }
      }
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, data: content }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[LoopTask IPC] file:read error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[LoopTask IPC] Handlers registered')
}
