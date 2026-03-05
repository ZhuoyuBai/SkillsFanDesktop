/**
 * Conversation IPC Handlers
 */

import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  touchConversation,
  deleteConversation,
  clearAllConversations,
  addMessage,
  updateLastMessage
} from '../services/conversation.service'
import { ipcHandle } from './utils'

export function registerConversationHandlers(): void {
  ipcHandle('conversation:list', (_e, spaceId: string) => listConversations(spaceId))

  ipcHandle('conversation:create', (_e, spaceId: string, title?: string) =>
    createConversation(spaceId, title)
  )

  ipcHandle('conversation:get', (_e, spaceId: string, conversationId: string) =>
    getConversation(spaceId, conversationId)
  )

  ipcHandle('conversation:update',
    (_e, spaceId: string, conversationId: string, updates: Record<string, unknown>) =>
      updateConversation(spaceId, conversationId, updates)
  )

  ipcHandle('conversation:touch', (_e, spaceId: string, conversationId: string) =>
    touchConversation(spaceId, conversationId)
  )

  ipcHandle('conversation:delete', (_e, spaceId: string, conversationId: string) =>
    deleteConversation(spaceId, conversationId)
  )

  ipcHandle('conversation:clear-all', (_e, spaceId: string) => clearAllConversations(spaceId))

  ipcHandle('conversation:add-message',
    (_e, spaceId: string, conversationId: string,
      message: { role: 'user' | 'assistant' | 'system'; content: string }) =>
      addMessage(spaceId, conversationId, message)
  )

  ipcHandle('conversation:update-last-message',
    (_e, spaceId: string, conversationId: string, updates: Record<string, unknown>) =>
      updateLastMessage(spaceId, conversationId, updates)
  )
}
