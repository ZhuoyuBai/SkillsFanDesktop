import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeRuntimeUpstreamError } from '../../../../src/gateway/runtime/native/client'

const mocks = vi.hoisted(() => ({
  ensureInitialized: vi.fn(),
  resolveRuntimeEndpoint: vi.fn(),
  getConfig: vi.fn(),
  sendToRenderer: vi.fn(),
  addMessage: vi.fn(),
  updateLastMessage: vi.fn(),
  clearTask: vi.fn(),
  executeNativePreparedRequest: vi.fn(),
  getWorkingDir: vi.fn(),
  buildToolRegistry: vi.fn(),
  buildNativeFunctionToolDefinitions: vi.fn()
}))

vi.mock('../../../../src/main/services/ai-sources', () => ({
  getAISourceManager: () => ({
    ensureInitialized: mocks.ensureInitialized,
    resolveRuntimeEndpoint: mocks.resolveRuntimeEndpoint
  })
}))

vi.mock('../../../../src/main/services/config.service', () => ({
  getConfig: mocks.getConfig
}))

vi.mock('../../../../src/main/services/agent/helpers', () => ({
  sendToRenderer: mocks.sendToRenderer,
  getWorkingDir: mocks.getWorkingDir
}))

vi.mock('../../../../src/main/services/conversation.service', () => ({
  addMessage: mocks.addMessage,
  updateLastMessage: mocks.updateLastMessage
}))

vi.mock('../../../../src/gateway/host-runtime', () => ({
  hostRuntime: {
    stepReporter: {
      clearTask: mocks.clearTask
    }
  }
}))

vi.mock('../../../../src/gateway/runtime/native/client', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/gateway/runtime/native/client')>(
    '../../../../src/gateway/runtime/native/client'
  )

  return {
    ...actual,
    executeNativePreparedRequest: mocks.executeNativePreparedRequest
  }
})

vi.mock('../../../../src/gateway/tools', () => ({
  buildToolRegistry: mocks.buildToolRegistry,
  buildNativeFunctionToolDefinitions: mocks.buildNativeFunctionToolDefinitions
}))

import { nativeRuntime } from '../../../../src/gateway/runtime/native/runtime'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

describe('native runtime sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureInitialized.mockResolvedValue(undefined)
    mocks.getConfig.mockReturnValue({
      browserAutomation: { mode: 'ai-browser' }
    })
    mocks.getWorkingDir.mockReturnValue('/tmp/space-1')
    mocks.buildToolRegistry.mockResolvedValue({
      mcpServers: {
        'local-tools': { type: 'sdk', name: 'local-tools', instance: {} }
      },
      providers: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        }
      ],
      addedMcpServers: ['local-tools'],
      browserAutomationMode: 'ai-browser',
      effectiveAiBrowserEnabled: false
    })
    mocks.buildNativeFunctionToolDefinitions.mockReturnValue([
      {
        name: 'mcp__local-tools__terminal_read_output',
        providerId: 'local-tools',
        sourceToolName: 'terminal_read_output',
        description: 'Read output from terminal.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        strict: false
      }
    ])
    mocks.resolveRuntimeEndpoint.mockReturnValue({
      requestedSource: 'custom',
      source: 'custom',
      authMode: 'api-key',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1/responses',
      apiKey: 'sk-test',
      model: 'gpt-5.4',
      apiType: 'responses'
    })
  })

  it('executes a native request, streams text to renderer, and persists the assistant response', async () => {
    mocks.executeNativePreparedRequest.mockImplementation(async ({ options }) => {
      await options?.onStreamEvent?.({
        kind: 'text-delta',
        delta: 'Hel'
      })
      await options?.onStreamEvent?.({
        kind: 'text-done',
        text: 'Hello from native'
      })

      return {
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        response: {
          responseId: 'resp_1',
          model: 'gpt-5.4',
          status: 'completed',
          outputText: 'Hello from native',
          refusalText: null,
          toolCalls: [],
          usage: {
            inputTokens: 10,
            cachedInputTokens: 1,
            outputTokens: 4,
            reasoningTokens: 0,
            totalTokens: 14
          },
          incompleteReason: null,
          error: null
        },
        streamEvents: []
      }
    })

    await nativeRuntime.sendMessage({
      mainWindow: null,
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Hello native',
        aiBrowserEnabled: true
      } as any
    })

    expect(mocks.clearTask).toHaveBeenCalledWith('conv-1')
    expect(mocks.addMessage).toHaveBeenNthCalledWith(1, 'space-1', 'conv-1', {
      role: 'user',
      content: 'Hello native',
      images: undefined,
      attachments: undefined
    })
    expect(mocks.addMessage).toHaveBeenNthCalledWith(2, 'space-1', 'conv-1', {
      role: 'assistant',
      content: '',
      toolCalls: []
    })
    expect(mocks.executeNativePreparedRequest.mock.calls[0][0].preparedRequest.body.tools).toEqual([
      {
        type: 'function',
        name: 'mcp__local-tools__terminal_read_output',
        description: 'Read output from terminal.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        strict: false
      }
    ])
    expect(mocks.updateLastMessage).toHaveBeenCalledWith('space-1', 'conv-1', {
      content: 'Hello from native',
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 1,
        cacheCreationTokens: 0,
        totalCostUsd: 0,
        contextWindow: 0
      }
    })
    expect(mocks.sendToRenderer.mock.calls).toEqual([
      ['agent:start', 'space-1', 'conv-1', {}],
      ['agent:message', 'space-1', 'conv-1', {
        type: 'message',
        content: 'Hel',
        isComplete: false,
        isStreaming: true
      }],
      ['agent:message', 'space-1', 'conv-1', {
        type: 'message',
        content: 'Hello from native',
        isComplete: false,
        isStreaming: false
      }],
      ['agent:message', 'space-1', 'conv-1', {
        type: 'message',
        content: 'Hello from native',
        isComplete: true,
        isStreaming: false
      }],
      ['agent:complete', 'space-1', 'conv-1', {
        type: 'complete',
        duration: 0,
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 4,
          cacheReadTokens: 1,
          cacheCreationTokens: 0,
          totalCostUsd: 0,
          contextWindow: 0
        }
      }]
    ])
  })

  it('executes native tool calls, sends tool events, and continues with a follow-up request', async () => {
    mocks.executeNativePreparedRequest
      .mockResolvedValueOnce({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        response: {
          responseId: 'resp_tool_1',
          model: 'gpt-5.4',
          status: 'completed',
          outputText: '',
          refusalText: null,
          toolCalls: [
            {
              id: 'call_1',
              name: 'mcp__local-tools__terminal_read_output',
              argumentsText: '{"windowIndex":1}',
              status: 'completed'
            }
          ],
          usage: {
            inputTokens: 5,
            cachedInputTokens: 0,
            outputTokens: 2,
            reasoningTokens: 0,
            totalTokens: 7
          },
          incompleteReason: null,
          error: null
        },
        streamEvents: []
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        response: {
          responseId: 'resp_tool_2',
          model: 'gpt-5.4',
          status: 'completed',
          outputText: 'Terminal says hello',
          refusalText: null,
          toolCalls: [],
          usage: {
            inputTokens: 7,
            cachedInputTokens: 1,
            outputTokens: 4,
            reasoningTokens: 0,
            totalTokens: 11
          },
          incompleteReason: null,
          error: null
        },
        streamEvents: []
      })

    await nativeRuntime.sendMessage({
      mainWindow: null,
      request: {
        spaceId: 'space-3',
        conversationId: 'conv-3',
        message: 'Read the terminal.'
      } as any
    })

    expect(mocks.executeNativePreparedRequest).toHaveBeenCalledTimes(2)
    expect(mocks.executeNativePreparedRequest.mock.calls[1][0].preparedRequest.body.previous_response_id).toBe('resp_tool_1')
    expect(mocks.executeNativePreparedRequest.mock.calls[1][0].preparedRequest.body.input).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: getNativeUserFacingMessage('toolUnavailable')
      }
    ])

    expect(mocks.sendToRenderer.mock.calls).toEqual([
      ['agent:start', 'space-3', 'conv-3', {}],
      ['agent:thought', 'space-3', 'conv-3', {
        thought: {
          id: 'call_1',
          type: 'tool_use',
          content: 'Tool call: terminal_read_output',
          timestamp: expect.any(String),
          toolName: 'terminal_read_output',
          toolInput: {
            windowIndex: 1
          }
        }
      }],
      ['agent:tool-call', 'space-3', 'conv-3', {
        id: 'call_1',
        name: 'terminal_read_output',
        status: 'running',
        input: {
          windowIndex: 1
        }
      }],
      ['agent:thought', 'space-3', 'conv-3', {
        thought: {
          id: 'call_1',
          type: 'tool_result',
          content: 'Tool result: terminal_read_output',
          timestamp: expect.any(String),
          toolName: 'terminal_read_output',
          toolOutput: getNativeUserFacingMessage('toolUnavailable'),
          isError: true
        }
      }],
      ['agent:tool-result', 'space-3', 'conv-3', {
        type: 'tool_result',
        toolId: 'call_1',
        result: getNativeUserFacingMessage('toolUnavailable'),
        isError: true
      }],
      ['agent:message', 'space-3', 'conv-3', {
        type: 'message',
        content: 'Terminal says hello',
        isComplete: true,
        isStreaming: false
      }],
      ['agent:complete', 'space-3', 'conv-3', {
        type: 'complete',
        duration: 0,
        tokenUsage: {
          inputTokens: 12,
          outputTokens: 6,
          cacheReadTokens: 1,
          cacheCreationTokens: 0,
          totalCostUsd: 0,
          contextWindow: 0
        }
      }],
    ])

    expect(mocks.updateLastMessage).toHaveBeenCalledWith('space-3', 'conv-3', {
      content: 'Terminal says hello',
      thoughts: [
        {
          id: 'call_1',
          type: 'tool_use',
          content: 'Tool call: terminal_read_output',
          timestamp: expect.any(String),
          toolName: 'terminal_read_output',
          toolInput: {
            windowIndex: 1
          }
        },
        {
          id: 'call_1',
          type: 'tool_result',
          content: 'Tool result: terminal_read_output',
          timestamp: expect.any(String),
          toolName: 'terminal_read_output',
          toolOutput: getNativeUserFacingMessage('toolUnavailable'),
          isError: true
        }
      ],
      toolCalls: [
        {
          id: 'call_1',
          name: 'terminal_read_output',
          status: 'error',
          input: {
            windowIndex: 1
          },
          output: undefined,
          error: getNativeUserFacingMessage('toolUnavailable')
        }
      ],
      tokenUsage: {
        inputTokens: 12,
        outputTokens: 6,
        cacheReadTokens: 1,
        cacheCreationTokens: 0,
        totalCostUsd: 0,
        contextWindow: 0
      }
    })
  })

  it('emits agent:error when upstream execution fails', async () => {
    mocks.executeNativePreparedRequest.mockRejectedValue(new NativeRuntimeUpstreamError({
      code: 'rate_limit_exceeded',
      message: 'Too many requests',
      statusCode: 429,
      statusText: 'Too Many Requests',
      responseText: '{"error":{"code":"rate_limit_exceeded","message":"Too many requests"}}'
    }))

    await expect(nativeRuntime.sendMessage({
      mainWindow: null,
      request: {
        spaceId: 'space-2',
        conversationId: 'conv-2',
        message: 'Hello native'
      } as any
    })).rejects.toThrow(getNativeUserFacingMessage('upstreamRateLimit'))

    expect(mocks.sendToRenderer).toHaveBeenCalledWith('agent:error', 'space-2', 'conv-2', {
      type: 'error',
      error: getNativeUserFacingMessage('upstreamRateLimit'),
      errorCode: 429
    })
  })
})
