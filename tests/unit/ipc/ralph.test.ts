import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  startTask: vi.fn(),
  stopTask: vi.fn(),
  getTask: vi.fn(),
  getCurrentTask: vi.fn(),
  setCurrentTask: vi.fn(),
  setMainWindow: vi.fn(),
  generateStories: vi.fn(),
  importFromPrd: vi.fn(),
  importFromPrdFile: vi.fn(),
  prdExists: vi.fn(),
  getLoopTask: vi.fn()
}))

vi.mock('@main/services/ralph', () => ({
  createTask: mocks.createTask,
  startTask: mocks.startTask,
  stopTask: mocks.stopTask,
  getTask: mocks.getTask,
  getCurrentTask: mocks.getCurrentTask,
  setCurrentTask: mocks.setCurrentTask,
  setMainWindow: mocks.setMainWindow,
  generateStories: mocks.generateStories,
  importFromPrd: mocks.importFromPrd,
  importFromPrdFile: mocks.importFromPrdFile,
  prdExists: mocks.prdExists
}))

vi.mock('@main/services/loop-task.service', () => ({
  getTask: mocks.getLoopTask
}))

import { registerRalphHandlers } from '@main/ipc/ralph'

function getHandler(channel: string) {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  return call?.[1] as ((...args: any[]) => Promise<any>) | undefined
}

describe('registerRalphHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerRalphHandlers(null)
  })

  it('reuses in-memory task state when starting an already loaded task', async () => {
    const task = {
      id: 'task-1',
      status: 'idle'
    }
    mocks.getTask.mockResolvedValue(task)

    const handler = getHandler('ralph:start')
    expect(handler).toBeDefined()

    const result = await handler?.({}, 'space-1', 'task-1')

    expect(result).toEqual({ success: true })
    expect(mocks.getTask).toHaveBeenCalledWith('task-1')
    expect(mocks.getLoopTask).not.toHaveBeenCalled()
    expect(mocks.setCurrentTask).toHaveBeenCalledWith(task)
    expect(mocks.startTask).toHaveBeenCalledWith('task-1')
  })

  it('loads persisted task into runtime state when starting for the first time', async () => {
    mocks.getTask.mockResolvedValue(null)
    mocks.getLoopTask.mockReturnValue({
      id: 'task-2',
      projectDir: '/tmp/project',
      branchName: 'ralph/task-2',
      description: 'Task 2',
      stories: [],
      status: 'idle',
      currentStoryIndex: -1,
      iteration: 0,
      maxIterations: 3,
      createdAt: new Date().toISOString()
    })

    const handler = getHandler('ralph:start')
    expect(handler).toBeDefined()

    const result = await handler?.({}, 'space-1', 'task-2')

    expect(result).toEqual({ success: true })
    expect(mocks.getTask).toHaveBeenCalledWith('task-2')
    expect(mocks.getLoopTask).toHaveBeenCalledWith('space-1', 'task-2')
    expect(mocks.setCurrentTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-2',
      projectDir: '/tmp/project',
      description: 'Task 2'
    }))
    expect(mocks.startTask).toHaveBeenCalledWith('task-2')
  })
})
