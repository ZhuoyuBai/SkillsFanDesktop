import { sendToRenderer } from '../../../main/services/agent/helpers'
import type { ToolCall, UserQuestionInfo } from '../../../main/services/agent/types'
import { getNativeUserFacingMessage } from './user-facing'

const DEFAULT_NATIVE_USER_QUESTION_TIMEOUT_MS = 5 * 60 * 1000

export class NativeUserQuestionTimeoutError extends Error {
  constructor(timeoutMs = DEFAULT_NATIVE_USER_QUESTION_TIMEOUT_MS) {
    super(getNativeUserFacingMessage('questionTimedOut', {
      minutes: Math.max(1, Math.round(timeoutMs / 60_000))
    }))
    this.name = 'NativeUserQuestionTimeoutError'
  }
}

export interface NativeRuntimeInteractionStatus {
  pendingToolApprovalCount: number
  pendingUserQuestionCount: number
  pendingConversationIds: string[]
  pendingUserQuestionPreview: string | null
  pendingUserQuestionHeader: string | null
  lastToolApprovalRequestedAt: string | null
  lastToolApprovalResolvedAt: string | null
  lastUserQuestionRequestedAt: string | null
  lastUserQuestionResolvedAt: string | null
}

interface NativePendingToolApproval {
  spaceId: string
  conversationId: string
  toolCall: ToolCall
  resolve: (approved: boolean) => void
}

interface NativePendingUserQuestion {
  spaceId: string
  conversationId: string
  questionInfo: UserQuestionInfo
  timeout: NodeJS.Timeout
  resolve: (answers: Record<string, string>) => void
  reject: (error: Error) => void
}

const pendingNativeToolApprovals = new Map<string, NativePendingToolApproval>()
const pendingNativeUserQuestions = new Map<string, NativePendingUserQuestion>()
let lastToolApprovalRequestedAt: string | null = null
let lastToolApprovalResolvedAt: string | null = null
let lastUserQuestionRequestedAt: string | null = null
let lastUserQuestionResolvedAt: string | null = null

export function getNativeRuntimeInteractionStatus(): NativeRuntimeInteractionStatus {
  const latestPendingQuestion = Array.from(pendingNativeUserQuestions.values()).at(-1)?.questionInfo.questions[0]

  return {
    pendingToolApprovalCount: pendingNativeToolApprovals.size,
    pendingUserQuestionCount: pendingNativeUserQuestions.size,
    pendingConversationIds: Array.from(
      new Set([
        ...pendingNativeToolApprovals.keys(),
        ...pendingNativeUserQuestions.keys()
      ])
    ),
    pendingUserQuestionPreview: latestPendingQuestion?.question || null,
    pendingUserQuestionHeader: latestPendingQuestion?.header || null,
    lastToolApprovalRequestedAt,
    lastToolApprovalResolvedAt,
    lastUserQuestionRequestedAt,
    lastUserQuestionResolvedAt
  }
}

export async function requestNativeToolApproval(params: {
  spaceId: string
  conversationId: string
  toolName: string
  input: Record<string, unknown>
  description: string
}): Promise<boolean> {
  const toolCall: ToolCall = {
    id: `native-tool-${Date.now()}`,
    name: params.toolName,
    status: 'waiting_approval',
    input: params.input,
    requiresApproval: true,
    description: params.description
  }

  lastToolApprovalRequestedAt = new Date().toISOString()
  sendToRenderer('agent:tool-call', params.spaceId, params.conversationId, toolCall as unknown as Record<string, unknown>)

  return await new Promise((resolve) => {
    pendingNativeToolApprovals.set(params.conversationId, {
      spaceId: params.spaceId,
      conversationId: params.conversationId,
      toolCall,
      resolve
    })
  })
}

export function resolveNativeToolApproval(conversationId: string, approved: boolean): boolean {
  const pending = pendingNativeToolApprovals.get(conversationId)
  if (!pending) {
    return false
  }

  lastToolApprovalResolvedAt = new Date().toISOString()
  sendToRenderer('agent:tool-approval-resolved', pending.spaceId, conversationId, {
    toolId: pending.toolCall.id,
    toolName: pending.toolCall.name,
    approved
  })

  pendingNativeToolApprovals.delete(conversationId)
  pending.resolve(approved)
  return true
}

export async function requestNativeUserQuestion(params: {
  spaceId: string
  conversationId: string
  questions: UserQuestionInfo['questions']
  toolId?: string
  timeoutMs?: number
}): Promise<Record<string, string>> {
  const questionInfo: UserQuestionInfo = {
    toolId: params.toolId || `native-question-${Date.now()}`,
    questions: params.questions,
    inputResolve: null
  }
  const timeoutMs = params.timeoutMs ?? DEFAULT_NATIVE_USER_QUESTION_TIMEOUT_MS

  lastUserQuestionRequestedAt = new Date().toISOString()
  sendToRenderer('agent:user-question', params.spaceId, params.conversationId, {
    toolId: questionInfo.toolId,
    questions: params.questions
  })

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const pending = pendingNativeUserQuestions.get(params.conversationId)
      if (!pending) {
        return
      }

      pendingNativeUserQuestions.delete(params.conversationId)
      lastUserQuestionResolvedAt = new Date().toISOString()
      sendToRenderer('agent:user-question-answered', params.spaceId, params.conversationId, {
        timedOut: true
      })
      pending.reject(new NativeUserQuestionTimeoutError(timeoutMs))
    }, timeoutMs)

    pendingNativeUserQuestions.set(params.conversationId, {
      spaceId: params.spaceId,
      conversationId: params.conversationId,
      questionInfo,
      timeout,
      resolve,
      reject
    })
  })
}

export function resolveNativeUserQuestion(
  conversationId: string,
  answers: Record<string, string>
): boolean {
  const pending = pendingNativeUserQuestions.get(conversationId)
  if (!pending) {
    return false
  }

  pendingNativeUserQuestions.delete(conversationId)
  clearTimeout(pending.timeout)
  pending.resolve(answers)
  lastUserQuestionResolvedAt = new Date().toISOString()
  sendToRenderer('agent:user-question-answered', pending.spaceId, conversationId, {})
  return true
}

export function resetNativeRuntimeInteractionForTests(): void {
  pendingNativeToolApprovals.clear()
  for (const pendingQuestion of pendingNativeUserQuestions.values()) {
    clearTimeout(pendingQuestion.timeout)
  }
  pendingNativeUserQuestions.clear()
  lastToolApprovalRequestedAt = null
  lastToolApprovalResolvedAt = null
  lastUserQuestionRequestedAt = null
  lastUserQuestionResolvedAt = null
}
