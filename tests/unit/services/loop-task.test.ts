import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import type { CreateLoopTaskConfig, UserStory } from '../../../src/shared/types/loop-task'

vi.mock('@main/services/space.service', () => ({
  getSpace: vi.fn((spaceId: string) => ({
    id: spaceId,
    name: 'Test Space',
    icon: 'folder',
    path: path.join(globalThis.__HALO_TEST_DIR__, 'spaces', spaceId),
    isTemp: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stats: { artifactCount: 0, conversationCount: 0 }
  })),
  getSpaceMetaDir: vi.fn((spacePath: string) => {
    const metaDir = path.join(spacePath, '.skillsfan')
    if (!fs.existsSync(metaDir)) {
      fs.mkdirSync(metaDir, { recursive: true })
    }
    return metaDir
  }),
  listSpaces: vi.fn(() => [])
}))

vi.mock('@main/services/scheduler.service', () => ({
  scheduleTask: vi.fn(),
  unscheduleTask: vi.fn()
}))

vi.mock('@main/services/ralph', () => ({
  getTask: vi.fn(async () => null),
  stopTask: vi.fn(async () => undefined)
}))

import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  renameTask,
  addStory,
  removeStory,
  reorderStories,
  retryStory,
  retryFailed,
  resetAndRerun
} from '@main/services/loop-task.service'

const TEST_SPACE_ID = 'test-space-1'

function makeStories(): UserStory[] {
  return [
    {
      id: 'US-001',
      title: 'Story 1',
      description: 'Desc 1',
      acceptanceCriteria: ['AC1'],
      priority: 1,
      status: 'pending',
      notes: ''
    },
    {
      id: 'US-002',
      title: 'Story 2',
      description: 'Desc 2',
      acceptanceCriteria: ['AC2'],
      priority: 2,
      status: 'pending',
      notes: ''
    }
  ]
}

function makeConfig(overrides?: Partial<CreateLoopTaskConfig>): CreateLoopTaskConfig {
  return {
    projectDir: '/tmp/test-project',
    description: 'Test task description',
    source: 'manual',
    stories: makeStories(),
    maxIterations: 10,
    ...overrides
  }
}

describe('loop-task.service', () => {
  beforeEach(() => {
    const spaceDir = path.join(globalThis.__HALO_TEST_DIR__, 'spaces', TEST_SPACE_ID)
    fs.mkdirSync(path.join(spaceDir, '.skillsfan'), { recursive: true })
  })

  describe('createTask/getTask/listTasks', () => {
    it('creates task with expected defaults', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      expect(task.id).toBeTruthy()
      expect(task.spaceId).toBe(TEST_SPACE_ID)
      expect(task.status).toBe('idle')
      expect(task.currentLoop).toBe(0)
      expect(task.stories).toHaveLength(2)
      expect(task.stories[0].status).toBe('pending')
    })

    it('generates task name from description', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig({ name: undefined }))
      expect(task.name).toBe('Test task description')
    })

    it('persists and can reload task', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const loaded = getTask(TEST_SPACE_ID, task.id)
      expect(loaded).not.toBeNull()
      expect(loaded?.id).toBe(task.id)
    })

    it('lists created tasks', () => {
      createTask(TEST_SPACE_ID, makeConfig())
      expect(listTasks(TEST_SPACE_ID)).toHaveLength(1)
    })

    it('returns null for unknown task', () => {
      expect(getTask(TEST_SPACE_ID, 'not-found')).toBeNull()
    })
  })

  describe('update/rename/delete', () => {
    it('updates task fields and recalculates counts', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const updatedStories = task.stories.map((story, idx) => ({
        ...story,
        status: idx === 0 ? ('completed' as const) : story.status
      }))
      const updated = updateTask(TEST_SPACE_ID, task.id, {
        description: 'Updated',
        stories: updatedStories
      })

      expect(updated?.description).toBe('Updated')
      expect(updated?.completedCount).toBe(1)
    })

    it('renames task', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const renamed = renameTask(TEST_SPACE_ID, task.id, 'New Name')
      expect(renamed?.name).toBe('New Name')
    })

    it('deletes task and index entry', async () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const deleted = await deleteTask(TEST_SPACE_ID, task.id)
      expect(deleted).toBe(true)
      expect(getTask(TEST_SPACE_ID, task.id)).toBeNull()
      expect(listTasks(TEST_SPACE_ID)).toHaveLength(0)
    })
  })

  describe('story operations', () => {
    it('addStory generates next ID and pending status', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const newStory = addStory(TEST_SPACE_ID, task.id, {
        title: 'Story 3',
        description: 'Desc 3',
        acceptanceCriteria: ['AC3'],
        priority: 3,
        notes: ''
      })

      expect(newStory?.id).toBe('US-003')
      expect(newStory?.status).toBe('pending')
    })

    it('removeStory reprioritizes remaining stories', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const removed = removeStory(TEST_SPACE_ID, task.id, 'US-001')
      const updated = getTask(TEST_SPACE_ID, task.id)

      expect(removed).toBe(true)
      expect(updated?.stories).toHaveLength(1)
      expect(updated?.stories[0].priority).toBe(1)
    })

    it('reorderStories moves items and reprioritizes', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const ok = reorderStories(TEST_SPACE_ID, task.id, 0, 1)
      const updated = getTask(TEST_SPACE_ID, task.id)

      expect(ok).toBe(true)
      expect(updated?.stories[0].id).toBe('US-002')
      expect(updated?.stories[1].id).toBe('US-001')
      expect(updated?.stories[0].priority).toBe(1)
      expect(updated?.stories[1].priority).toBe(2)
    })
  })

  describe('retry/reset operations', () => {
    it('retryStory resets one failed story to pending and task to idle', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const failedStories = task.stories.map((story, idx) =>
        idx === 0
          ? { ...story, status: 'failed' as const, error: 'Some error' }
          : story
      )
      updateTask(TEST_SPACE_ID, task.id, { stories: failedStories, status: 'failed' })

      const result = retryStory(TEST_SPACE_ID, task.id, 'US-001')
      expect(result?.stories[0].status).toBe('pending')
      expect(result?.stories[0].error).toBeUndefined()
      expect(result?.stories[0].retryCount).toBe(1)
      expect(result?.status).toBe('idle')
    })

    it('retryFailed resets all failed stories', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const failedStories = task.stories.map((story) => ({ ...story, status: 'failed' as const }))
      updateTask(TEST_SPACE_ID, task.id, { stories: failedStories, status: 'failed' })

      const result = retryFailed(TEST_SPACE_ID, task.id)
      expect(result?.stories.every((story) => story.status === 'pending')).toBe(true)
      expect(result?.status).toBe('idle')
    })

    it('resetAndRerun resets all stories and task execution fields', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      const dirtyStories = task.stories.map((story, idx) => ({
        ...story,
        status: idx === 0 ? ('completed' as const) : ('failed' as const),
        error: idx === 1 ? 'failure' : undefined,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 1234
      }))
      updateTask(TEST_SPACE_ID, task.id, {
        stories: dirtyStories,
        status: 'failed',
        iteration: 9,
        currentLoop: 2,
        currentStoryIndex: 1,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        consecutiveFailures: 2
      })

      const reset = resetAndRerun(TEST_SPACE_ID, task.id)
      expect(reset?.status).toBe('idle')
      expect(reset?.iteration).toBe(0)
      expect(reset?.currentLoop).toBe(0)
      expect(reset?.currentStoryIndex).toBe(-1)
      expect(reset?.startedAt).toBeUndefined()
      expect(reset?.completedAt).toBeUndefined()
      expect(reset?.consecutiveFailures).toBe(0)
      expect(reset?.stories.every((story) => story.status === 'pending')).toBe(true)
      expect(reset?.stories.every((story) => story.error === undefined)).toBe(true)
      expect(reset?.stories.every((story) => story.duration === undefined)).toBe(true)
    })

    it('resetAndRerun rejects running task', () => {
      const task = createTask(TEST_SPACE_ID, makeConfig())
      updateTask(TEST_SPACE_ID, task.id, { status: 'running' })
      expect(resetAndRerun(TEST_SPACE_ID, task.id)).toBeNull()
    })
  })
})
