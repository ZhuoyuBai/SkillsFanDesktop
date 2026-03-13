import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeGatewaySubagentRuntime: vi.fn(() => {}),
  getGatewaySubagentRuntimeStatus: vi.fn(() => ({
    registryLoaded: true,
    totalRuns: 3,
    activeRuns: 1,
    waitingAnnouncementRuns: 1
  })),
  shutdownGatewaySubagentRuntime: vi.fn(() => {}),
  getGatewayRalphStatus: vi.fn(() => ({
    active: true,
    taskId: 'ralph-1',
    status: 'running',
    currentStoryId: 'US-001',
    iteration: 4,
    currentLoop: 1
  })),
  recoverInterruptedTasks: vi.fn(() => ({
    recoveredCount: 2,
    recoveredTaskIds: ['task-1', 'task-2']
  })),
  syncAllGatewayLoopTaskSessions: vi.fn(() => ({
    syncedCount: 3,
    syncedTaskIds: ['task-1', 'task-2', 'task-3']
  })),
  listAllScheduledTasks: vi.fn(() => [
    { id: 'scheduled-1' },
    { id: 'scheduled-2' }
  ]),
  getActiveJobCount: vi.fn(() => 2),
  shutdownScheduler: vi.fn(() => {}),
  getPendingRetryCount: vi.fn(() => 1),
  cancelAllRetries: vi.fn(() => {})
}))

vi.mock('../../../../src/gateway/automation/subagents', () => ({
  initializeGatewaySubagentRuntime: mocks.initializeGatewaySubagentRuntime,
  getGatewaySubagentRuntimeStatus: mocks.getGatewaySubagentRuntimeStatus,
  shutdownGatewaySubagentRuntime: mocks.shutdownGatewaySubagentRuntime
}))

vi.mock('../../../../src/gateway/automation/ralph', () => ({
  getGatewayRalphStatus: mocks.getGatewayRalphStatus
}))

vi.mock('../../../../src/gateway/automation/loop-task', () => ({
  recoverInterruptedTasks: mocks.recoverInterruptedTasks,
  syncAllGatewayLoopTaskSessions: mocks.syncAllGatewayLoopTaskSessions,
  listAllScheduledTasks: mocks.listAllScheduledTasks
}))

vi.mock('../../../../src/gateway/automation/scheduler', () => ({
  getActiveJobCount: mocks.getActiveJobCount,
  shutdownScheduler: mocks.shutdownScheduler
}))

vi.mock('../../../../src/main/services/retry-handler', () => ({
  getPendingRetryCount: mocks.getPendingRetryCount,
  cancelAllRetries: mocks.cancelAllRetries
}))

import {
  getGatewayAutomationStatus,
  initializeGatewayAutomation,
  resetGatewayAutomationForTests,
  shutdownGatewayAutomation
} from '../../../../src/gateway/automation'

describe('gateway automation runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGatewayAutomationForTests()
  })

  it('initializes subagent recovery once and exposes aggregated automation status', () => {
    const status = initializeGatewayAutomation()

    expect(mocks.initializeGatewaySubagentRuntime).toHaveBeenCalledTimes(1)
    expect(mocks.recoverInterruptedTasks).toHaveBeenCalledTimes(1)
    expect(mocks.syncAllGatewayLoopTaskSessions).toHaveBeenCalledTimes(1)
    expect(status).toMatchObject({
      initialized: true,
      subagents: {
        registryLoaded: true,
        totalRuns: 3,
        activeRuns: 1,
        waitingAnnouncementRuns: 1
      },
      ralph: {
        active: true,
        taskId: 'ralph-1',
        status: 'running',
        currentStoryId: 'US-001',
        iteration: 4,
        currentLoop: 1
      },
      loopTasks: {
        scheduledTaskCount: 2,
        activeJobCount: 2,
        pendingRetryCount: 1,
        recovery: {
          recoveredCount: 2,
          recoveredTaskIds: ['task-1', 'task-2']
        }
      }
    })
    expect(status.loopTasks.recovery.attemptedAt).toBeTruthy()

    initializeGatewayAutomation()
    expect(mocks.recoverInterruptedTasks).toHaveBeenCalledTimes(1)
  })

  it('shuts down subagent, scheduler, and retry lifecycles together', () => {
    initializeGatewayAutomation()

    shutdownGatewayAutomation()

    expect(mocks.shutdownGatewaySubagentRuntime).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownScheduler).toHaveBeenCalledTimes(1)
    expect(mocks.cancelAllRetries).toHaveBeenCalledTimes(1)
    expect(getGatewayAutomationStatus().initialized).toBe(false)
  })
})
