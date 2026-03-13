/**
 * Ralph IPC Handlers
 * Handles IPC communication for loop task management
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import {
  createGatewayRalphTask,
  startGatewayRalphTask,
  stopGatewayRalphTask,
  getGatewayRalphTask,
  getGatewayRalphCurrentTask,
  setGatewayRalphMainWindow,
  generateGatewayRalphStories,
  importGatewayRalphFromPrdFile,
  gatewayRalphPrdExists,
  loadGatewayRalphTaskFromLoopTask,
  type CreateTaskConfig
} from '../../gateway/automation/ralph'

export function registerRalphHandlers(window: BrowserWindow | null): void {
  // Set main window for event broadcasting
  setGatewayRalphMainWindow(window)

  // Create a new task
  ipcMain.handle(
    'ralph:create-task',
    async (
      _event,
      config: CreateTaskConfig
    ) => {
      try {
        const task = await createGatewayRalphTask(config)
        return { success: true, data: task }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[Ralph IPC] create-task error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Start a task
  ipcMain.handle('ralph:start', async (_event, spaceId: string | null, taskId: string) => {
    try {
      // If spaceId is provided, load from Loop Task persistence
      if (spaceId) {
        const loopTask = loadGatewayRalphTaskFromLoopTask(spaceId, taskId)
        if (!loopTask) {
          return { success: false, error: 'The requested task could not be found in the current workspace' }
        }
      }
      // If no spaceId, assume task was created via ralph:create-task and is already in memory

      await startGatewayRalphTask(taskId, { spaceId })
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
      await stopGatewayRalphTask(taskId)
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
      const task = await getGatewayRalphTask(taskId)
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
      const task = await getGatewayRalphCurrentTask()
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
        const stories = await generateGatewayRalphStories(config)
        return { success: true, data: stories }
      } catch (error: unknown) {
        const err = error as Error
        console.error('[Ralph IPC] generate-stories error:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Import from prd.json - opens file picker dialog
  ipcMain.handle(
    'ralph:import-prd',
    async () => {
      try {
        const dialogResult = await dialog.showOpenDialog({
          title: 'Select Project Requirements File',
          properties: ['openFile'],
          filters: [
            { name: 'JSON Files', extensions: ['json'] }
          ]
        })

        if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
          return { success: true, data: null }
        }

        const result = await importGatewayRalphFromPrdFile(dialogResult.filePaths[0])
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
        const exists = await gatewayRalphPrdExists(projectDir)
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
