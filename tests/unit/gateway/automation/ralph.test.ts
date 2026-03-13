import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  currentTask: null as any,
  canDelegateGatewayCommands: vi.fn(() => false),
  executeGatewayCommand: vi.fn(async (name: string, payload: any) => {
    switch (name) {
      case 'ralph.create-task':
        return {
          id: 'ralph-created',
          ...payload.config,
          stories: [],
          status: 'idle',
          currentStoryIndex: -1,
          iteration: 0,
          currentLoop: 0,
          createdAt: '2026-03-11T08:00:00.000Z'
        }
      case 'ralph.generate-stories':
        return [{ id: 'US-001', title: 'Generated story', priority: 1, status: 'pending' }]
      case 'ralph.import-prd-file':
        return {
          description: 'Imported PRD',
          branchName: 'ralph/imported',
          stories: []
        }
      default:
        return { started: true, taskId: payload.taskId || 'ralph-1' }
    }
  }),
  setMainWindow: vi.fn(),
  createTask: vi.fn(async (config: any) => ({
    id: 'ralph-created',
    ...config,
    stories: [],
    status: 'idle',
    currentStoryIndex: -1,
    iteration: 0,
    currentLoop: 0,
    createdAt: '2026-03-11T08:00:00.000Z'
  })),
  startTask: vi.fn(async () => {}),
  stopTask: vi.fn(async () => {}),
  getTask: vi.fn(async (taskId: string) => taskId === 'ralph-1' ? mocks.currentTask : null),
  getCurrentTask: vi.fn(() => mocks.currentTask),
  setCurrentTask: vi.fn((task: any) => {
    mocks.currentTask = task
  }),
  generateStories: vi.fn(async () => []),
  importFromPrdFile: vi.fn(async () => ({ id: 'imported' })),
  prdExists: vi.fn(async () => true),
  getLoopTask: vi.fn((spaceId: string, taskId: string) => {
    if (spaceId !== 'space-1' || taskId !== 'task-1') {
      return null
    }

    return {
      id: 'task-1',
      projectDir: '/tmp/project',
      branchName: 'ralph/test',
      description: 'Task description',
      stories: [{ id: 'US-001', title: 'Story', priority: 1, status: 'pending' }],
      status: 'idle',
      currentStoryIndex: -1,
      iteration: 2,
      maxIterations: 10,
      model: 'gpt-5',
      modelSource: 'custom',
      createdAt: '2026-03-11T08:00:00.000Z',
      startedAt: undefined,
      completedAt: undefined,
      stepRetryConfig: { onFailure: 'retry', maxRetries: 1 },
      loopConfig: { enabled: false, maxLoops: 1 },
      currentLoop: 0
    }
  })
}))

vi.mock('../../../../src/main/services/ralph', () => ({
  setMainWindow: mocks.setMainWindow,
  createTask: mocks.createTask,
  startTask: mocks.startTask,
  stopTask: mocks.stopTask,
  getTask: mocks.getTask,
  getCurrentTask: mocks.getCurrentTask,
  setCurrentTask: mocks.setCurrentTask,
  generateStories: mocks.generateStories,
  importFromPrdFile: mocks.importFromPrdFile,
  prdExists: mocks.prdExists
}))

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

vi.mock('../../../../src/gateway/automation/loop-task', () => ({
  getTask: mocks.getLoopTask
}))

import {
  createGatewayRalphTask,
  generateGatewayRalphStories,
  getGatewayRalphCurrentTask,
  getGatewayRalphTask,
  getGatewayRalphStatus,
  importGatewayRalphFromPrdFile,
  loadGatewayRalphTaskFromLoopTask,
  setGatewayRalphMainWindow,
  startGatewayRalphTask,
  stopGatewayRalphTask
} from '../../../../src/gateway/automation/ralph'

describe('gateway ralph facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentTask = null
    mocks.canDelegateGatewayCommands.mockReturnValue(false)
  })

  it('loads a persisted loop task into the ralph runtime state', () => {
    const task = loadGatewayRalphTaskFromLoopTask('space-1', 'task-1')

    expect(task).toMatchObject({
      id: 'task-1',
      projectDir: '/tmp/project',
      branchName: 'ralph/test',
      iteration: 2
    })
    expect(mocks.setCurrentTask).toHaveBeenCalledWith(task)
  })

  it('reports the current ralph runtime status', () => {
    mocks.currentTask = {
      id: 'ralph-1',
      status: 'running',
      currentStoryIndex: 0,
      iteration: 4,
      currentLoop: 1,
      stories: [{ id: 'US-001' }]
    }

    expect(getGatewayRalphStatus()).toEqual({
      active: true,
      taskId: 'ralph-1',
      status: 'running',
      currentStoryId: 'US-001',
      iteration: 4,
      currentLoop: 1
    })
  })

  it('reads current task locally when the current process owns execution', async () => {
    mocks.currentTask = {
      id: 'ralph-local',
      status: 'idle',
      currentStoryIndex: -1,
      iteration: 0,
      currentLoop: 0,
      stories: []
    }

    await expect(getGatewayRalphCurrentTask()).resolves.toEqual(
      expect.objectContaining({ id: 'ralph-local' })
    )
    expect(mocks.executeGatewayCommand).not.toHaveBeenCalled()
  })

  it('forwards the main window binding into the underlying ralph runtime', () => {
    const mainWindow = { id: 1 } as any
    setGatewayRalphMainWindow(mainWindow)
    expect(mocks.setMainWindow).toHaveBeenCalledWith(mainWindow)
  })

  it('creates a local ralph task and stores it as current when the current process owns execution', async () => {
    const task = await createGatewayRalphTask({
      projectDir: '/tmp/project',
      description: 'Local create',
      stories: [],
      maxIterations: 5
    } as any)

    expect(task).toMatchObject({
      id: 'ralph-created',
      description: 'Local create'
    })
    expect(mocks.setCurrentTask).toHaveBeenCalledWith(task)
    expect(mocks.executeGatewayCommand).not.toHaveBeenCalled()
  })

  it('delegates start and stop commands to the external gateway owner when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    await startGatewayRalphTask('ralph-1', { spaceId: 'space-1' })
    await stopGatewayRalphTask('ralph-1')

    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(1, 'ralph.start', {
      spaceId: 'space-1',
      taskId: 'ralph-1'
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(2, 'ralph.stop', {
      taskId: 'ralph-1'
    })
    expect(mocks.startTask).not.toHaveBeenCalled()
    expect(mocks.stopTask).not.toHaveBeenCalled()
  })

  it('delegates create, generate-stories, and import-prd-file commands to the external gateway owner when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    await createGatewayRalphTask({
      projectDir: '/tmp/project',
      description: 'Delegated create',
      stories: [],
      maxIterations: 5
    } as any)
    await generateGatewayRalphStories({
      projectDir: '/tmp/project',
      description: 'Generate stories'
    })
    await importGatewayRalphFromPrdFile('/tmp/project/prd.json')

    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(1, 'ralph.create-task', {
      config: expect.objectContaining({
        description: 'Delegated create'
      })
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(2, 'ralph.generate-stories', {
      config: {
        projectDir: '/tmp/project',
        description: 'Generate stories'
      }
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(3, 'ralph.import-prd-file', {
      filePath: '/tmp/project/prd.json'
    })
    expect(mocks.createTask).not.toHaveBeenCalledWith(expect.objectContaining({
      description: 'Delegated create'
    }))
    expect(mocks.generateStories).not.toHaveBeenCalled()
    expect(mocks.importFromPrdFile).not.toHaveBeenCalled()
  })

  it('delegates get-task and get-current commands to the external gateway owner when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    await getGatewayRalphTask('ralph-lookup')
    await getGatewayRalphCurrentTask()

    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(1, 'ralph.get-task', {
      taskId: 'ralph-lookup'
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(2, 'ralph.get-current', {})
  })
})
