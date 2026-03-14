import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendToRenderer: vi.fn()
}))

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  sendToRenderer: mocks.sendToRenderer
}))

import {
  NativeUserQuestionTimeoutError,
  getNativeRuntimeInteractionStatus,
  requestNativeToolApproval,
  requestNativeUserQuestion,
  resolveNativeToolApproval,
  resolveNativeUserQuestion,
  resetNativeRuntimeInteractionForTests
} from '../../../../src/gateway/runtime/native/interaction'

describe('native runtime interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    resetNativeRuntimeInteractionForTests()
  })

  it('requests tool approval through existing renderer events and resolves later', async () => {
    const pendingApproval = requestNativeToolApproval({
      spaceId: 'space-1',
      conversationId: 'conv-1',
      toolName: 'mcp__local-tools__terminal_run_command',
      input: {
        command: 'pnpm test'
      },
      description: 'Run terminal command: pnpm test'
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        name: 'mcp__local-tools__terminal_run_command',
        status: 'waiting_approval',
        requiresApproval: true,
        description: 'Run terminal command: pnpm test'
      })
    )

    expect(getNativeRuntimeInteractionStatus()).toEqual(expect.objectContaining({
      pendingToolApprovalCount: 1,
      pendingUserQuestionCount: 0,
      pendingConversationIds: ['conv-1'],
      pendingUserQuestionPreview: null,
      pendingUserQuestionHeader: null,
      lastToolApprovalRequestedAt: expect.any(String),
      lastToolApprovalResolvedAt: null
    }))

    expect(resolveNativeToolApproval('conv-1', true)).toBe(true)

    await expect(pendingApproval).resolves.toBe(true)
    expect(getNativeRuntimeInteractionStatus()).toEqual(expect.objectContaining({
      pendingToolApprovalCount: 0,
      pendingUserQuestionCount: 0,
      pendingConversationIds: [],
      pendingUserQuestionPreview: null,
      pendingUserQuestionHeader: null,
      lastToolApprovalResolvedAt: expect.any(String)
    }))
    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-approval-resolved',
      'space-1',
      'conv-1',
      expect.objectContaining({
        toolName: 'mcp__local-tools__terminal_run_command',
        approved: true
      })
    )
  })

  it('requests a native user question and resolves the shared answer event', async () => {
    const pendingAnswer = requestNativeUserQuestion({
      spaceId: 'space-1',
      conversationId: 'conv-2',
      questions: [
        {
          header: 'Confirm',
          question: 'Continue?',
          options: [
            { label: 'Yes', description: 'Proceed' }
          ],
          multiSelect: false
        }
      ]
    })

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:user-question',
      'space-1',
      'conv-2',
      expect.objectContaining({
        toolId: expect.any(String),
        questions: expect.any(Array)
      })
    )

    expect(getNativeRuntimeInteractionStatus()).toEqual(expect.objectContaining({
      pendingToolApprovalCount: 0,
      pendingUserQuestionCount: 1,
      pendingConversationIds: ['conv-2'],
      pendingUserQuestionPreview: 'Continue?',
      pendingUserQuestionHeader: 'Confirm',
      lastUserQuestionRequestedAt: expect.any(String),
      lastUserQuestionResolvedAt: null
    }))

    expect(resolveNativeUserQuestion('conv-2', { answer: 'Yes' })).toBe(true)
    await expect(pendingAnswer).resolves.toEqual({ answer: 'Yes' })
    expect(getNativeRuntimeInteractionStatus()).toEqual(expect.objectContaining({
      pendingToolApprovalCount: 0,
      pendingUserQuestionCount: 0,
      pendingConversationIds: [],
      pendingUserQuestionPreview: null,
      pendingUserQuestionHeader: null,
      lastUserQuestionResolvedAt: expect.any(String)
    }))
    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:user-question-answered',
      'space-1',
      'conv-2',
      {}
    )
  })

  it('times out a pending native user question after the default wait window', async () => {
    vi.useFakeTimers()

    const pendingAnswer = requestNativeUserQuestion({
      spaceId: 'space-1',
      conversationId: 'conv-timeout',
      questions: [
        {
          header: '请选择',
          question: '你想继续处理哪一个项目？',
          options: [
            { label: 'web-app', description: '继续处理前台项目' }
          ],
          multiSelect: false
        }
      ]
    })
    const timedOutAssertion = expect(pendingAnswer).rejects.toBeInstanceOf(NativeUserQuestionTimeoutError)

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

    await timedOutAssertion
    expect(getNativeRuntimeInteractionStatus()).toEqual(expect.objectContaining({
      pendingUserQuestionCount: 0,
      pendingUserQuestionPreview: null
    }))
    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:user-question-answered',
      'space-1',
      'conv-timeout',
      expect.objectContaining({
        timedOut: true
      })
    )
  })
})
