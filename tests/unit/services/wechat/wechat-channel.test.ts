import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from 'electron'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({})),
  getActiveSpaceId: vi.fn(() => 'skillsfan-temp'),
  createConversation: vi.fn(),
  getConversation: vi.fn(() => null),
  updateConversation: vi.fn(),
  saveConfig: vi.fn(),
  sendText: vi.fn(),
  sendTyping: vi.fn(),
  getBotToken: vi.fn(() => 'bot-token'),
  trackConversation: vi.fn(),
  getChannel: vi.fn(),
  handleToolApproval: vi.fn(),
  activeSessions: new Map<string, any>()
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig,
  getActiveSpaceId: mocks.getActiveSpaceId,
  getHaloDir: vi.fn(() => '/tmp/skillsfan-tests')
}))

vi.mock('../../../../src/main/services/conversation.service', () => ({
  createConversation: mocks.createConversation,
  getConversation: mocks.getConversation,
  updateConversation: mocks.updateConversation
}))

vi.mock('../../../../src/main/services/channel/channel-manager', () => ({
  getChannelManager: vi.fn(() => ({
    trackConversation: mocks.trackConversation,
    getChannel: mocks.getChannel
  }))
}))

vi.mock('../../../../src/main/services/wechat/ilink-client', () => ({
  ILinkClient: class {
    sendText = mocks.sendText
    sendTyping = mocks.sendTyping
  }
}))

vi.mock('../../../../src/main/services/wechat/polling-engine', () => ({
  WeChatPollingEngine: class {
    onMessage(): void {}
    start(): void {}
    stop(): void {}
    isRunning(): boolean {
      return true
    }
    getBotToken(): string {
      return mocks.getBotToken()
    }
    getBaseUrl(): string | undefined {
      return undefined
    }
  }
}))

vi.mock('../../../../src/main/services/agent', () => ({
  activeSessions: mocks.activeSessions,
  handleToolApproval: mocks.handleToolApproval
}))

import { WeChatChannel } from '../../../../src/main/services/channel/adapters/wechat.channel'

describe('WeChatChannel', () => {
  const config = {
    enabled: true,
    pairingCode: '123456',
    allowedUserIds: []
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getActiveSpaceId.mockReturnValue('skillsfan-temp')
    mocks.getConfig.mockReturnValue({ wechat: config })
    mocks.createConversation.mockReturnValue({ id: 'conv-created' })
    mocks.getConversation.mockReturnValue(null)
    mocks.sendText.mockResolvedValue(undefined)
    mocks.sendTyping.mockResolvedValue(undefined)
    mocks.getBotToken.mockReturnValue('bot-token')
    mocks.activeSessions.clear()
    vi.mocked(app.getLocale).mockReturnValue('en-US')
  })

  it('stores the real conversation id returned by createConversation', async () => {
    const channel = new WeChatChannel()

    const session = await (channel as any).resolveOrCreateSession('user@im.wechat', 'ctx-1', config)

    expect(mocks.createConversation).toHaveBeenCalledWith('skillsfan-temp', 'WeChat: user')
    expect(session).toEqual({ spaceId: 'skillsfan-temp', conversationId: 'conv-created' })
    expect(channel.getSessionRouter().getSession('user@im.wechat')).toMatchObject({
      conversationId: 'conv-created',
      contextToken: 'ctx-1',
      spaceId: 'skillsfan-temp'
    })
  })

  it('recreates stale session mappings before routing new messages', async () => {
    const channel = new WeChatChannel()

    channel.getSessionRouter().setSession({
      fromUserId: 'user@im.wechat',
      spaceId: 'space-old',
      conversationId: 'conv-stale',
      contextToken: 'ctx-old',
      pairedAt: 1,
      lastMessageAt: 1
    })

    mocks.getConversation.mockImplementation((spaceId: string, conversationId: string) => {
      if (spaceId === 'space-old' && conversationId === 'conv-stale') {
        return null
      }
      return { id: conversationId, messages: [] }
    })
    mocks.createConversation.mockReturnValue({ id: 'conv-fresh' })

    const session = await (channel as any).resolveOrCreateSession('user@im.wechat', 'ctx-new', config)

    expect(mocks.createConversation).toHaveBeenCalledWith('space-old', 'WeChat: user')
    expect(session).toEqual({ spaceId: 'space-old', conversationId: 'conv-fresh' })
    expect(channel.getSessionRouter().getSession('user@im.wechat')).toMatchObject({
      conversationId: 'conv-fresh',
      contextToken: 'ctx-new',
      spaceId: 'space-old'
    })
  })

  it('sends the final reply from agent message content payloads', async () => {
    const channel = new WeChatChannel()

    channel.getSessionRouter().setSession({
      fromUserId: 'user@im.wechat',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      contextToken: 'ctx-1',
      pairedAt: 1,
      lastMessageAt: 1
    })

    channel.dispatch({
      type: 'agent:start',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      payload: {},
      timestamp: Date.now()
    })
    channel.dispatch({
      type: 'agent:message',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      payload: {
        content: 'Hello from agent',
        isComplete: false
      },
      timestamp: Date.now()
    })
    channel.dispatch({
      type: 'agent:complete',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      payload: {},
      timestamp: Date.now()
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.sendText).toHaveBeenCalledWith('bot-token', 'user@im.wechat', 'ctx-1', 'Hello from agent', undefined)
  })

  it('prompts unpaired users to send the 6-digit pairing code first', async () => {
    const channel = new WeChatChannel()

    await (channel as any).handlePairing(
      'user@im.wechat',
      'ctx-1',
      '杭州今天的天气怎么样',
      'bot-token',
      config
    )

    expect(mocks.sendText).toHaveBeenCalledWith(
      'bot-token',
      'user@im.wechat',
      'ctx-1',
      'Before sending normal messages for the first time, please send the 6-digit pairing code shown in SkillsFan settings.',
      undefined
    )
  })

  it('handles Y/N replies for pending tool approvals', async () => {
    const channel = new WeChatChannel()

    channel.getSessionRouter().setSession({
      fromUserId: 'user@im.wechat',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      contextToken: 'ctx-1',
      pairedAt: 1,
      lastMessageAt: 1
    })
    mocks.activeSessions.set('conv-created', {
      pendingPermissionResolve: vi.fn()
    })

    const handled = await (channel as any).handlePendingToolApproval(
      'Y',
      'user@im.wechat',
      'ctx-1',
      'bot-token'
    )

    expect(handled).toBe(true)
    expect(mocks.handleToolApproval).toHaveBeenCalledWith('conv-created', true)
    expect(mocks.sendText).toHaveBeenCalledWith(
      'bot-token',
      'user@im.wechat',
      'ctx-1',
      'Approval received. Continuing execution.',
      undefined
    )
  })

  it('auto-approves remote tool calls by default', async () => {
    const channel = new WeChatChannel()

    channel.getSessionRouter().setSession({
      fromUserId: 'user@im.wechat',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      contextToken: 'ctx-1',
      pairedAt: 1,
      lastMessageAt: 1
    })

    channel.dispatch({
      type: 'agent:tool-call',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      payload: {
        requiresApproval: true,
        toolName: 'Bash'
      },
      timestamp: Date.now()
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.handleToolApproval).toHaveBeenCalledWith('conv-created', true)
    expect(mocks.sendText).not.toHaveBeenCalled()
  })

  it('localizes manual tool approval prompts in Traditional Chinese when auto-approve is disabled', async () => {
    const channel = new WeChatChannel()

    mocks.getConfig.mockReturnValue({
      wechat: {
        ...config,
        autoApproveTools: false
      }
    })
    vi.mocked(app.getLocale).mockReturnValue('zh-TW')

    channel.getSessionRouter().setSession({
      fromUserId: 'user@im.wechat',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      contextToken: 'ctx-1',
      pairedAt: 1,
      lastMessageAt: 1
    })

    channel.dispatch({
      type: 'agent:tool-call',
      spaceId: 'skillsfan-temp',
      conversationId: 'conv-created',
      payload: {
        requiresApproval: true,
        toolName: 'Bash'
      },
      timestamp: Date.now()
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.sendText).toHaveBeenCalledWith(
      'bot-token',
      'user@im.wechat',
      'ctx-1',
      '工具「Bash」需要批准。\n回覆 Y 表示允許，回覆 N 表示拒絕。',
      undefined
    )
    expect(mocks.handleToolApproval).not.toHaveBeenCalled()
  })
})
