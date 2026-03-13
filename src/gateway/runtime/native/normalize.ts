import type {
  OpenAIResponsesError,
  OpenAIResponsesResponse,
  OpenAIResponsesStreamEvent,
  OpenAIResponsesUsage
} from '../../../main/openai-compat-router/types/openai-responses'
import type {
  NativeNormalizedResponse,
  NativeNormalizedStreamEvent,
  NativeNormalizedToolCall,
  NativeNormalizedUsage
} from './types'

function normalizeUsage(usage?: OpenAIResponsesUsage | null): NativeNormalizedUsage | null {
  if (!usage) {
    return null
  }

  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens || 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens || 0,
    totalTokens: usage.total_tokens
  }
}

function collectOutputText(output: OpenAIResponsesResponse['output']): {
  outputText: string
  refusalText: string | null
} {
  const textFragments: string[] = []
  const refusalFragments: string[] = []

  for (const item of output) {
    if (item.type !== 'message') {
      continue
    }

    for (const part of item.content) {
      if (part.type === 'output_text') {
        textFragments.push(part.text)
      } else if (part.type === 'refusal') {
        refusalFragments.push(part.refusal)
      }
    }
  }

  return {
    outputText: textFragments.join(''),
    refusalText: refusalFragments.length > 0 ? refusalFragments.join('\n') : null
  }
}

function collectToolCalls(output: OpenAIResponsesResponse['output']): NativeNormalizedToolCall[] {
  return output
    .filter((item): item is Extract<OpenAIResponsesResponse['output'][number], { type: 'function_call' }> => item.type === 'function_call')
    .map((item) => ({
      id: item.call_id,
      name: item.name,
      argumentsText: item.arguments,
      status: item.status
    }))
}

function normalizeError(error?: OpenAIResponsesError | null): { code: string; message: string } | null {
  if (!error) {
    return null
  }

  return {
    code: error.code,
    message: error.message
  }
}

function normalizeResponseLifecycleEvent(
  kind: NativeNormalizedStreamEvent['kind'],
  response: OpenAIResponsesResponse,
  incompleteReason?: string | null
): NativeNormalizedStreamEvent {
  return {
    kind,
    responseId: response.id,
    model: response.model,
    status: response.status,
    usage: normalizeUsage(response.usage),
    incompleteReason: incompleteReason || null,
    errorCode: response.error?.code,
    errorMessage: response.error?.message
  }
}

export function normalizeNativeRuntimeResponse(
  response: OpenAIResponsesResponse
): NativeNormalizedResponse {
  const textOutput = collectOutputText(response.output)

  return {
    responseId: response.id,
    model: response.model,
    status: response.status,
    outputText: textOutput.outputText,
    refusalText: textOutput.refusalText,
    toolCalls: collectToolCalls(response.output),
    usage: normalizeUsage(response.usage),
    incompleteReason: response.incomplete_details?.reason || null,
    error: normalizeError(response.error)
  }
}

export function normalizeNativeRuntimeStreamEvent(
  event: OpenAIResponsesStreamEvent
): NativeNormalizedStreamEvent {
  switch (event.type) {
    case 'response.created':
      return normalizeResponseLifecycleEvent('response-created', event.response)
    case 'response.in_progress':
      return normalizeResponseLifecycleEvent('response-in-progress', event.response)
    case 'response.completed':
      return normalizeResponseLifecycleEvent('response-completed', event.response)
    case 'response.incomplete':
      return normalizeResponseLifecycleEvent(
        'response-incomplete',
        event.response,
        event.incomplete_details.reason
      )
    case 'response.failed':
      return {
        ...normalizeResponseLifecycleEvent('response-failed', event.response),
        errorCode: event.error.code,
        errorMessage: event.error.message
      }
    case 'response.output_text.delta':
      return {
        kind: 'text-delta',
        delta: event.delta,
        outputIndex: event.output_index
      }
    case 'response.output_text.done':
      return {
        kind: 'text-done',
        text: event.text
      }
    case 'response.function_call_arguments.delta':
      return {
        kind: 'tool-call-arguments-delta',
        callId: event.call_id,
        delta: event.delta,
        outputIndex: event.output_index
      }
    case 'response.function_call_arguments.done':
      return {
        kind: 'tool-call-arguments-done',
        callId: event.call_id,
        text: event.arguments,
        outputIndex: event.output_index
      }
    case 'error':
      return {
        kind: 'error',
        errorCode: event.error.code,
        errorMessage: event.error.message
      }
    default:
      return {
        kind: 'error',
        errorCode: 'unsupported_event',
        errorMessage: `Unsupported native runtime stream event: ${(event as { type?: string }).type || 'unknown'}`
      }
  }
}
