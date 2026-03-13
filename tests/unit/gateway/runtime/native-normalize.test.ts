import { describe, expect, it } from 'vitest'
import {
  normalizeNativeRuntimeResponse,
  normalizeNativeRuntimeStreamEvent
} from '../../../../src/gateway/runtime/native/normalize'

describe('native runtime response normalization', () => {
  it('normalizes completed Responses output into text, tool calls, and usage', () => {
    const normalized = normalizeNativeRuntimeResponse({
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
              text: 'Hello'
            },
            {
              type: 'refusal',
              refusal: 'Cannot help with that part.'
            }
          ]
        },
        {
          id: 'call_1',
          type: 'function_call',
          status: 'completed',
          name: 'chrome_list_tabs',
          call_id: 'call_1',
          arguments: '{"windowIndex":0}'
        }
      ],
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 25 },
        output_tokens: 55,
        output_tokens_details: { reasoning_tokens: 12 },
        total_tokens: 155
      },
      incomplete_details: null,
      error: null
    })

    expect(normalized).toEqual({
      responseId: 'resp_1',
      model: 'gpt-5.4',
      status: 'completed',
      outputText: 'Hello',
      refusalText: 'Cannot help with that part.',
      toolCalls: [
        {
          id: 'call_1',
          name: 'chrome_list_tabs',
          argumentsText: '{"windowIndex":0}',
          status: 'completed'
        }
      ],
      usage: {
        inputTokens: 100,
        cachedInputTokens: 25,
        outputTokens: 55,
        reasoningTokens: 12,
        totalTokens: 155
      },
      incompleteReason: null,
      error: null
    })
  })

  it('normalizes representative native stream events', () => {
    expect(normalizeNativeRuntimeStreamEvent({
      type: 'response.output_text.delta',
      delta: 'Hello',
      item_id: 'msg_1',
      content_index: 0,
      output_index: 0
    })).toEqual({
      kind: 'text-delta',
      delta: 'Hello',
      outputIndex: 0
    })

    expect(normalizeNativeRuntimeStreamEvent({
      type: 'response.function_call_arguments.done',
      arguments: '{"url":"https://openai.com"}',
      output_index: 1,
      call_id: 'call_1'
    })).toEqual({
      kind: 'tool-call-arguments-done',
      callId: 'call_1',
      text: '{"url":"https://openai.com"}',
      outputIndex: 1
    })

    expect(normalizeNativeRuntimeStreamEvent({
      type: 'response.completed',
      response: {
        id: 'resp_2',
        object: 'response',
        created_at: 1,
        model: 'gpt-5.4',
        status: 'completed',
        output: [],
        usage: {
          input_tokens: 12,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 6,
          output_tokens_details: { reasoning_tokens: 2 },
          total_tokens: 18
        },
        error: null
      }
    })).toEqual({
      kind: 'response-completed',
      responseId: 'resp_2',
      model: 'gpt-5.4',
      status: 'completed',
      usage: {
        inputTokens: 12,
        cachedInputTokens: 0,
        outputTokens: 6,
        reasoningTokens: 2,
        totalTokens: 18
      },
      incompleteReason: null,
      errorCode: undefined,
      errorMessage: undefined
    })

    expect(normalizeNativeRuntimeStreamEvent({
      type: 'response.failed',
      response: {
        id: 'resp_3',
        object: 'response',
        created_at: 1,
        model: 'gpt-5.4',
        status: 'failed',
        output: [],
        usage: {
          input_tokens: 0,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 0,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 0
        },
        error: {
          code: 'upstream_error',
          message: 'Provider failed'
        }
      },
      error: {
        code: 'upstream_error',
        message: 'Provider failed'
      }
    })).toEqual({
      kind: 'response-failed',
      responseId: 'resp_3',
      model: 'gpt-5.4',
      status: 'failed',
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0
      },
      incompleteReason: null,
      errorCode: 'upstream_error',
      errorMessage: 'Provider failed'
    })
  })
})
