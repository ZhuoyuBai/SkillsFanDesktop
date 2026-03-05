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
  retryFailed,
  resetAndRerun,
  listAllScheduledTasks
} from '../services/loop-task.service'
import type { CreateLoopTaskConfig, LoopTask, UserStory } from '../../shared/types/loop-task'
import { ipcHandle } from './utils'

export function registerLoopTaskHandlers(window: BrowserWindow | null): void {
  ipcHandle('loop-task:list', (_e, spaceId: string) => listTasks(spaceId))

  ipcHandle('loop-task:create', (_e, spaceId: string, config: CreateLoopTaskConfig) =>
    createTask(spaceId, config)
  )

  ipcHandle('loop-task:get', (_e, spaceId: string, taskId: string) => getTask(spaceId, taskId))

  ipcHandle('loop-task:update', (_e, spaceId: string, taskId: string, updates: Partial<LoopTask>) =>
    updateTask(spaceId, taskId, updates)
  )

  ipcHandle('loop-task:rename', (_e, spaceId: string, taskId: string, name: string) =>
    renameTask(spaceId, taskId, name)
  )

  ipcHandle('loop-task:delete', (_e, spaceId: string, taskId: string) => deleteTask(spaceId, taskId))

  ipcHandle('loop-task:add-story',
    (_e, spaceId: string, taskId: string, story: Omit<UserStory, 'id' | 'status'>) =>
      addStory(spaceId, taskId, story)
  )

  ipcHandle('loop-task:update-story',
    (_e, spaceId: string, taskId: string, storyId: string, updates: Partial<UserStory>) =>
      updateStory(spaceId, taskId, storyId, updates)
  )

  ipcHandle('loop-task:remove-story', (_e, spaceId: string, taskId: string, storyId: string) =>
    removeStory(spaceId, taskId, storyId)
  )

  ipcHandle('loop-task:reorder-stories',
    (_e, spaceId: string, taskId: string, fromIndex: number, toIndex: number) =>
      reorderStories(spaceId, taskId, fromIndex, toIndex)
  )

  ipcHandle('loop-task:retry-story', (_e, spaceId: string, taskId: string, storyId: string) => {
    const task = retryStory(spaceId, taskId, storyId)
    if (!task) throw new Error('Story not found or not in failed state')
    return task
  })

  ipcHandle('loop-task:retry-failed', (_e, spaceId: string, taskId: string) => {
    const task = retryFailed(spaceId, taskId)
    if (!task) throw new Error('Task not found')
    return task
  })

  ipcHandle('loop-task:reset-all', (_e, spaceId: string, taskId: string) => {
    const task = resetAndRerun(spaceId, taskId)
    if (!task) throw new Error('Task not found or currently running')
    return task
  })

  ipcHandle('loop-task:list-scheduled', () => listAllScheduledTasks())

  ipcHandle('loop-task:export-prd',
    async (_e, config: {
      projectDir: string
      description: string
      stories: Array<{
        id: string; title: string; description: string
        acceptanceCriteria: string[]; priority: number; notes?: string
      }>
      branchName?: string
    }) => {
      const prdPath = path.join(config.projectDir, 'prd.json')
      const prdContent = {
        project: path.basename(config.projectDir),
        branchName: config.branchName || `ralph/${Date.now()}`,
        description: config.description,
        userStories: config.stories.map((s) => ({
          id: s.id, title: s.title, description: s.description,
          acceptanceCriteria: s.acceptanceCriteria, priority: s.priority,
          passes: false, notes: s.notes || ''
        }))
      }
      await fs.writeFile(prdPath, JSON.stringify(prdContent, null, 2))
      return { path: prdPath }
    }
  )

  ipcHandle('loop-task:delete-prd', async (_e, prdPath: string) => {
    if (await fs.pathExists(prdPath)) {
      await fs.remove(prdPath)
    }
  })

  ipcHandle('file:read', async (_e, filePath: string) => {
    if (!(await fs.pathExists(filePath))) {
      throw new Error('File not found')
    }
    return fs.readFile(filePath, 'utf-8')
  })

  console.log('[LoopTask IPC] Handlers registered')
}
