import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listSubagentRunsForConversation: vi.fn(() => []),
  listGatewaySubagentRunsForConversation: vi.fn(() => []),
  getNativeActiveRun: vi.fn(() => null),
  listNativeActiveRuns: vi.fn(() => []),
  abortNativeActiveRun: vi.fn(() => false),
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

vi.mock('../../../../src/gateway/runtime/orchestrator', () => ({
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

vi.mock('../../../../src/gateway/runtime/native/active-runs', () => ({
  getNativeActiveRun: mocks.getNativeActiveRun,
  listNativeActiveRuns: mocks.listNativeActiveRuns,
  abortNativeActiveRun: mocks.abortNativeActiveRun
}))

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

import { stepReporterRuntime } from '../../../../src/gateway/host-runtime/step-reporter/runtime'
import {
  getActiveSessions,
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
    mocks.getNativeActiveRun.mockReturnValue(null)
    mocks.listNativeActiveRuns.mockReturnValue([])
    mocks.abortNativeActiveRun.mockReturnValue(false)
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

  it('stops a native-only active run when no Claude session exists', async () => {
    mocks.abortNativeActiveRun.mockReturnValue(true)

    await stopGeneration('conv-native-stop')

    expect(mocks.abortNativeActiveRun).toHaveBeenCalledWith('conv-native-stop', 'stop')
  })

  it('returns native runtime route info when a native run is still active', () => {
    mocks.getNativeActiveRun.mockReturnValue({
      spaceId: 'space-9',
      conversationId: 'conv-native',
      startedAt: Date.now(),
      runtimeRoute: {
        selectedKind: 'native',
        preferredKind: 'native',
        experience: 'new-route',
        noteId: 'new-route-simple-task',
        configuredMode: 'hybrid',
        taskComplexity: 'lightweight'
      }
    })

    const state = getSessionState('conv-native')

    expect(state.isActive).toBe(true)
    expect(state.runtimeRoute).toEqual({
      selectedKind: 'native',
      preferredKind: 'native',
      experience: 'new-route',
      noteId: 'new-route-simple-task',
      configuredMode: 'hybrid',
      taskComplexity: 'lightweight'
    })
    expect(state.spaceId).toBe('space-9')
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

  it('interrupts a native run and sends a fresh follow-up request', async () => {
    mocks.getNativeActiveRun.mockReturnValue({
      spaceId: 'space-1',
      conversationId: 'conv-native',
      startedAt: Date.now(),
      latestContent: 'partial native answer',
      runtimeRoute: {
        selectedKind: 'native',
        preferredKind: 'native',
        experience: 'new-route',
        noteId: 'new-route-simple-task',
        configuredMode: 'hybrid',
        taskComplexity: 'lightweight'
      },
      requestContext: {
        aiBrowserEnabled: true,
        modelSource: 'openai-codex'
      }
    })

    const { updateLastMessage } = await import('../../../../src/main/services/conversation.service')
    const { sendMessage } = await import('../../../../src/gateway/runtime/orchestrator')

    await interruptAndInject(null, {
      spaceId: 'space-1',
      conversationId: 'conv-native',
      message: 'continue with this'
    })

    expect(mocks.abortNativeActiveRun).toHaveBeenCalledWith('conv-native', 'inject')
    expect(updateLastMessage).toHaveBeenCalledWith('space-1', 'conv-native', {
      content: 'partial native answer'
    })
    expect(sendMessage).toHaveBeenCalledWith(null, expect.objectContaining({
      spaceId: 'space-1',
      conversationId: 'conv-native',
      message: 'continue with this',
      aiBrowserEnabled: true,
      modelSource: 'openai-codex'
    }))
  })

  it('includes native active runs in the active session list', () => {
    mocks.listNativeActiveRuns.mockReturnValue([
      {
        spaceId: 'space-1',
        conversationId: 'conv-native-1',
        startedAt: Date.now(),
        runtimeRoute: {
          selectedKind: 'native',
          preferredKind: 'native',
          experience: 'new-route',
          noteId: 'new-route-simple-task',
          configuredMode: 'hybrid',
          taskComplexity: 'lightweight'
        }
      }
    ])

    expect(getActiveSessions()).toContain('conv-native-1')
  })
})
