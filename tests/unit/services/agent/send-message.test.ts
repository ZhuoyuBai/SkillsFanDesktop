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
  parseSDKMessageThoughts: vi.fn(),
  buildMessageContent: vi.fn(),
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
  getSkill: vi.fn()
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

vi.mock('../../../../src/main/services/skill', () => ({
  ensureSkillsInitialized: vi.fn(async () => {}),
  getSkillsSignature: vi.fn(() => ''),
  getSkill: mocks.getSkill
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

vi.mock('../../../../src/main/services/agent/message-utils', () => ({
  formatCanvasContext: vi.fn(() => ''),
  buildMessageContent: mocks.buildMessageContent,
  parseSDKMessage: mocks.parseSDKMessage,
  parseSDKMessageThoughts: mocks.parseSDKMessageThoughts,
  normalizeToolThoughtInput: vi.fn((toolName: string | undefined, input: unknown) => input),
  normalizeToolThoughtName: vi.fn((name: string | undefined) => name),
  serializeToolResultContent: vi.fn((content: unknown) => typeof content === 'string' ? content : JSON.stringify(content)),
  extractSingleUsage: vi.fn(() => null),
  extractResultUsage: vi.fn(() => null)
}))

vi.mock('../../../../src/shared/utils/vision-models', () => ({
  isNoVisionModel: vi.fn(() => false)
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
    mocks.buildMessageContent.mockReturnValue('hello')
    mocks.getEnabledExtensions.mockReturnValue([])
    mocks.runBeforeSendMessageHooks.mockImplementation(async (message: string) => message)
    mocks.runHook.mockResolvedValue(undefined)
    mocks.getExtensionHash.mockReturnValue('test-extension-hash')
    mocks.shouldTriggerCompaction.mockReturnValue(false)
    mocks.buildCompactionPrompt.mockReturnValue('')
    mocks.getCompactionStatus.mockReturnValue(null)
    mocks.getSkill.mockReturnValue(undefined)
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
    mocks.parseSDKMessageThoughts.mockReturnValue([])
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

  it('persists thought-only assistant activity without raising empty response errors', async () => {
    const toolThought = {
      id: 'tool-1',
      type: 'tool_use',
      content: '',
      timestamp: '2026-03-10T00:00:00.000Z',
      toolName: 'TeamCreate',
      toolInput: { name: 'research-team' }
    }

    mocks.enqueue.mockImplementationOnce(async (_conversationId: string, run: () => Promise<void>) => run())
    mocks.parseSDKMessageThoughts.mockImplementation((sdkMessage: { type: string }) => {
      if (sdkMessage.type === 'assistant') return [toolThought]
      return []
    })
    mocks.getOrCreateV2Session.mockResolvedValue({
      setPermissionMode: vi.fn(async () => {}),
      send: vi.fn(),
      stream: async function* () {
        yield { type: 'assistant', message: { content: [] } }
        yield { type: 'result' }
      }
    })

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
  })

  it('rejects images sent to non-vision model with friendly error', async () => {
    const { isNoVisionModel } = await import('../../../../src/shared/utils/vision-models')
    vi.mocked(isNoVisionModel).mockReturnValueOnce(true)

    const mockSend = vi.fn()
    mocks.getOrCreateV2Session.mockResolvedValue({
      setPermissionMode: vi.fn(async () => {}),
      send: mockSend,
      stream: async function* () {
        yield { type: 'result' }
      }
    })

    const imageRequest = {
      ...request,
      images: [{
        id: 'img-1',
        type: 'image' as const,
        mediaType: 'image/png' as const,
        data: 'abc123',
        name: 'screenshot.png',
        size: 123
      }]
    }

    mocks.enqueue.mockImplementationOnce(async (_conversationId: string, run: () => Promise<void>) => run())

    await expect(sendMessage(null, imageRequest)).resolves.toBeUndefined()

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:error',
      'space-1',
      'conv-1',
      expect.objectContaining({
        type: 'error',
        error: expect.stringContaining('does not support image understanding'),
        errorCode: 400
      })
    )
    // Should NOT send the message to the session
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('normalizes repairable SendMessage tool errors before sending them to the renderer', async () => {
    const sendMessageToolUse = {
      id: 'tool-send-message',
      type: 'tool_use',
      content: 'Tool call: SendMessage',
      timestamp: '2026-03-26T07:00:00.000Z',
      toolName: 'SendMessage',
      toolInput: {
        recipient: 'web-access',
        summary: 'search xiaohongshu'
      },
      parentToolId: 'tool-skill'
    }
    const sendMessageToolResult = {
      id: 'tool-send-message',
      type: 'tool_result',
      content: 'Tool execution failed',
      timestamp: '2026-03-26T07:00:01.000Z',
      toolOutput: 'SendMessage routing hint: SendMessage is only for messaging an existing agent team member and it requires a non-empty "content" field. "web-access" is a skill, not a team member. Use the Skill tool to load that skill. For one-off delegated work, use mcp__local-tools__subagent_spawn instead.',
      isError: true,
      parentToolId: 'tool-skill'
    }

    mocks.getSkill.mockReturnValue({ name: 'web-access' })
    mocks.enqueue.mockImplementationOnce(async (_conversationId: string, run: () => Promise<void>) => run())
    mocks.parseSDKMessageThoughts
      .mockReturnValueOnce([sendMessageToolUse])
      .mockReturnValueOnce([sendMessageToolResult])
      .mockReturnValue([])

    mocks.getOrCreateV2Session.mockResolvedValue({
      setPermissionMode: vi.fn(async () => {}),
      send: vi.fn(),
      stream: async function* () {
        yield { type: 'assistant', message: { content: [] } }
        yield { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-send-message', is_error: true, content: sendMessageToolResult.toolOutput }] } }
        yield { type: 'result' }
      }
    })

    await expect(sendMessage(null, request)).resolves.toBeUndefined()

    const thoughtEvent = mocks.sendToRenderer.mock.calls.find(([eventName, , , payload]) =>
      eventName === 'agent:thought'
      && payload?.thought?.id === 'tool-send-message'
      && payload?.thought?.type === 'tool_result'
    )

    expect(thoughtEvent?.[3]).toEqual({
      thought: expect.objectContaining({
        id: 'tool-send-message',
        type: 'tool_result',
        isError: false,
        content: 'Tool routing corrected',
        toolOutput: expect.stringContaining('System auto-corrected the tool choice')
      })
    })
  })

  it('emits tool activity from stream events before final assistant text arrives', async () => {
    mocks.enqueue.mockImplementationOnce(async (_conversationId: string, run: () => Promise<void>) => run())

    mocks.getOrCreateV2Session.mockResolvedValue({
      setPermissionMode: vi.fn(async () => {}),
      send: vi.fn(),
      stream: async function* () {
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool-search-1',
              name: 'mcp__web-tools__WebSearch',
              input: {}
            }
          }
        }
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '{"query":"minimax 2.7 news"}'
            }
          }
        }
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_stop',
            index: 0
          }
        }
        yield { type: 'result' }
      }
    })

    await expect(sendMessage(null, request)).resolves.toBeUndefined()

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:thought',
      'space-1',
      'conv-1',
      expect.objectContaining({
        thought: expect.objectContaining({
          id: 'tool-search-1',
          type: 'tool_use',
          toolName: 'mcp__web-tools__WebSearch'
        })
      })
    )

    expect(mocks.sendToRenderer).toHaveBeenCalledWith(
      'agent:tool-call',
      'space-1',
      'conv-1',
      expect.objectContaining({
        id: 'tool-search-1',
        name: 'mcp__web-tools__WebSearch',
        status: 'running'
      })
    )
  })
})
