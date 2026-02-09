/**
 * Ralph IPC Handlers
 * Handles IPC communication for loop task management
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
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
  importFromPrdFile,
  prdExists
} from '../services/ralph'
import { getTask as getLoopTask } from '../services/loop-task.service'
import type { CreateTaskConfig, RalphTask, UserStory } from '../services/ralph/types'

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
  ipcMain.handle('ralph:start', async (_event, spaceId: string | null, taskId: string) => {
    try {
      // If spaceId is provided, load from Loop Task persistence
      if (spaceId) {
        const loopTask = getLoopTask(spaceId, taskId)
        if (!loopTask) {
          return { success: false, error: `Task ${taskId} not found in space ${spaceId}` }
        }

        // Convert LoopTask to RalphTask format
        const ralphTask: RalphTask = {
          id: loopTask.id,
          projectDir: loopTask.projectDir,
          branchName: loopTask.branchName,
          description: loopTask.description,
          stories: loopTask.stories,
          status: loopTask.status,
          currentStoryIndex: loopTask.currentStoryIndex,
          iteration: loopTask.iteration,
          maxIterations: loopTask.maxIterations,
          model: loopTask.model,
          modelSource: loopTask.modelSource,
          createdAt: loopTask.createdAt,
          startedAt: loopTask.startedAt,
          completedAt: loopTask.completedAt
        }

        // Set as current task before starting
        setCurrentTask(ralphTask)
      }
      // If no spaceId, assume task was created via ralph:create-task and is already in memory

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

  // Import from prd.json - opens file picker dialog
  ipcMain.handle(
    'ralph:import-prd',
    async () => {
      try {
        const dialogResult = await dialog.showOpenDialog({
          title: 'Select prd.json',
          properties: ['openFile'],
          filters: [
            { name: 'JSON Files', extensions: ['json'] }
          ]
        })

        if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
          return { success: true, data: null }
        }

        const result = await importFromPrdFile(dialogResult.filePaths[0])
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
