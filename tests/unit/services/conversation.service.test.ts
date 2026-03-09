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
  getConversation
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
})
