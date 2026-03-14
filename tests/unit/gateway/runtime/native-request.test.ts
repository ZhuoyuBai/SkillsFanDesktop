import { describe, expect, it } from 'vitest'
import { getNativeRuntimeAdapter } from '../../../../src/gateway/runtime/native/adapters'
import { buildNativeRuntimeFollowupPreparedRequest } from '../../../../src/gateway/runtime/native/request'
import { NATIVE_BUILTIN_PROVIDER_ID } from '../../../../src/gateway/tools/types'

describe('native runtime request builder', () => {
  it('builds an OpenAI Responses request with metadata, reasoning, and image input parts', () => {
    const adapter = getNativeRuntimeAdapter('openai-responses')
    expect(adapter).not.toBeNull()

    const prepared = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'custom',
        source: 'custom',
        authMode: 'api-key',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1/responses',
        apiKey: 'sk-test',
        model: 'gpt-5.4',
        headers: {
          'X-Test-Header': 'value'
        },
        apiType: 'responses'
      },
      sharedToolProviders: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        },
        {
          id: 'skill',
          kind: 'mcp',
          source: 'app',
          description: 'skill tools',
          runtimeKinds: ['claude-sdk']
        }
      ],
      nativeFunctionTools: [
        {
          name: 'mcp__local-tools__open_url',
          providerId: 'local-tools',
          sourceToolName: 'open_url',
          description: 'Open a URL in the default browser.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string' }
            },
            required: ['url'],
            additionalProperties: false
          },
          strict: false
        }
      ],
      request: {
        spaceId: 'space-a',
        conversationId: 'conversation-a',
        message: 'Summarize this screenshot.',
        messagePrefix: 'Use concise output.',
        thinkingEffort: 'high',
        images: [
          {
            id: 'img-1',
            type: 'image',
            mediaType: 'image/png',
            data: 'Zm9v'
          }
        ]
      } as any
    })

    expect(prepared).toEqual(expect.objectContaining({
      adapterId: 'openai-responses',
      method: 'POST',
      url: 'https://api.openai.com/v1/responses',
      stream: true,
      toolProviderIds: ['local-tools'],
      unsupportedInputKinds: []
    }))
    expect(prepared.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
      'X-Test-Header': 'value'
    }))
    const openAIBody = prepared.body as any
    expect(openAIBody).toEqual(expect.objectContaining({
      model: 'gpt-5.4',
      stream: true,
      stream_options: { include_usage: true },
      store: true,
      tools: [
        {
          type: 'function',
          name: 'mcp__local-tools__open_url',
          description: 'Open a URL in the default browser.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string' }
            },
            required: ['url'],
            additionalProperties: false
          },
          strict: false
        }
      ],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      reasoning: {
        effort: 'high',
        summary: 'none'
      },
      user: 'space-a:conversation-a',
      metadata: expect.objectContaining({
        skillsfan_space_id: 'space-a',
        skillsfan_conversation_id: 'conversation-a',
        skillsfan_runtime_kind: 'native',
        skillsfan_native_adapter: 'openai-responses',
        skillsfan_tool_provider_ids: 'local-tools'
      })
    }))
    expect(openAIBody.input).toEqual([
      {
        role: 'developer',
        content: expect.stringContaining('Use concise output.')
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Summarize this screenshot.'
          },
          {
            type: 'input_image',
            image_url: 'data:image/png;base64,Zm9v',
            detail: 'auto'
          }
        ]
      }
    ])
  })

  it('builds a Codex Responses request with store disabled and unsupported attachment hints', () => {
    const adapter = getNativeRuntimeAdapter('openai-codex-responses')
    expect(adapter).not.toBeNull()

    const prepared = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'openai-codex',
        source: 'openai-codex',
        authMode: 'oauth',
        provider: 'oauth',
        baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
        apiKey: 'token',
        model: 'gpt-5.4',
        headers: {
          'ChatGPT-Account-ID': 'acct_123'
        },
        apiType: 'responses'
      },
      sharedToolProviders: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        }
      ],
      nativeFunctionTools: [
        {
          name: 'mcp__local-tools__terminal_read_output',
          providerId: 'local-tools',
          sourceToolName: 'terminal_read_output',
          description: 'Read terminal output.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          },
          strict: false
        }
      ],
      request: {
        spaceId: 'space-b',
        conversationId: 'conversation-b',
        message: 'Analyze the attached documents.',
        attachments: [
          {
            id: 'pdf-1',
            type: 'pdf',
            mediaType: 'application/pdf',
            data: 'Zm9v',
            name: 'spec.pdf',
            size: 3
          },
          {
            id: 'txt-1',
            type: 'text',
            mediaType: 'text/plain',
            content: 'notes',
            name: 'notes.txt',
            size: 5
          }
        ]
      } as any
    })

    expect(prepared.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer token',
      'ChatGPT-Account-ID': 'acct_123'
    }))
    expect(prepared.toolProviderIds).toEqual(['local-tools'])
    expect(prepared.nativeTools).toEqual([
      {
        name: 'mcp__local-tools__terminal_read_output',
        providerId: 'local-tools',
        sourceToolName: 'terminal_read_output',
        description: 'Read terminal output.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        strict: false
      }
    ])
    expect(prepared.unsupportedInputKinds).toEqual(['pdf-attachment', 'text-attachment'])
    const codexBody = prepared.body as any
    expect(codexBody).toEqual(expect.objectContaining({
      store: false,
      model: 'gpt-5.4',
      tools: [
        {
          type: 'function',
          name: 'mcp__local-tools__terminal_read_output',
          description: 'Read terminal output.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false
          },
          strict: false
        }
      ],
      tool_choice: 'auto',
      metadata: expect.objectContaining({
        skillsfan_native_adapter: 'openai-codex-responses',
        skillsfan_unsupported_inputs: 'pdf-attachment,text-attachment'
      })
    }))
  })

  it('builds a follow-up Responses request with previous_response_id and function_call_output items', () => {
    const adapter = getNativeRuntimeAdapter('openai-responses')
    expect(adapter).not.toBeNull()

    const initial = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'custom',
        source: 'custom',
        authMode: 'api-key',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1/responses',
        apiKey: 'sk-test',
        model: 'gpt-5.4',
        apiType: 'responses'
      },
      sharedToolProviders: [],
      nativeFunctionTools: [],
      request: {
        spaceId: 'space-c',
        conversationId: 'conversation-c',
        message: 'Use tools if needed.'
      } as any
    })

    const followup = buildNativeRuntimeFollowupPreparedRequest({
      preparedRequest: initial,
      previousResponseId: 'resp_123',
      assistantResponseText: '',
      toolOutputs: [
        {
          toolCall: {
            id: 'call_1',
            name: 'chrome_list_tabs',
            argumentsText: '{"windowIndex":0}',
            status: 'completed'
          },
          outputText: 'tool ok',
          isError: false
        }
      ]
    })

    const followupResponsesBody = followup.body as any
    expect(followupResponsesBody.previous_response_id).toBe('resp_123')
    expect(followupResponsesBody.input).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'tool ok'
      }
    ])
    expect(followupResponsesBody.model).toBe('gpt-5.4')
    expect(followup.nativeTools).toEqual(initial.nativeTools)
  })

  it('keeps the built-in ask-user-question tool available even though it is not tied to an MCP provider', () => {
    const adapter = getNativeRuntimeAdapter('openai-responses')
    expect(adapter).not.toBeNull()

    const prepared = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'custom',
        source: 'custom',
        authMode: 'api-key',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1/responses',
        apiKey: 'sk-test',
        model: 'gpt-5.4',
        apiType: 'responses'
      },
      sharedToolProviders: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        }
      ],
      nativeFunctionTools: [
        {
          name: 'app__ask_user_question',
          providerId: NATIVE_BUILTIN_PROVIDER_ID,
          sourceToolName: 'AskUserQuestion',
          description: 'Ask the user one short follow-up question.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string' }
            },
            required: ['question'],
            additionalProperties: false
          },
          strict: false
        }
      ],
      request: {
        spaceId: 'space-built-in',
        conversationId: 'conversation-built-in',
        message: 'Need one clarification.'
      } as any
    })

    const askUserBody = prepared.body as any
    expect(askUserBody.tools).toEqual([
      {
        type: 'function',
        name: 'app__ask_user_question',
        description: 'Ask the user one short follow-up question.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string' }
          },
          required: ['question'],
          additionalProperties: false
        },
        strict: false
      }
    ])
    expect(askUserBody.input[0]).toEqual({
      role: 'developer',
      content: 'If one important detail is still unclear, call app__ask_user_question before guessing. Ask only one short, simple question at a time, avoid technical wording, and give up to three clear choices whenever possible.'
    })
  })

  it('builds an anthropic-compatible request and follow-up for configured custom sources like zhipu/minimax', () => {
    const adapter = getNativeRuntimeAdapter('anthropic-messages')
    expect(adapter).not.toBeNull()

    const prepared = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'zhipu',
        source: 'zhipu',
        authMode: 'api-key',
        provider: 'anthropic',
        baseUrl: 'https://open.bigmodel.cn/api/anthropic',
        apiKey: 'glm-key',
        model: 'GLM-5',
        apiType: undefined
      },
      sharedToolProviders: [
        {
          id: 'local-tools',
          kind: 'mcp',
          source: 'app',
          description: 'local tools',
          runtimeKinds: ['claude-sdk', 'native']
        }
      ],
      nativeFunctionTools: [
        {
          name: 'mcp__local-tools__terminal_run_command',
          providerId: 'local-tools',
          sourceToolName: 'terminal_run_command',
          description: 'Run a terminal command.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string' }
            },
            required: ['command'],
            additionalProperties: false
          },
          strict: false
        }
      ],
      request: {
        spaceId: 'space-zhipu',
        conversationId: 'conversation-zhipu',
        message: 'Open iTerm and run pwd.',
        messagePrefix: 'Keep the reply short.',
        thinkingEffort: 'high'
      } as any
    })

    expect(prepared).toEqual(expect.objectContaining({
      adapterId: 'anthropic-messages',
      method: 'POST',
      url: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
      requestTimeoutMs: 300000,
      stream: false,
      toolProviderIds: ['local-tools'],
      unsupportedInputKinds: []
    }))
    expect(prepared.headers).toEqual(expect.objectContaining({
      'x-api-key': 'glm-key',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    }))
    const anthropicBody = prepared.body as any
    expect(anthropicBody).toEqual(expect.objectContaining({
      model: 'GLM-5',
      max_tokens: 8192,
      tool_choice: { type: 'auto' },
      metadata: expect.objectContaining({
        skillsfan_native_adapter: 'anthropic-messages',
        skillsfan_tool_provider_ids: 'local-tools'
      })
    }))
    expect(anthropicBody.messages).toEqual([
      {
        role: 'user',
        content: 'Open iTerm and run pwd.'
      }
    ])

    const followup = buildNativeRuntimeFollowupPreparedRequest({
      preparedRequest: prepared,
      previousResponseId: 'msg_123',
      assistantResponseText: 'I need to run a tool first.',
      toolOutputs: [
        {
          toolCall: {
            id: 'toolu_1',
            name: 'mcp__local-tools__terminal_run_command',
            argumentsText: '{"command":"pwd"}',
            status: 'completed'
          },
          outputText: '/Users/zhuoyu',
          isError: false
        }
      ]
    })

    const anthropicFollowupBody = followup.body as any
    expect(anthropicFollowupBody.messages).toEqual([
      {
        role: 'user',
        content: 'Open iTerm and run pwd.'
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I need to run a tool first.'
          },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'mcp__local-tools__terminal_run_command',
            input: {
              command: 'pwd'
            }
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '/Users/zhuoyu',
            is_error: false
          }
        ]
      }
    ])
  })

  it('blocks deepseek anthropic-compatible image inputs before sending upstream', () => {
    const adapter = getNativeRuntimeAdapter('anthropic-messages')
    expect(adapter).not.toBeNull()

    const prepared = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'deepseek',
        source: 'deepseek',
        authMode: 'api-key',
        provider: 'anthropic',
        baseUrl: 'https://api.deepseek.com/anthropic',
        apiKey: 'deepseek-key',
        model: 'DeepSeek-V3.2',
        apiType: undefined
      },
      sharedToolProviders: [],
      nativeFunctionTools: [],
      request: {
        spaceId: 'space-deepseek',
        conversationId: 'conversation-deepseek',
        message: 'Describe this screenshot.',
        images: [
          {
            id: 'img-1',
            type: 'image',
            mediaType: 'image/png',
            data: 'Zm9v'
          }
        ]
      } as any
    })

    expect(prepared).toEqual(expect.objectContaining({
      adapterId: 'anthropic-messages',
      requestTimeoutMs: 600000,
      unsupportedInputKinds: ['image-input']
    }))
    expect((prepared.body as any).messages).toEqual([
      {
        role: 'user',
        content: 'Describe this screenshot.'
      }
    ])
    expect((prepared.body as any).metadata).toEqual(expect.objectContaining({
      skillsfan_unsupported_inputs: 'image-input'
    }))
  })
})
