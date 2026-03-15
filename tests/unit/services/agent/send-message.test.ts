import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  enqueue: vi.fn(),
  sendToRenderer: vi.fn(),
  getConversation: vi.fn(() => null),
  saveSessionId: vi.fn(),
  addMessage: vi.fn(),
  updateLastMessage: vi.fn(),
  getOrCreateV2Session: vi.fn(),
  closeV2Session: vi.fn(),
  createSessionState: vi.fn(),
  registerActiveSession: vi.fn(),
  unregisterActiveSession: vi.fn(),
  parseSDKMessage: vi.fn(),
  buildMessageContent: vi.fn(),
  preprocessImages: vi.fn(),
  getEnabledExtensions: vi.fn(),
  runBeforeSendMessageHooks: vi.fn(),
  runHook: vi.fn(),
  getExtensionHash: vi.fn(),
  updateCompactionState: vi.fn(),
  shouldTriggerCompaction: vi.fn(),
  markCompactionTriggered: vi.fn(),
  buildCompactionPrompt: vi.fn(),
  getCompactionStatus: vi.fn(),
  clearCompactionState: vi.fn(),
  clearHostSteps: vi.fn(),
  memoryManager: {
    enabled: true,
    warmQueryEmbedding: vi.fn(async () => {}),
    searchRelevant: vi.fn(() => []),
    getRecentFragments: vi.fn(() => [])
  }
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
  getConversation: mocks.getConversation,
  saveSessionId: mocks.saveSessionId,
  addMessage: mocks.addMessage,
  updateLastMessage: mocks.updateLastMessage
}))

vi.mock('../../../../src/main/services/ai-browser/tool-utils', () => ({
  isAIBrowserTool: vi.fn(() => false)
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
  getOrCreateV2Session: mocks.getOrCreateV2Session,
  closeV2Session: mocks.closeV2Session,
  createSessionState: mocks.createSessionState,
  registerActiveSession: mocks.registerActiveSession,
  unregisterActiveSession: mocks.unregisterActiveSession,
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

vi.mock('../../../../src/gateway/runtime/registration', () => ({
  resolveNativeRuntimeRegistrationState: () => ({
    enabled: false,
    status: { ready: false }
  }),
  syncNativeRuntimeRegistration: vi.fn()
}))

vi.mock('../../../../src/main/services/agent/message-utils', () => ({
  formatCanvasContext: vi.fn(() => ''),
  buildMessageContent: mocks.buildMessageContent,
  parseSDKMessage: mocks.parseSDKMessage,
  extractSingleUsage: vi.fn(() => null),
  extractResultUsage: vi.fn(() => null)
}))

vi.mock('../../../../src/main/services/agent/image-preprocess', () => ({
  preprocessImages: mocks.preprocessImages
}))

vi.mock('../../../../src/main/services/extension', () => ({
  getEnabledExtensions: mocks.getEnabledExtensions,
  runBeforeSendMessageHooks: mocks.runBeforeSendMessageHooks,
  runHook: mocks.runHook,
  getExtensionHash: mocks.getExtensionHash
}))

vi.mock('../../../../src/main/services/agent/compaction-monitor', () => ({
  updateCompactionState: mocks.updateCompactionState,
  shouldTriggerCompaction: mocks.shouldTriggerCompaction,
  markCompactionTriggered: mocks.markCompactionTriggered,
  buildCompactionPrompt: mocks.buildCompactionPrompt,
  getCompactionStatus: mocks.getCompactionStatus,
  clearCompactionState: mocks.clearCompactionState
}))

vi.mock('../../../../src/main/services/memory', () => ({
  getMemoryIndexManager: vi.fn(() => mocks.memoryManager)
}))

vi.mock('../../../../src/gateway/host-runtime', () => ({
  hostRuntime: {
    stepReporter: {
      clearTask: mocks.clearHostSteps
    }
  }
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
    mocks.memoryManager.enabled = true
    mocks.getStatus.mockReturnValue({ running: false, queued: 0 })
    mocks.enqueue.mockResolvedValue(undefined)
    mocks.buildMessageContent.mockReturnValue('hello')
    mocks.preprocessImages.mockResolvedValue({
      preprocessed: false,
      enhancedMessage: 'hello',
      filteredImages: undefined,
      filteredAttachments: undefined,
      error: undefined
    })
    mocks.getEnabledExtensions.mockReturnValue([])
    mocks.runBeforeSendMessageHooks.mockImplementation(async (message: string) => message)
    mocks.runHook.mockResolvedValue(undefined)
    mocks.getExtensionHash.mockReturnValue('test-extension-hash')
    mocks.shouldTriggerCompaction.mockReturnValue(false)
    mocks.buildCompactionPrompt.mockReturnValue('')
    mocks.getCompactionStatus.mockReturnValue(null)
    mocks.createSessionState.mockImplementation((spaceId: string, conversationId: string, abortController: AbortController) => ({
      spaceId,
      conversationId,
      abortController,
      currentStreamingContent: '',
      thoughts: [],
      pendingPermissionResolve: null,
      pendingPermissionToolCall: null,
      pendingUserQuestion: null
    }))
    mocks.updateLastMessage.mockReturnValue({ id: 'assistant-1' })
    mocks.parseSDKMessage.mockReturnValue(null)
  })

  function mockSuccessfulStream(): void {
    const toolThought = {
      id: 'tool-1',
      type: 'tool_use',
      content: '',
      timestamp: '2026-03-10T00:00:00.000Z',
      toolName: 'TeamCreate',
      toolInput: { name: 'research-team' }
    }

    mocks.enqueue.mockImplementationOnce(async (_conversationId: string, run: () => Promise<void>) => run())
    mocks.parseSDKMessage.mockImplementation((sdkMessage: { type: string }) => {
      if (sdkMessage.type === 'assistant') return toolThought
      return null
    })
    mocks.getOrCreateV2Session.mockResolvedValue({
      setPermissionMode: vi.fn(async () => {}),
      send: vi.fn(),
      stream: async function* () {
        yield { type: 'assistant', message: { content: [] } }
        yield { type: 'result' }
      }
    })
  }

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

  it('persists thought-only assistant activity without raising empty response errors', async () => {
    const toolThought = {
      id: 'tool-1',
      type: 'tool_use',
      content: '',
      timestamp: '2026-03-10T00:00:00.000Z',
      toolName: 'TeamCreate',
      toolInput: { name: 'research-team' }
    }

    mockSuccessfulStream()

    await expect(sendMessage(null, request)).resolves.toBeUndefined()

    expect(mocks.updateLastMessage).toHaveBeenCalledWith(
      'space-1',
      'conv-1',
      expect.objectContaining({
        content: '',
        thoughts: [toolThought]
      })
    )
    expect(mocks.sendToRenderer.mock.calls.some(([eventName]) => eventName === 'agent:complete')).toBe(true)
    expect(mocks.sendToRenderer.mock.calls.some(([eventName]) => eventName === 'agent:error')).toBe(false)
    expect(mocks.clearHostSteps).toHaveBeenCalledWith('conv-1')
  })

  it('does not fall back to recent conversations for low-signal prompts in a new conversation', async () => {
    mockSuccessfulStream()

    await expect(sendMessage(null, {
      ...request,
      message: '你'
    })).resolves.toBeUndefined()

    expect(mocks.memoryManager.warmQueryEmbedding).toHaveBeenCalledWith('你')
    expect(mocks.memoryManager.searchRelevant).toHaveBeenCalledWith('space-1', '你', 'conv-1', 5)
    expect(mocks.memoryManager.getRecentFragments).not.toHaveBeenCalled()
  })

  it('falls back to recent conversations when the user explicitly references prior context', async () => {
    mocks.memoryManager.searchRelevant.mockReturnValueOnce([])
    mocks.memoryManager.getRecentFragments.mockReturnValueOnce([
      {
        id: 99,
        conversation_id: 'conv-previous',
        space_id: 'space-1',
        role: 'user',
        content: '打开 finder，打开桌面',
        created_at: '2026-03-10T00:00:00.000Z',
        conversation_title: '打开 finder，打开桌面'
      }
    ])
    mockSuccessfulStream()

    await expect(sendMessage(null, {
      ...request,
      message: '继续上次那个任务'
    })).resolves.toBeUndefined()

    expect(mocks.memoryManager.getRecentFragments).toHaveBeenCalledWith('space-1', 'conv-1', 3)
  })
})
