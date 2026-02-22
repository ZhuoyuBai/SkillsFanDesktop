import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  enqueue: vi.fn(),
  sendToRenderer: vi.fn()
}))

vi.mock('../../../../src/main/services/agent/lane-queue', () => ({
  agentQueue: {
    getStatus: mocks.getStatus,
    enqueue: mocks.enqueue
  }
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: vi.fn(() => ({ mcpServers: {}, memory: { enabled: true } }))
}))

vi.mock('../../../../src/main/services/conversation.service', () => ({
  getConversation: vi.fn(() => null),
  saveSessionId: vi.fn(),
  addMessage: vi.fn(),
  updateLastMessage: vi.fn()
}))

vi.mock('../../../../src/main/services/ai-browser/tool-utils', () => ({
  isAIBrowserTool: vi.fn(() => false)
}))

vi.mock('../../../../src/main/services/skill', () => ({
  hasSkills: vi.fn(() => false),
  ensureSkillsInitialized: vi.fn(async () => {})
}))

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  getHeadlessElectronPath: vi.fn(() => '/mock/electron'),
  getWorkingDir: vi.fn(() => '/mock/workdir'),
  getApiCredentials: vi.fn(async () => ({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'mock-key'
  })),
  getEnabledMcpServers: vi.fn(() => ({})),
  sendToRenderer: mocks.sendToRenderer,
  setMainWindow: vi.fn()
}))

vi.mock('../../../../src/main/services/agent/session-manager', () => ({
  getOrCreateV2Session: vi.fn(),
  closeV2Session: vi.fn(),
  createSessionState: vi.fn(),
  registerActiveSession: vi.fn(),
  unregisterActiveSession: vi.fn(),
  v2Sessions: new Map()
}))

vi.mock('../../../../src/main/services/agent/mcp-manager', () => ({
  broadcastMcpStatus: vi.fn()
}))

vi.mock('../../../../src/main/services/agent/sdk-options', () => ({
  buildSdkOptions: vi.fn(async () => ({ sdkOptions: {}, addedMcpServers: [] })),
  resolveSdkTransport: vi.fn(async () => ({
    anthropicBaseUrl: 'https://api.anthropic.com',
    anthropicApiKey: 'mock-key',
    sdkModel: 'claude-sonnet-4-20250514',
    routed: false
  }))
}))

vi.mock('../../../../src/main/services/agent/message-utils', () => ({
  formatCanvasContext: vi.fn(() => ''),
  buildMessageContent: vi.fn(() => ''),
  parseSDKMessage: vi.fn(() => null),
  extractSingleUsage: vi.fn(() => null),
  extractResultUsage: vi.fn(() => null)
}))

vi.mock('../../../../src/main/services/memory', () => ({
  getMemoryIndexManager: vi.fn(() => ({
    searchRelevant: vi.fn(async () => []),
    add: vi.fn(async () => {})
  }))
}))

import { sendMessage } from '../../../../src/main/services/agent/send-message'

describe('send-message', () => {
  const request = {
    spaceId: 'space-1',
    conversationId: 'conv-1',
    message: 'hello'
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStatus.mockReturnValue({ running: false, queued: 0 })
    mocks.enqueue.mockResolvedValue(undefined)
  })

  it('notifies renderer when message is queued behind a running task', async () => {
    mocks.getStatus.mockReturnValue({ running: true, queued: 2 })

    await sendMessage(null, request)

    expect(mocks.sendToRenderer).toHaveBeenCalledTimes(1)
    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:queued',
      'space-1',
      'conv-1',
      { type: 'queued', position: 3 }
    )
    expect(mocks.enqueue).toHaveBeenCalledWith(
      'conv-1',
      expect.any(Function),
      { overflow: 'reject', maxQueueLength: 3 }
    )
  })

  it('enqueues message without queue notification when lane is idle', async () => {
    await sendMessage(null, request)

    expect(mocks.sendToRenderer).not.toHaveBeenCalled()
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
    expect(mocks.enqueue).toHaveBeenCalledWith(
      'conv-1',
      expect.any(Function),
      { overflow: 'reject', maxQueueLength: 3 }
    )
  })

  it('propagates enqueue errors to caller', async () => {
    const enqueueError = new Error('queue rejected')
    mocks.enqueue.mockRejectedValueOnce(enqueueError)

    await expect(sendMessage(null, request)).rejects.toThrow('queue rejected')
  })
})
