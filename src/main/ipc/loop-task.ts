/**
 * Loop Task IPC Handlers
 * Handles IPC communication for loop task persistence and management
 */

import { ipcMain, BrowserWindow } from 'electron'
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
  reorderStories
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

  console.log('[LoopTask IPC] Handlers registered')
}
