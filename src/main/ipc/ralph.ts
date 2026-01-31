/**
 * Ralph IPC Handlers
 * Handles IPC communication for loop task management
 */

import { ipcMain, BrowserWindow } from 'electron'
import {
  createTask,
  startTask,
  stopTask,
  getTask,
  getCurrentTask,
  setCurrentTask,
  setMainWindow,
  generateStories,
  importFromPrd,
  prdExists
} from '../services/ralph'
import type { CreateTaskConfig, UserStory } from '../services/ralph/types'

export function registerRalphHandlers(window: BrowserWindow | null): void {
  // Set main window for event broadcasting
  setMainWindow(window)

  // Create a new task
  ipcMain.handle(
    'ralph:create-task',
    async (
      _event,
      config: CreateTaskConfig
    ) => {
      try {
        const task = await createTask(config)
        // Store as current task
        setCurrentTask(task)
        return { success: true, data: task }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[Ralph IPC] create-task error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Start a task
  ipcMain.handle('ralph:start', async (_event, taskId: string) => {
    try {
      await startTask(taskId)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Ralph IPC] start error:', err)
      return { success: false, error: err.message }
    }
  })

  // Stop a task
  ipcMain.handle('ralph:stop', async (_event, taskId: string) => {
    try {
      await stopTask(taskId)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Ralph IPC] stop error:', err)
      return { success: false, error: err.message }
    }
  })

  // Get a specific task
  ipcMain.handle('ralph:get-task', async (_event, taskId: string) => {
    try {
      const task = await getTask(taskId)
      return { success: true, data: task }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Ralph IPC] get-task error:', err)
      return { success: false, error: err.message }
    }
  })

  // Get current task
  ipcMain.handle('ralph:get-current', async () => {
    try {
      const task = getCurrentTask()
      return { success: true, data: task }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Ralph IPC] get-current error:', err)
      return { success: false, error: err.message }
    }
  })

  // Generate stories using AI
  ipcMain.handle(
    'ralph:generate-stories',
    async (
      _event,
      config: { projectDir: string; description: string }
    ) => {
      try {
        const stories = await generateStories(config)
        return { success: true, data: stories }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[Ralph IPC] generate-stories error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Import from prd.json
  ipcMain.handle(
    'ralph:import-prd',
    async (_event, config: { projectDir: string }) => {
      try {
        // Check if prd.json exists
        const exists = await prdExists(config.projectDir)
        if (!exists) {
          return {
            success: false,
            error: 'prd.json not found in the specified directory'
          }
        }

        const result = await importFromPrd(config.projectDir)
        return { success: true, data: result }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[Ralph IPC] import-prd error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Check if prd.json exists
  ipcMain.handle(
    'ralph:prd-exists',
    async (_event, projectDir: string) => {
      try {
        const exists = await prdExists(projectDir)
        return { success: true, data: exists }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[Ralph IPC] prd-exists error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  console.log('[Ralph IPC] Handlers registered')
}
