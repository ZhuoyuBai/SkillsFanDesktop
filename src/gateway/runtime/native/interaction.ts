import { sendToRenderer } from '../../../main/services/agent/helpers'
import type { ToolCall, UserQuestionInfo } from '../../../main/services/agent/types'

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
  resolve: (answers: Record<string, string>) => void
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
}): Promise<Record<string, string>> {
  const questionInfo: UserQuestionInfo = {
    toolId: params.toolId || `native-question-${Date.now()}`,
    questions: params.questions,
    inputResolve: null
  }

  lastUserQuestionRequestedAt = new Date().toISOString()
  sendToRenderer('agent:user-question', params.spaceId, params.conversationId, {
    toolId: questionInfo.toolId,
    questions: params.questions
  })

  return await new Promise((resolve) => {
    pendingNativeUserQuestions.set(params.conversationId, {
      spaceId: params.spaceId,
      conversationId: params.conversationId,
      questionInfo,
      resolve
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
  pending.resolve(answers)
  lastUserQuestionResolvedAt = new Date().toISOString()
  sendToRenderer('agent:user-question-answered', pending.spaceId, conversationId, {})
  return true
}

export function resetNativeRuntimeInteractionForTests(): void {
  pendingNativeToolApprovals.clear()
  pendingNativeUserQuestions.clear()
  lastToolApprovalRequestedAt = null
  lastToolApprovalResolvedAt = null
  lastUserQuestionRequestedAt = null
  lastUserQuestionResolvedAt = null
}
