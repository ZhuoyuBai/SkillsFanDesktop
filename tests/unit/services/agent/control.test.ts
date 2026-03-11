import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listSubagentRunsForConversation: vi.fn(() => []),
  clearQueue: vi.fn(() => 0)
}))

vi.mock('../../../../src/main/services/agent/session-manager', () => ({
  activeSessions: new Map(),
  v2Sessions: new Map()
}))

vi.mock('../../../../src/main/services/conversation.service', () => ({
  getConversation: vi.fn(() => null),
  updateLastMessage: vi.fn()
}))

vi.mock('../../../../src/main/services/agent/send-message', () => ({
  sendMessage: vi.fn()
}))

vi.mock('../../../../src/main/services/agent/lane-queue', () => ({
  agentQueue: {
    clearQueue: mocks.clearQueue
  }
}))

vi.mock('../../../../src/main/services/agent/subagent/runtime', () => ({
  killSubagentRun: vi.fn(),
  listSubagentRunsForConversation: mocks.listSubagentRunsForConversation,
  suppressAutoAnnounceForConversation: vi.fn()
}))

import { stepReporterRuntime } from '../../../../src/gateway/host-runtime/step-reporter/runtime'
import { getSessionState } from '../../../../src/main/services/agent/control'
import { activeSessions } from '../../../../src/main/services/agent/session-manager'

describe('agent control session recovery', () => {
  beforeEach(() => {
    activeSessions.clear()
    stepReporterRuntime.clearAll()
    mocks.listSubagentRunsForConversation.mockReturnValue([])
    mocks.clearQueue.mockReturnValue(0)
  })

  it('returns host steps even when no active session exists', () => {
    stepReporterRuntime.recordStep({
      taskId: 'conv-1',
      stepId: 'step-1',
      category: 'browser',
      action: 'browser_snapshot',
      summary: 'Captured page structure'
    })

    const state = getSessionState('conv-1')

    expect(state.isActive).toBe(false)
    expect(state.thoughts).toEqual([])
    expect(state.hostSteps).toEqual([
      expect.objectContaining({
        taskId: 'conv-1',
        stepId: 'step-1',
        category: 'browser',
        action: 'browser_snapshot'
      })
    ])
  })
})
