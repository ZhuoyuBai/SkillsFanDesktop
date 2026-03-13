import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  killSubagentRun: vi.fn((runId: string) => ({
    runId,
    parentConversationId: 'conv-1',
    parentSpaceId: 'space-1',
    childConversationId: 'subagent-1',
    status: 'killed',
    task: 'Kill run',
    spawnedAt: '2026-03-12T08:00:00.000Z'
  })),
  stopGeneration: vi.fn(async () => {}),
  rewindFiles: vi.fn(async () => undefined),
  getV2Session: vi.fn(() => ({
    session: {
      rewindFiles: mocks.rewindFiles
    }
  })),
  interruptAndInject: vi.fn(async () => {}),
  sendMessage: vi.fn(async () => {}),
  ensureSessionWarm: vi.fn(async () => {}),
  handleToolApproval: vi.fn(() => {}),
  handleUserQuestionAnswer: vi.fn(() => {}),
  retryStory: vi.fn((_spaceId: string, taskId: string, storyId: string) => ({
    id: taskId,
    spaceId: 'space-1',
    stories: [{ id: storyId, status: 'pending' }],
    status: 'idle'
  })),
  createTask: vi.fn((spaceId: string, config: any) => ({
    id: 'task-created',
    spaceId,
    name: config.name || 'Created',
    stories: config.stories || [],
    status: 'idle'
  })),
  updateTask: vi.fn((_spaceId: string, taskId: string, updates: any) => ({
    id: taskId,
    status: 'idle',
    ...updates
  })),
  renameTask: vi.fn((_spaceId: string, taskId: string, name: string) => ({
    id: taskId,
    name,
    status: 'idle'
  })),
  addStory: vi.fn((_spaceId: string, _taskId: string, story: any) => ({
    id: 'US-added',
    title: story.title,
    status: 'pending'
  })),
  updateStory: vi.fn(() => true),
  removeStory: vi.fn(() => true),
  reorderStories: vi.fn(() => true),
  retryFailed: vi.fn((_spaceId: string, taskId: string) => ({
    id: taskId,
    spaceId: 'space-1',
    stories: [],
    status: 'idle'
  })),
  resetAndRerun: vi.fn((_spaceId: string, taskId: string) => ({
    id: taskId,
    spaceId: 'space-1',
    stories: [],
    status: 'idle',
    iteration: 0
  })),
  deleteTask: vi.fn(async () => true),
  createGatewayRalphTaskLocally: vi.fn(async (config: any) => ({
    id: 'ralph-created',
    ...config,
    stories: [],
    status: 'idle',
    currentStoryIndex: -1,
    iteration: 0,
    currentLoop: 0,
    createdAt: '2026-03-11T08:00:00.000Z'
  })),
  getGatewayRalphTaskLocally: vi.fn(async (taskId: string) => ({
    id: taskId,
    status: 'running'
  })),
  getGatewayRalphCurrentTaskLocally: vi.fn(() => ({
    id: 'ralph-current',
    status: 'running'
  })),
  loadGatewayRalphTaskFromLoopTask: vi.fn(() => ({
    id: 'ralph-1'
  })),
  startGatewayRalphTaskLocally: vi.fn(async () => {}),
  stopGatewayRalphTaskLocally: vi.fn(async () => {}),
  getGatewayRalphTask: vi.fn(async (taskId: string) => ({
    id: taskId,
    status: 'running'
  })),
  generateGatewayRalphStoriesLocally: vi.fn(async () => ([
    { id: 'US-001', title: 'Generated story', priority: 1, status: 'pending' }
  ])),
  importGatewayRalphFromPrdFileLocally: vi.fn(async () => ({
    description: 'Imported PRD',
    branchName: 'ralph/imported',
    stories: []
  }))
}))

vi.mock('../../../../src/main/services/agent/subagent/runtime', () => ({
  killSubagentRun: mocks.killSubagentRun
}))

vi.mock('../../../../src/main/services/agent/control', () => ({
  stopGeneration: mocks.stopGeneration,
  interruptAndInject: mocks.interruptAndInject
}))

vi.mock('../../../../src/main/services/agent/session-manager', () => ({
  getV2Session: mocks.getV2Session
}))

vi.mock('../../../../src/gateway/runtime/orchestrator', () => ({
  sendMessage: mocks.sendMessage,
  ensureSessionWarm: mocks.ensureSessionWarm
}))

vi.mock('../../../../src/main/services/agent/permission-handler', () => ({
  handleToolApproval: mocks.handleToolApproval,
  handleUserQuestionAnswer: mocks.handleUserQuestionAnswer
}))

vi.mock('../../../../src/main/services/loop-task.service', () => ({
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
  renameTask: mocks.renameTask,
  addStory: mocks.addStory,
  updateStory: mocks.updateStory,
  removeStory: mocks.removeStory,
  reorderStories: mocks.reorderStories,
  retryStory: mocks.retryStory,
  retryFailed: mocks.retryFailed,
  resetAndRerun: mocks.resetAndRerun,
  deleteTask: mocks.deleteTask
}))

vi.mock('../../../../src/gateway/automation/ralph', () => ({
  createGatewayRalphTaskLocally: mocks.createGatewayRalphTaskLocally,
  getGatewayRalphTaskLocally: mocks.getGatewayRalphTaskLocally,
  getGatewayRalphCurrentTaskLocally: mocks.getGatewayRalphCurrentTaskLocally,
  loadGatewayRalphTaskFromLoopTask: mocks.loadGatewayRalphTaskFromLoopTask,
  startGatewayRalphTaskLocally: mocks.startGatewayRalphTaskLocally,
  stopGatewayRalphTaskLocally: mocks.stopGatewayRalphTaskLocally,
  getGatewayRalphTask: mocks.getGatewayRalphTask,
  generateGatewayRalphStoriesLocally: mocks.generateGatewayRalphStoriesLocally,
  importGatewayRalphFromPrdFileLocally: mocks.importGatewayRalphFromPrdFileLocally
}))

import {
  configureGatewayCommandBus,
  executeGatewayCommand,
  processGatewayCommandsNow,
  resetGatewayCommandBusForTests,
  resetGatewayCommandRuntimeForTests
} from '../../../../src/gateway/commands'

describe('gateway command runtime', () => {
  const busDir = join(tmpdir(), `skillsfan-gateway-command-runtime-${process.pid}`)

  beforeEach(() => {
    vi.clearAllMocks()
    rmSync(busDir, { recursive: true, force: true })
    mkdirSync(busDir, { recursive: true })
    resetGatewayCommandBusForTests()
    resetGatewayCommandRuntimeForTests()
    configureGatewayCommandBus(busDir)
  })

  afterEach(() => {
    resetGatewayCommandRuntimeForTests()
    resetGatewayCommandBusForTests()
    rmSync(busDir, { recursive: true, force: true })
  })

  it('processes subagent kill commands through the external command runtime', async () => {
    const pending = executeGatewayCommand('subagent.kill', {
      runId: 'run-1'
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual(expect.objectContaining({
      runId: 'run-1',
      status: 'killed'
    }))
    expect(mocks.killSubagentRun).toHaveBeenCalledWith('run-1')
  })

  it('processes stop-generation commands through the external command runtime', async () => {
    const pending = executeGatewayCommand('agent.stop', {
      conversationId: 'conv-9'
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual({
      stopped: true,
      conversationId: 'conv-9'
    })
    expect(mocks.stopGeneration).toHaveBeenCalledWith('conv-9')
  })

  it('processes rewind-files commands through the external command runtime', async () => {
    const pending = executeGatewayCommand('agent.rewind-files', {
      conversationId: 'conv-rewind',
      userMessageUuid: 'msg-1'
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual({
      success: true
    })
    expect(mocks.rewindFiles).toHaveBeenCalledWith('msg-1')
  })

  it('accepts delegated send-message commands without waiting for full completion', async () => {
    const request = {
      spaceId: 'space-1',
      conversationId: 'conv-send',
      message: 'hello'
    } as any
    const pending = executeGatewayCommand('agent.send-message', {
      request
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual({
      accepted: true,
      conversationId: 'conv-send'
    })
    expect(mocks.sendMessage).toHaveBeenCalledWith(null, request)
  })

  it('processes session warm commands through the external command runtime', async () => {
    const pending = executeGatewayCommand('agent.ensure-session-warm', {
      spaceId: 'space-1',
      conversationId: 'conv-warm',
      routeHint: {
        channel: 'electron'
      }
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual({
      warmed: true,
      conversationId: 'conv-warm'
    })
    expect(mocks.ensureSessionWarm).toHaveBeenCalledWith(
      'space-1',
      'conv-warm',
      {
        channel: 'electron'
      }
    )
  })

  it('accepts delegated interrupt-inject commands without waiting for full completion', async () => {
    const request = {
      spaceId: 'space-1',
      conversationId: 'conv-inject',
      message: 'follow up'
    }
    const pending = executeGatewayCommand('agent.interrupt-inject', {
      request
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual({
      accepted: true,
      conversationId: 'conv-inject'
    })
    expect(mocks.interruptAndInject).toHaveBeenCalledWith(null, request)
  })

  it('processes tool approval commands through the external command runtime', async () => {
    const pending = executeGatewayCommand('agent.tool-approval', {
      conversationId: 'conv-approval',
      approved: true
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual({
      accepted: true,
      conversationId: 'conv-approval'
    })
    expect(mocks.handleToolApproval).toHaveBeenCalledWith('conv-approval', true)
  })

  it('processes user question answers through the external command runtime', async () => {
    const pending = executeGatewayCommand('agent.question-answer', {
      conversationId: 'conv-question',
      answers: {
        answer: 'yes'
      }
    }, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(pending).resolves.toEqual({
      accepted: true,
      conversationId: 'conv-question'
    })
    expect(mocks.handleUserQuestionAnswer).toHaveBeenCalledWith('conv-question', {
      answer: 'yes'
    })
  })

  it('processes loop-task retry and reset commands through the external command runtime', async () => {
    const createPending = executeGatewayCommand('loop-task.create', {
      spaceId: 'space-1',
      config: {
        projectDir: '/tmp/project',
        description: 'Create task',
        stories: []
      } as any
    }, { timeoutMs: 2_000 })
    const updatePending = executeGatewayCommand('loop-task.update', {
      spaceId: 'space-1',
      taskId: 'task-0',
      updates: {
        name: 'Updated task'
      }
    }, { timeoutMs: 2_000 })
    const renamePending = executeGatewayCommand('loop-task.rename', {
      spaceId: 'space-1',
      taskId: 'task-0',
      name: 'Renamed task'
    }, { timeoutMs: 2_000 })
    const addStoryPending = executeGatewayCommand('loop-task.add-story', {
      spaceId: 'space-1',
      taskId: 'task-0',
      story: {
        title: 'New story',
        description: 'desc',
        acceptanceCriteria: [],
        priority: 1
      }
    }, { timeoutMs: 2_000 })
    const updateStoryPending = executeGatewayCommand('loop-task.update-story', {
      spaceId: 'space-1',
      taskId: 'task-0',
      storyId: 'US-001',
      updates: {
        title: 'Updated story'
      }
    }, { timeoutMs: 2_000 })
    const removeStoryPending = executeGatewayCommand('loop-task.remove-story', {
      spaceId: 'space-1',
      taskId: 'task-0',
      storyId: 'US-001'
    }, { timeoutMs: 2_000 })
    const reorderPending = executeGatewayCommand('loop-task.reorder-stories', {
      spaceId: 'space-1',
      taskId: 'task-0',
      fromIndex: 0,
      toIndex: 1
    }, { timeoutMs: 2_000 })
    const retryStoryPending = executeGatewayCommand('loop-task.retry-story', {
      spaceId: 'space-1',
      taskId: 'task-1',
      storyId: 'US-001'
    }, { timeoutMs: 2_000 })
    const retryFailedPending = executeGatewayCommand('loop-task.retry-failed', {
      spaceId: 'space-1',
      taskId: 'task-2'
    }, { timeoutMs: 2_000 })
    const resetPending = executeGatewayCommand('loop-task.reset-all', {
      spaceId: 'space-1',
      taskId: 'task-3'
    }, { timeoutMs: 2_000 })
    const deletePending = executeGatewayCommand('loop-task.delete', {
      spaceId: 'space-1',
      taskId: 'task-4'
    }, { timeoutMs: 2_000 })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(createPending).resolves.toEqual(expect.objectContaining({
      id: 'task-created',
      status: 'idle'
    }))
    await expect(updatePending).resolves.toEqual(expect.objectContaining({
      id: 'task-0',
      name: 'Updated task'
    }))
    await expect(renamePending).resolves.toEqual(expect.objectContaining({
      id: 'task-0',
      name: 'Renamed task'
    }))
    await expect(addStoryPending).resolves.toEqual(expect.objectContaining({
      id: 'US-added',
      status: 'pending'
    }))
    await expect(updateStoryPending).resolves.toEqual({
      updated: true,
      taskId: 'task-0',
      storyId: 'US-001'
    })
    await expect(removeStoryPending).resolves.toEqual({
      removed: true,
      taskId: 'task-0',
      storyId: 'US-001'
    })
    await expect(reorderPending).resolves.toEqual({
      reordered: true,
      taskId: 'task-0',
      fromIndex: 0,
      toIndex: 1
    })
    await expect(retryStoryPending).resolves.toEqual(expect.objectContaining({
      id: 'task-1',
      status: 'idle'
    }))
    await expect(retryFailedPending).resolves.toEqual(expect.objectContaining({
      id: 'task-2',
      status: 'idle'
    }))
    await expect(resetPending).resolves.toEqual(expect.objectContaining({
      id: 'task-3',
      iteration: 0
    }))
    await expect(deletePending).resolves.toEqual({
      deleted: true,
      taskId: 'task-4'
    })
    expect(mocks.createTask).toHaveBeenCalledWith('space-1', expect.objectContaining({
      description: 'Create task'
    }))
    expect(mocks.updateTask).toHaveBeenCalledWith('space-1', 'task-0', {
      name: 'Updated task'
    })
    expect(mocks.renameTask).toHaveBeenCalledWith('space-1', 'task-0', 'Renamed task')
    expect(mocks.addStory).toHaveBeenCalledWith('space-1', 'task-0', expect.objectContaining({
      title: 'New story'
    }))
    expect(mocks.updateStory).toHaveBeenCalledWith('space-1', 'task-0', 'US-001', {
      title: 'Updated story'
    })
    expect(mocks.removeStory).toHaveBeenCalledWith('space-1', 'task-0', 'US-001')
    expect(mocks.reorderStories).toHaveBeenCalledWith('space-1', 'task-0', 0, 1)
    expect(mocks.retryStory).toHaveBeenCalledWith('space-1', 'task-1', 'US-001')
    expect(mocks.retryFailed).toHaveBeenCalledWith('space-1', 'task-2')
    expect(mocks.resetAndRerun).toHaveBeenCalledWith('space-1', 'task-3')
    expect(mocks.deleteTask).toHaveBeenCalledWith('space-1', 'task-4')
  })

  it('processes ralph start and stop commands through the external command runtime', async () => {
    const startPending = executeGatewayCommand('ralph.start', {
      spaceId: 'space-1',
      taskId: 'ralph-1'
    }, { timeoutMs: 2_000 })
    const stopPending = executeGatewayCommand('ralph.stop', {
      taskId: 'ralph-1'
    }, { timeoutMs: 2_000 })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(startPending).resolves.toEqual(expect.objectContaining({
      started: true,
      taskId: 'ralph-1',
      task: expect.objectContaining({
        id: 'ralph-1'
      })
    }))
    await expect(stopPending).resolves.toEqual({
      stopped: true,
      taskId: 'ralph-1'
    })
    expect(mocks.loadGatewayRalphTaskFromLoopTask).toHaveBeenCalledWith('space-1', 'ralph-1')
    expect(mocks.startGatewayRalphTaskLocally).toHaveBeenCalledWith('ralph-1')
    expect(mocks.stopGatewayRalphTaskLocally).toHaveBeenCalledWith('ralph-1')
  })

  it('processes ralph create, generate-stories, and import-prd-file through the external command runtime', async () => {
    const createPending = executeGatewayCommand('ralph.create-task', {
      config: {
        projectDir: '/tmp/project',
        description: 'Create task',
        stories: [],
        maxIterations: 5
      } as any
    }, { timeoutMs: 2_000 })
    const generatePending = executeGatewayCommand('ralph.generate-stories', {
      config: {
        projectDir: '/tmp/project',
        description: 'Generate stories'
      }
    }, { timeoutMs: 2_000 })
    const importPending = executeGatewayCommand('ralph.import-prd-file', {
      filePath: '/tmp/project/prd.json'
    }, { timeoutMs: 2_000 })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(createPending).resolves.toEqual(expect.objectContaining({
      id: 'ralph-created',
      description: 'Create task'
    }))
    await expect(generatePending).resolves.toEqual([
      expect.objectContaining({ id: 'US-001' })
    ])
    await expect(importPending).resolves.toEqual(expect.objectContaining({
      description: 'Imported PRD',
      branchName: 'ralph/imported'
    }))
    expect(mocks.createGatewayRalphTaskLocally).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Create task'
    }))
    expect(mocks.generateGatewayRalphStoriesLocally).toHaveBeenCalledWith({
      projectDir: '/tmp/project',
      description: 'Generate stories'
    })
    expect(mocks.importGatewayRalphFromPrdFileLocally).toHaveBeenCalledWith('/tmp/project/prd.json')
  })

  it('processes ralph get-task and get-current through the external command runtime', async () => {
    const getTaskPending = executeGatewayCommand('ralph.get-task', {
      taskId: 'ralph-lookup'
    }, { timeoutMs: 2_000 })
    const getCurrentPending = executeGatewayCommand('ralph.get-current', {}, {
      timeoutMs: 2_000
    })

    await processGatewayCommandsNow({
      processRole: 'external-gateway'
    })

    await expect(getTaskPending).resolves.toEqual(expect.objectContaining({
      id: 'ralph-lookup',
      status: 'running'
    }))
    await expect(getCurrentPending).resolves.toEqual(expect.objectContaining({
      id: 'ralph-current',
      status: 'running'
    }))
    expect(mocks.getGatewayRalphTaskLocally).toHaveBeenCalledWith('ralph-lookup')
    expect(mocks.getGatewayRalphCurrentTaskLocally).toHaveBeenCalled()
  })
})
