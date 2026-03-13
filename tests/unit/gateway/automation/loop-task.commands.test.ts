import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  canDelegateGatewayCommands: vi.fn(() => false),
  executeGatewayCommand: vi.fn(async (name: string, payload: any) => {
    switch (name) {
      case 'loop-task.create':
        return {
          id: 'task-created',
          spaceId: payload.spaceId,
          name: payload.config.name || 'Created',
          status: 'idle',
          stories: payload.config.stories || []
        }
      case 'loop-task.update':
      case 'loop-task.rename':
        return {
          id: payload.taskId,
          spaceId: payload.spaceId,
          status: 'idle',
          name: payload.name || payload.updates?.name || 'Updated',
          stories: payload.updates?.stories || []
        }
      case 'loop-task.add-story':
        return {
          id: 'US-added',
          title: payload.story.title,
          status: 'pending'
        }
      case 'loop-task.update-story':
        return { updated: true, taskId: payload.taskId, storyId: payload.storyId }
      case 'loop-task.remove-story':
        return { removed: true, taskId: payload.taskId, storyId: payload.storyId }
      case 'loop-task.reorder-stories':
        return {
          reordered: true,
          taskId: payload.taskId,
          fromIndex: payload.fromIndex,
          toIndex: payload.toIndex
        }
      default:
        return {
          id: payload.taskId,
          spaceId: payload.spaceId,
          status: 'idle',
          stories: name === 'loop-task.retry-story'
            ? [{ id: payload.storyId, status: 'pending' }]
            : []
        }
    }
  }),
  createTask: vi.fn((spaceId: string, config: any) => ({
    id: 'task-created',
    spaceId,
    name: config.name || 'Created',
    status: 'idle',
    stories: config.stories || []
  })),
  updateTask: vi.fn((spaceId: string, taskId: string, updates: any) => ({
    id: taskId,
    spaceId,
    name: updates.name || 'Updated',
    status: 'idle',
    stories: updates.stories || []
  })),
  renameTask: vi.fn((spaceId: string, taskId: string, name: string) => ({
    id: taskId,
    spaceId,
    name,
    status: 'idle',
    stories: []
  })),
  addStory: vi.fn((_spaceId: string, _taskId: string, story: any) => ({
    id: 'US-added',
    title: story.title,
    status: 'pending'
  })),
  updateStory: vi.fn(() => true),
  removeStory: vi.fn(() => true),
  reorderStories: vi.fn(() => true),
  retryStory: vi.fn((spaceId: string, taskId: string, storyId: string) => ({
    id: taskId,
    spaceId,
    status: 'idle',
    stories: [{ id: storyId, status: 'pending' }]
  })),
  retryFailed: vi.fn((spaceId: string, taskId: string) => ({
    id: taskId,
    spaceId,
    status: 'idle',
    stories: []
  })),
  resetAndRerun: vi.fn((spaceId: string, taskId: string) => ({
    id: taskId,
    spaceId,
    status: 'idle',
    stories: [],
    iteration: 0
  })),
  deleteTask: vi.fn(async () => true),
  getTask: vi.fn((spaceId: string, taskId: string) => ({
    id: taskId,
    spaceId,
    name: 'Observed task',
    status: 'idle',
    stories: []
  })),
  listTasks: vi.fn((spaceId: string) => ([
    {
      id: 'task-a',
      spaceId,
      name: 'Task A',
      status: 'idle',
      storyCount: 0,
      completedCount: 0,
      createdAt: '2026-03-12T08:00:00.000Z',
      updatedAt: '2026-03-12T08:00:00.000Z'
    }
  ])),
  listAllScheduledTasks: vi.fn(() => ([
    {
      id: 'task-scheduled',
      spaceId: 'space-1',
      name: 'Scheduled Task',
      status: 'idle',
      storyCount: 0,
      completedCount: 0,
      createdAt: '2026-03-12T08:00:00.000Z',
      updatedAt: '2026-03-12T08:00:00.000Z'
    }
  ]))
}))

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

vi.mock('../../../../src/main/services/loop-task.service', () => ({
  addStory: mocks.addStory,
  createTask: mocks.createTask,
  deleteTask: mocks.deleteTask,
  getTask: mocks.getTask,
  listAllScheduledTasks: mocks.listAllScheduledTasks,
  listTasks: mocks.listTasks,
  recoverInterruptedTasks: vi.fn(() => ({ recoveredCount: 0, recoveredTaskIds: [] })),
  removeStory: mocks.removeStory,
  renameTask: mocks.renameTask,
  reorderStories: mocks.reorderStories,
  resetAndRerun: mocks.resetAndRerun,
  retryFailed: mocks.retryFailed,
  retryStory: mocks.retryStory,
  syncAllTasksToGatewaySessions: vi.fn(() => ({ syncedCount: 0, syncedTaskIds: [] })),
  updateStory: mocks.updateStory,
  updateTask: mocks.updateTask
}))

import {
  addStory,
  createTask,
  deleteTask,
  getTask,
  listAllScheduledTasks,
  listTasks,
  removeStory,
  renameTask,
  reorderStories,
  resetAndRerun,
  retryFailed,
  retryStory,
  updateStory,
  updateTask
} from '../../../../src/gateway/automation/loop-task'

describe('gateway loop-task command delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canDelegateGatewayCommands.mockReturnValue(false)
  })

  it('uses the local loop-task service when the current process owns execution', async () => {
    await expect(createTask('space-1', {
      projectDir: '/tmp/project',
      description: 'Create',
      stories: []
    } as any)).resolves.toEqual(
      expect.objectContaining({ id: 'task-created' })
    )
    await expect(updateTask('space-1', 'task-0', { name: 'Updated' } as any)).resolves.toEqual(
      expect.objectContaining({ id: 'task-0', name: 'Updated' })
    )
    await expect(renameTask('space-1', 'task-0', 'Renamed')).resolves.toEqual(
      expect.objectContaining({ id: 'task-0', name: 'Renamed' })
    )
    await expect(addStory('space-1', 'task-0', {
      title: 'Story',
      description: 'desc',
      acceptanceCriteria: [],
      priority: 1
    } as any)).resolves.toEqual(
      expect.objectContaining({ id: 'US-added' })
    )
    await expect(updateStory('space-1', 'task-0', 'US-001', { title: 'Updated story' })).resolves.toBe(true)
    await expect(removeStory('space-1', 'task-0', 'US-001')).resolves.toBe(true)
    await expect(reorderStories('space-1', 'task-0', 0, 1)).resolves.toBe(true)
    await expect(retryStory('space-1', 'task-1', 'US-001')).resolves.toEqual(
      expect.objectContaining({ id: 'task-1' })
    )
    await expect(retryFailed('space-1', 'task-2')).resolves.toEqual(
      expect.objectContaining({ id: 'task-2' })
    )
    await expect(resetAndRerun('space-1', 'task-3')).resolves.toEqual(
      expect.objectContaining({ id: 'task-3', iteration: 0 })
    )
    await expect(deleteTask('space-1', 'task-4')).resolves.toBe(true)

    expect(mocks.createTask).toHaveBeenCalledWith('space-1', expect.objectContaining({
      description: 'Create'
    }))
    expect(mocks.updateTask).toHaveBeenCalledWith('space-1', 'task-0', { name: 'Updated' })
    expect(mocks.renameTask).toHaveBeenCalledWith('space-1', 'task-0', 'Renamed')
    expect(mocks.addStory).toHaveBeenCalledWith('space-1', 'task-0', expect.objectContaining({
      title: 'Story'
    }))
    expect(mocks.updateStory).toHaveBeenCalledWith('space-1', 'task-0', 'US-001', { title: 'Updated story' })
    expect(mocks.removeStory).toHaveBeenCalledWith('space-1', 'task-0', 'US-001')
    expect(mocks.reorderStories).toHaveBeenCalledWith('space-1', 'task-0', 0, 1)
    expect(mocks.retryStory).toHaveBeenCalledWith('space-1', 'task-1', 'US-001')
    expect(mocks.retryFailed).toHaveBeenCalledWith('space-1', 'task-2')
    expect(mocks.resetAndRerun).toHaveBeenCalledWith('space-1', 'task-3')
    expect(mocks.deleteTask).toHaveBeenCalledWith('space-1', 'task-4')
    expect(mocks.executeGatewayCommand).not.toHaveBeenCalled()
  })

  it('delegates retry and reset commands to the external gateway owner when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    await createTask('space-1', {
      projectDir: '/tmp/project',
      description: 'Create',
      stories: []
    } as any)
    await updateTask('space-1', 'task-0', { name: 'Updated' } as any)
    await renameTask('space-1', 'task-0', 'Renamed')
    await addStory('space-1', 'task-0', {
      title: 'Story',
      description: 'desc',
      acceptanceCriteria: [],
      priority: 1
    } as any)
    await updateStory('space-1', 'task-0', 'US-001', { title: 'Updated story' })
    await removeStory('space-1', 'task-0', 'US-001')
    await reorderStories('space-1', 'task-0', 0, 1)
    await retryStory('space-1', 'task-1', 'US-001')
    await retryFailed('space-1', 'task-2')
    await resetAndRerun('space-1', 'task-3')
    await deleteTask('space-1', 'task-4')

    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(1, 'loop-task.create', {
      spaceId: 'space-1',
      config: expect.objectContaining({
        description: 'Create'
      })
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(2, 'loop-task.update', {
      spaceId: 'space-1',
      taskId: 'task-0',
      updates: { name: 'Updated' }
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(3, 'loop-task.rename', {
      spaceId: 'space-1',
      taskId: 'task-0',
      name: 'Renamed'
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(4, 'loop-task.add-story', {
      spaceId: 'space-1',
      taskId: 'task-0',
      story: expect.objectContaining({
        title: 'Story'
      })
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(5, 'loop-task.update-story', {
      spaceId: 'space-1',
      taskId: 'task-0',
      storyId: 'US-001',
      updates: { title: 'Updated story' }
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(6, 'loop-task.remove-story', {
      spaceId: 'space-1',
      taskId: 'task-0',
      storyId: 'US-001'
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(7, 'loop-task.reorder-stories', {
      spaceId: 'space-1',
      taskId: 'task-0',
      fromIndex: 0,
      toIndex: 1
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(8, 'loop-task.retry-story', {
      spaceId: 'space-1',
      taskId: 'task-1',
      storyId: 'US-001'
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(9, 'loop-task.retry-failed', {
      spaceId: 'space-1',
      taskId: 'task-2'
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(10, 'loop-task.reset-all', {
      spaceId: 'space-1',
      taskId: 'task-3'
    })
    expect(mocks.executeGatewayCommand).toHaveBeenNthCalledWith(11, 'loop-task.delete', {
      spaceId: 'space-1',
      taskId: 'task-4'
    })
  })

  it('keeps loop-task read paths local even in external observer mode', () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    expect(listTasks('space-1')).toEqual([
      expect.objectContaining({ id: 'task-a', spaceId: 'space-1' })
    ])
    expect(getTask('space-1', 'task-a')).toEqual(
      expect.objectContaining({ id: 'task-a', spaceId: 'space-1' })
    )
    expect(listAllScheduledTasks()).toEqual([
      expect.objectContaining({ id: 'task-scheduled' })
    ])

    expect(mocks.listTasks).toHaveBeenCalledWith('space-1')
    expect(mocks.getTask).toHaveBeenCalledWith('space-1', 'task-a')
    expect(mocks.listAllScheduledTasks).toHaveBeenCalled()
    expect(mocks.executeGatewayCommand).not.toHaveBeenCalled()
  })
})
