/**
 * Agent Module - Question Handler
 *
 * Handles AskUserQuestion tool - pauses execution and waits for user's answer.
 * Similar pattern to permission-handler.ts but for user questions.
 */

import { activeSessions } from './session-manager'
import { sendToRenderer } from './helpers'
import type { UserQuestionInfo } from './types'

/**
 * Handle AskUserQuestion tool - pause and wait for user input
 *
 * @param conversationId - The conversation ID
 * @param toolId - The tool call ID
 * @param questions - The questions to ask the user
 * @returns Promise that resolves with user's answers
 */
export async function handleUserQuestion(
  conversationId: string,
  toolId: string,
  questions: UserQuestionInfo['questions']
): Promise<Record<string, string>> {
  const session = activeSessions.get(conversationId)
  if (!session) {
    throw new Error(`Session not found for conversation: ${conversationId}`)
  }

  console.log(`[QuestionHandler][${conversationId}] AskUserQuestion triggered, waiting for user input`)

  // Set pending question state
  session.pendingUserQuestion = {
    toolId,
    questions,
    inputResolve: null
  }

  // Notify frontend to show question UI
  sendToRenderer('agent:user-question', session.spaceId, conversationId, {
    toolId,
    questions
  })

  // Wait for user's answer
  return new Promise((resolve) => {
    session.pendingUserQuestion!.inputResolve = resolve
  })
}

/**
 * Handle user's answer to AskUserQuestion
 *
 * @param conversationId - The conversation ID
 * @param answers - User's answers (question -> answer mapping)
 */
export function answerUserQuestion(
  conversationId: string,
  answers: Record<string, string>
): void {
  const session = activeSessions.get(conversationId)
  if (!session) {
    console.warn(`[QuestionHandler][${conversationId}] Session not found when answering question`)
    return
  }

  if (!session.pendingUserQuestion) {
    console.warn(`[QuestionHandler][${conversationId}] No pending question to answer`)
    return
  }

  console.log(`[QuestionHandler][${conversationId}] User answered question:`, Object.keys(answers))

  const { inputResolve } = session.pendingUserQuestion

  // Clear question state
  session.pendingUserQuestion = null

  // Resolve with user's answer
  if (inputResolve) {
    inputResolve(answers)
  }

  // Notify frontend that question was answered
  sendToRenderer('agent:user-question-answered', session.spaceId, conversationId, {})
}

/**
 * Check if there's a pending question for a conversation
 */
export function hasPendingQuestion(conversationId: string): boolean {
  const session = activeSessions.get(conversationId)
  return session?.pendingUserQuestion !== null
}

/**
 * Get pending question info for a conversation
 */
export function getPendingQuestion(conversationId: string): UserQuestionInfo | null {
  const session = activeSessions.get(conversationId)
  return session?.pendingUserQuestion ?? null
}
