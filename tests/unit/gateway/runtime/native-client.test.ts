import { describe, expect, it, vi } from 'vitest'
import { executeNativePreparedRequest, NativeRuntimeUpstreamError } from '../../../../src/gateway/runtime/native/client'
import { getNativeRuntimeAdapter } from '../../../../src/gateway/runtime/native/adapters'
import { getNativeUserFacingMessage } from '../../../../src/gateway/runtime/native/user-facing'

function createResponseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    }
  })
}

describe('native runtime upstream client', () => {
  it('executes a non-streaming prepared request and normalizes the final response', async () => {
    const adapter = getNativeRuntimeAdapter('openai-responses')
    expect(adapter).not.toBeNull()

    const preparedRequest = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'custom',
        source: 'custom',
        authMode: 'api-key',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1/responses',
        apiKey: 'sk-test',
        model: 'gpt-5.4',
        apiType: 'responses',
        forceStream: false
      },
      sharedToolProviders: [],
      request: {
        spaceId: 'space-1',
        conversationId: 'conv-1',
        message: 'Hello'
      } as any
    })

    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      id: 'resp_1',
      object: 'response',
      created_at: 1,
      model: 'gpt-5.4',
      status: 'completed',
      output: [
        {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: 'Hi from native'
            }
          ]
        }
      ],
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 1 },
        output_tokens: 4,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 14
      },
      error: null
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_1'
      }
    }))

    const result = await executeNativePreparedRequest({
      preparedRequest,
      adapter: adapter!,
      options: { fetchImpl }
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      statusCode: 200,
      statusText: '',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_1'
      },
      response: {
        responseId: 'resp_1',
        model: 'gpt-5.4',
        status: 'completed',
        outputText: 'Hi from native',
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
    })
  })

  it('executes a streaming prepared request and emits normalized stream events', async () => {
    const adapter = getNativeRuntimeAdapter('openai-codex-responses')
    expect(adapter).not.toBeNull()

    const preparedRequest = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'openai-codex',
        source: 'openai-codex',
        authMode: 'oauth',
        provider: 'oauth',
        baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
        apiKey: 'token',
        model: 'gpt-5.4',
        apiType: 'responses'
      },
      sharedToolProviders: [],
      request: {
        spaceId: 'space-2',
        conversationId: 'conv-2',
        message: 'Say hi'
      } as any
    })

    const emitted: Array<{ kind: string; text?: string; delta?: string }> = []
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(createResponseStream([
      'data: {"type":"response.created","response":{"id":"resp_2","object":"response","created_at":1,"model":"gpt-5.4","status":"in_progress","output":[],"usage":{"input_tokens":5,"input_tokens_details":{"cached_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":5},"error":null}}\n',
      'data: {"type":"response.output_text.delta","delta":"Hel","item_id":"msg_1","content_index":0,"output_index":0}\n',
      'data: {"type":"response.output_text.done","text":"Hello","item_id":"msg_1","content_index":0}\n',
      'data: {"type":"response.completed","response":{"id":"resp_2","object":"response","created_at":1,"model":"gpt-5.4","status":"completed","output":[{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Hello"}]}],"usage":{"input_tokens":5,"input_tokens_details":{"cached_tokens":0},"output_tokens":3,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":8},"error":null}}\n',
      'data: [DONE]\n'
    ]), {
      status: 200,
      headers: {
        'content-type': 'text/event-stream'
      }
    }))

    const result = await executeNativePreparedRequest({
      preparedRequest,
      adapter: adapter!,
      options: {
        fetchImpl,
        onStreamEvent(event) {
          emitted.push({
            kind: event.kind,
            text: event.text,
            delta: event.delta
          })
        }
      }
    })

    expect(result.statusCode).toBe(200)
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      'response-created',
      'text-delta',
      'text-done',
      'response-completed'
    ])
    expect(emitted).toEqual([
      { kind: 'response-created', text: undefined, delta: undefined },
      { kind: 'text-delta', text: undefined, delta: 'Hel' },
      { kind: 'text-done', text: 'Hello', delta: undefined },
      { kind: 'response-completed', text: undefined, delta: undefined }
    ])
    expect(result.response).toEqual(expect.objectContaining({
      responseId: 'resp_2',
      outputText: 'Hello',
      status: 'completed'
    }))
  })

  it('parses structured upstream errors into a native runtime transport error', async () => {
    const adapter = getNativeRuntimeAdapter('openai-responses')
    expect(adapter).not.toBeNull()

    const preparedRequest = adapter!.prepareRequest({
      mainWindow: null,
      endpoint: {
        requestedSource: 'custom',
        source: 'custom',
        authMode: 'api-key',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1/responses',
        apiKey: 'sk-test',
        model: 'gpt-5.4',
        apiType: 'responses',
        forceStream: false
      },
      sharedToolProviders: [],
      request: {
        spaceId: 'space-3',
        conversationId: 'conv-3',
        message: 'Hello'
      } as any
    })

    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error: {
        code: 'rate_limit_exceeded',
        message: 'Too many requests'
      }
    }), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        'content-type': 'application/json'
      }
    }))

    await expect(executeNativePreparedRequest({
      preparedRequest,
      adapter: adapter!,
      options: { fetchImpl }
    })).rejects.toEqual(expect.objectContaining<Partial<NativeRuntimeUpstreamError>>({
      name: 'NativeRuntimeUpstreamError',
      code: 'rate_limit_exceeded',
      statusCode: 429,
      statusText: 'Too Many Requests',
      message: getNativeUserFacingMessage('upstreamRateLimit')
    }))
  })
})
