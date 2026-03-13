import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listSubagentRunsForConversation: vi.fn(() => []),
  listGatewaySubagentRunsForConversation: vi.fn(() => []),
  clearQueue: vi.fn(() => 0),
  canDelegateGatewayCommands: vi.fn(() => false),
  executeGatewayCommand: vi.fn(async () => ({
    stopped: true,
    conversationId: 'conv-2'
  }))
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

vi.mock('../../../../src/gateway/automation/subagents', () => ({
  listGatewaySubagentRunsForConversation: mocks.listGatewaySubagentRunsForConversation
}))

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

import { stepReporterRuntime } from '../../../../src/gateway/host-runtime/step-reporter/runtime'
import {
  getSessionState,
  interruptAndInject,
  stopGeneration
} from '../../../../src/main/services/agent/control'
import { activeSessions } from '../../../../src/main/services/agent/session-manager'

describe('agent control session recovery', () => {
  beforeEach(() => {
    activeSessions.clear()
    stepReporterRuntime.clearAll()
    mocks.listSubagentRunsForConversation.mockReturnValue([])
    mocks.listGatewaySubagentRunsForConversation.mockReturnValue([])
    mocks.clearQueue.mockReturnValue(0)
    mocks.canDelegateGatewayCommands.mockReturnValue(false)
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
    expect(mocks.listGatewaySubagentRunsForConversation).toHaveBeenCalledWith('conv-1')
    expect(state.hostSteps).toEqual([
      expect.objectContaining({
        taskId: 'conv-1',
        stepId: 'step-1',
        category: 'browser',
        action: 'browser_snapshot'
      })
    ])
  })

  it('delegates stopGeneration to the external gateway command path when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    await stopGeneration('conv-2')

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('agent.stop', {
      conversationId: 'conv-2'
    })
  })

  it('delegates interruptAndInject to the external gateway command path before touching local session state', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)
    mocks.executeGatewayCommand.mockResolvedValue({
      accepted: true,
      conversationId: 'conv-3'
    })

    await interruptAndInject(null, {
      spaceId: 'space-1',
      conversationId: 'conv-3',
      message: 'follow up'
    })

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('agent.interrupt-inject', {
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-3',
        message: 'follow up'
      }
    })
  })
})
