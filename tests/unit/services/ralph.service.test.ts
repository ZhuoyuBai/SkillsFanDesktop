import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RalphTask } from '@main/services/ralph'

const mocks = vi.hoisted(() => ({
  executeStory: vi.fn(),
  stopStoryExecution: vi.fn(async () => undefined),
  extractCommitHash: vi.fn(),
  initializeProgress: vi.fn(async () => undefined),
  appendProgress: vi.fn(async () => undefined),
  appendError: vi.fn(async () => undefined),
  importPrdJson: vi.fn(),
  readPrdJsonFromFile: vi.fn(),
  prdStoryToUserStory: vi.fn(),
  createPrdJson: vi.fn(async () => undefined),
  syncTaskToPrd: vi.fn(async () => undefined),
  generateBranchName: vi.fn((description: string) => `ralph/${description}`),
  generateNextStoryId: vi.fn(),
  getAllSkills: vi.fn(async () => []),
  ensureSkillsInitialized: vi.fn(async () => undefined)
}))

vi.mock('@main/services/ralph/story-executor', () => ({
  executeStory: mocks.executeStory,
  stopStoryExecution: mocks.stopStoryExecution,
  extractCommitHash: mocks.extractCommitHash
}))

vi.mock('@main/services/ralph/progress-tracker', () => ({
  initializeProgress: mocks.initializeProgress,
  appendProgress: mocks.appendProgress,
  appendError: mocks.appendError
}))

vi.mock('@main/services/ralph/prd-manager', () => ({
  importPrdJson: mocks.importPrdJson,
  readPrdJsonFromFile: mocks.readPrdJsonFromFile,
  prdStoryToUserStory: mocks.prdStoryToUserStory,
  createPrdJson: mocks.createPrdJson,
  syncTaskToPrd: mocks.syncTaskToPrd,
  generateBranchName: mocks.generateBranchName,
  generateNextStoryId: mocks.generateNextStoryId
}))

vi.mock('@main/services/skill', () => ({
  getAllSkills: mocks.getAllSkills,
  ensureSkillsInitialized: mocks.ensureSkillsInitialized
}))

import {
  getTask,
  resetState,
  setCurrentTask,
  startTask
} from '@main/services/ralph'

function makeTask(id: string): RalphTask {
  return {
    id,
    projectDir: `/tmp/${id}`,
    branchName: `ralph/${id}`,
    description: `Task ${id}`,
    stories: [
      {
        id: 'US-001',
        title: `Story for ${id}`,
        description: 'desc',
        acceptanceCriteria: ['done'],
        priority: 1,
        status: 'pending',
        notes: ''
      }
    ],
    status: 'idle',
    currentStoryIndex: -1,
    iteration: 0,
    maxIterations: 2,
    createdAt: new Date().toISOString()
  }
}

describe('ralph.service concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
  })

  afterEach(() => {
    resetState()
  })

  it('allows multiple tasks to run concurrently', async () => {
    const resolvers = new Map<string, (signal: 'STORY_DONE') => void>()

    mocks.executeStory.mockImplementation(async (_mainWindow, task: RalphTask) => {
      return await new Promise<'STORY_DONE'>((resolve) => {
        resolvers.set(task.id, resolve)
      })
    })

    setCurrentTask(makeTask('task-1'))
    setCurrentTask(makeTask('task-2'))

    await startTask('task-1')
    await startTask('task-2')

    expect((await getTask('task-1'))?.status).toBe('running')
    expect((await getTask('task-2'))?.status).toBe('running')
    expect(mocks.executeStory).toHaveBeenCalledTimes(2)

    resolvers.get('task-1')?.('STORY_DONE')
    resolvers.get('task-2')?.('STORY_DONE')

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await getTask('task-1'))?.status).toBe('completed')
    expect((await getTask('task-2'))?.status).toBe('completed')
  })
})
