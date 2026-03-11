import fs from 'fs'
import path from 'path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from 'electron'
import type { NormalizedOutboundEvent } from '@shared/types/channel'

const { botMocks, getConversationMock } = vi.hoisted(() => ({
  botMocks: {
    start: vi.fn(),
    stop: vi.fn(),
    onMessage: vi.fn(),
    onCardAction: vi.fn(),
    sendText: vi.fn(),
    sendPost: vi.fn(),
    sendCard: vi.fn(),
    updateCard: vi.fn(),
    uploadImage: vi.fn(),
    sendImage: vi.fn()
  },
  getConversationMock: vi.fn()
}))

vi.mock('@main/services/conversation.service', () => ({
  createConversation: vi.fn(),
  getConversation: getConversationMock,
  updateConversation: vi.fn()
}))

vi.mock('@main/services/feishu', () => {
  class MockFeishuBotService {
    start = botMocks.start
    stop = botMocks.stop
    onMessage = botMocks.onMessage
    onCardAction = botMocks.onCardAction
    sendText = botMocks.sendText
    sendPost = botMocks.sendPost
    sendCard = botMocks.sendCard
    updateCard = botMocks.updateCard
    uploadImage = botMocks.uploadImage
    sendImage = botMocks.sendImage
  }

  class MockFeishuAccessControl {}

  class MockFeishuSessionRouter {
    initialize = vi.fn()
    getAllSessions = vi.fn(() => [])
  }

  return {
    FeishuBotService: MockFeishuBotService,
    FeishuAccessControl: MockFeishuAccessControl,
    FeishuSessionRouter: MockFeishuSessionRouter,
    hasFeishuConversationTarget: vi.fn(() => false),
    markdownToPost: vi.fn((text: string) => ({ text })),
    chunkMessage: vi.fn((text: string) => [text]),
    buildThinkingCard: vi.fn(() => ({})),
    buildToolApprovalCard: vi.fn(() => ({})),
    buildUserQuestionCard: vi.fn(() => ({})),
    buildToolApprovalResultCard: vi.fn(() => ({})),
    buildErrorCard: vi.fn(() => ({})),
    buildPairingPromptCard: vi.fn(() => ({})),
    buildPairingSuccessCard: vi.fn(() => ({})),
    buildRateLimitCard: vi.fn(() => ({})),
    buildCompleteCard: vi.fn(() => ({})),
    buildFailedCard: vi.fn(() => ({})),
    buildThinkingCardWithTools: vi.fn(() => ({}))
  }
})

vi.mock('@main/services/feishu/tool-status', () => ({
  summarizeToolCall: vi.fn(() => ({ key: 'tool', text: 'tool' })),
  upsertToolSummary: vi.fn((existing: Array<{ key: string; text: string }>) => existing)
}))

vi.mock('@main/services/feishu/card-action', () => ({
  parseFeishuCardActionValue: vi.fn(() => null)
}))

vi.mock('@main/services/channel/channel-manager', () => ({
  getChannelManager: vi.fn(() => null)
}))

import { FeishuChannel } from '@main/services/channel/adapters/feishu.channel'

describe('FeishuChannel reply images', () => {
  let channel: FeishuChannel

  beforeEach(() => {
    channel = new FeishuChannel()
    ;(app as any).getLocale = vi.fn(() => 'zh-CN')

    getConversationMock.mockReset()
    botMocks.start.mockReset()
    botMocks.stop.mockReset()
    botMocks.onMessage.mockReset()
    botMocks.onCardAction.mockReset()
    botMocks.sendText.mockReset()
    botMocks.sendPost.mockReset().mockResolvedValue('post-1')
    botMocks.sendCard.mockReset()
    botMocks.updateCard.mockReset()
    botMocks.uploadImage.mockReset().mockResolvedValue('img-key-1')
    botMocks.sendImage.mockReset().mockResolvedValue('img-msg-1')
  })

  async function dispatchComplete(conversationId = 'conv-1'): Promise<void> {
    const event: NormalizedOutboundEvent = {
      type: 'agent:complete',
      spaceId: 'skillsfan-temp',
      conversationId,
      payload: {},
      timestamp: Date.now()
    }

    await (channel as any).dispatchToChat('chat-1', event)
  }

  it('sends base64 screenshots from assistant tool results back to Feishu', async () => {
    const base64 = Buffer.from('fake-image').toString('base64')
    getConversationMock.mockReturnValue({
      messages: [{
        role: 'assistant',
        content: '截图已完成',
        thoughts: [{
          type: 'tool_result',
          toolOutput: JSON.stringify([{
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64
            }
          }])
        }]
      }]
    })

    await dispatchComplete()

    expect(botMocks.sendPost).toHaveBeenCalledWith('chat-1', { text: '截图已完成' })
    expect(botMocks.uploadImage).toHaveBeenCalledTimes(1)
    expect(Buffer.isBuffer(botMocks.uploadImage.mock.calls[0][0])).toBe(true)
    expect(botMocks.sendImage).toHaveBeenCalledWith('chat-1', 'img-key-1')
  })

  it('falls back to local image paths mentioned in assistant content', async () => {
    const imagePath = path.join(globalThis.__HALO_TEST_DIR__, 'desktop_screenshot.png')
    fs.writeFileSync(imagePath, Buffer.from('not-a-real-png-but-exists'))

    getConversationMock.mockReturnValue({
      messages: [{
        role: 'assistant',
        content: `截图已保存至：\`${imagePath}\``
      }]
    })

    await dispatchComplete()

    expect(botMocks.uploadImage).toHaveBeenCalledWith(imagePath)
    expect(botMocks.sendImage).toHaveBeenCalledWith('chat-1', 'img-key-1')
  })

  it('does not resend reply images when complete is emitted twice for the same turn', async () => {
    const imagePath = path.join(globalThis.__HALO_TEST_DIR__, 'desktop_screenshot.png')
    fs.writeFileSync(imagePath, Buffer.from('not-a-real-png-but-exists'))

    getConversationMock.mockReturnValue({
      messages: [{
        role: 'assistant',
        content: `截图已保存至：\`${imagePath}\``
      }]
    })

    await dispatchComplete('conv-repeat')
    await dispatchComplete('conv-repeat')

    expect(botMocks.uploadImage).toHaveBeenCalledTimes(1)
    expect(botMocks.sendImage).toHaveBeenCalledTimes(1)
  })
})
