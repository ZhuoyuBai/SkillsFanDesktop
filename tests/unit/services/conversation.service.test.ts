import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/main/services/memory', () => ({
  getMemoryIndexManager: () => ({
    enabled: false,
    indexMessage: vi.fn()
  })
}))

import { initializeApp } from '../../../src/main/services/config.service'
import {
  addMessage,
  createConversation,
  getConversation,
  listConversations,
  updateLastMessage
} from '../../../src/main/services/conversation.service'

describe('Conversation Service', () => {
  beforeEach(async () => {
    await initializeApp()
  })

  it('persists user attachments in saved conversations', async () => {
    const conversation = createConversation('skillsfan-temp', 'Attachment Persistence')

    const imageAttachment = {
      id: 'img-1',
      type: 'image' as const,
      mediaType: 'image/png' as const,
      data: 'ZmFrZS1pbWFnZQ==',
      name: 'cover.png',
      size: 128
    }

    const textAttachment = {
      id: 'text-1',
      type: 'text' as const,
      mediaType: 'text/plain',
      content: 'hello attachment',
      name: 'notes.txt',
      size: 16
    }

    addMessage('skillsfan-temp', conversation.id, {
      role: 'user',
      content: 'message with attachment',
      images: [imageAttachment],
      attachments: [imageAttachment, textAttachment]
    })

    const savedConversation = getConversation('skillsfan-temp', conversation.id)
    expect(savedConversation).not.toBeNull()
    expect(savedConversation?.messages).toHaveLength(1)
    expect(savedConversation?.messages[0].images).toEqual([imageAttachment])
    expect(savedConversation?.messages[0].attachments).toEqual([imageAttachment, textAttachment])

    // Flush background index tasks before the test sandbox is cleaned up.
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('uses thought previews when assistant messages have no text content', async () => {
    const conversation = createConversation('skillsfan-temp', 'Thought Preview')

    addMessage('skillsfan-temp', conversation.id, {
      role: 'user',
      content: 'create a team'
    })

    addMessage('skillsfan-temp', conversation.id, {
      role: 'assistant',
      content: '',
      toolCalls: []
    })

    updateLastMessage('skillsfan-temp', conversation.id, {
      content: '',
      thoughts: [{
        id: 'tool-1',
        type: 'tool_use',
        content: '',
        timestamp: '2026-03-10T00:00:00.000Z',
        toolName: 'TeamCreate',
        toolInput: { name: 'research-team' }
      }]
    })

    const meta = listConversations('skillsfan-temp').find(item => item.id === conversation.id)

    expect(meta?.preview).toBe('Tool: TeamCreate')

    await new Promise(resolve => setTimeout(resolve, 0))
  })
})
