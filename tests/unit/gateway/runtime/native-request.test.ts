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
    expect(prepared.body).toEqual(expect.objectContaining({
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
    expect(prepared.body.input).toEqual([
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
    expect(prepared.body).toEqual(expect.objectContaining({
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
      toolOutputs: [
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool ok'
        }
      ]
    })

    expect(followup.body.previous_response_id).toBe('resp_123')
    expect(followup.body.input).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'tool ok'
      }
    ])
    expect(followup.body.model).toBe('gpt-5.4')
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

    expect(prepared.body.tools).toEqual([
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
    expect(prepared.body.input[0]).toEqual({
      role: 'developer',
      content: 'If one important detail is still unclear, call app__ask_user_question before guessing. Ask only one short, simple question at a time, avoid technical wording, and give up to three clear choices whenever possible.'
    })
  })
})
