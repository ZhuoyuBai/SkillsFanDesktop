import type {
  AnthropicContentBlock,
  AnthropicMessageResponse,
  AnthropicStreamEvent,
  AnthropicUsage
} from '../../../main/openai-compat-router/types/anthropic'
import type {
  NativeNormalizedResponse,
  NativeNormalizedStreamEvent,
  NativeNormalizedToolCall,
  NativeNormalizedUsage
} from './types'

function normalizeUsage(usage?: AnthropicUsage | null): NativeNormalizedUsage | null {
  if (!usage) {
    return null
  }

  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cache_read_input_tokens || 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: 0,
    totalTokens: usage.input_tokens + usage.output_tokens
  }
}

function collectOutputText(content: AnthropicContentBlock[]): string {
  return content
    .filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

function collectToolCalls(content: AnthropicContentBlock[]): NativeNormalizedToolCall[] {
  return content
    .filter((block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      name: block.name,
      argumentsText: JSON.stringify(block.input || {}),
      status: 'completed'
    }))
}

function mapStopReasonToStatus(
  stopReason: AnthropicMessageResponse['stop_reason']
): NativeNormalizedResponse['status'] {
  if (stopReason === 'max_tokens' || stopReason === 'pause_turn') {
    return 'incomplete'
  }

  return 'completed'
}

export function normalizeAnthropicNativeRuntimeResponse(
  response: AnthropicMessageResponse | unknown
): NativeNormalizedResponse {
  const typed = response as AnthropicMessageResponse

  return {
    responseId: typed.id,
    model: typed.model,
    status: mapStopReasonToStatus(typed.stop_reason),
    outputText: collectOutputText(typed.content || []),
    refusalText: typed.stop_reason === 'refusal' ? collectOutputText(typed.content || []) || null : null,
    toolCalls: collectToolCalls(typed.content || []),
    usage: normalizeUsage(typed.usage),
    incompleteReason: typed.stop_reason === 'max_tokens' ? 'max_tokens' : null,
    error: null
  }
}

export function normalizeAnthropicNativeRuntimeStreamEvent(
  event: AnthropicStreamEvent | unknown
): NativeNormalizedStreamEvent {
  const typed = event as AnthropicStreamEvent

  if (typed && typeof typed === 'object' && typed.type === 'error') {
    return {
      kind: 'error',
      errorCode: typed.error.type,
      errorMessage: typed.error.message
    }
  }

  return {
    kind: 'error',
    errorCode: 'unsupported_event',
    errorMessage: `Unsupported anthropic native runtime stream event: ${(typed as { type?: string })?.type || 'unknown'}`
  }
}
