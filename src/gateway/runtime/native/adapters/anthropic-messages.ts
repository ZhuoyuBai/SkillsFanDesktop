import type { RuntimeEndpoint } from '../../../../shared/types/ai-sources'
import {
  normalizeAnthropicNativeRuntimeResponse,
  normalizeAnthropicNativeRuntimeStreamEvent
} from '../anthropic-normalize'
import { buildAnthropicNativeRuntimePreparedRequest } from '../anthropic-request'
import {
  createScaffoldedNativeAdapterError,
  type NativeRuntimeAdapter
} from '../types'
import { getNativeUserFacingMessage } from '../user-facing'

function matchesAnthropicMessagesEndpoint(endpoint: RuntimeEndpoint): boolean {
  return endpoint.provider === 'anthropic'
}

export const anthropicMessagesNativeAdapter: NativeRuntimeAdapter = {
  id: 'anthropic-messages',
  displayName: 'Anthropic Messages Adapter',
  providerIds: ['anthropic'],
  sourceIds: ['custom', 'zhipu', 'minimax', 'kimi', 'deepseek'],
  apiTypes: ['messages'],
  stage: 'ready',
  providerNativeExecution: true,
  supportsStreaming: false,
  supportsToolCalls: true,
  supportsUsage: true,
  note: getNativeUserFacingMessage('anthropicReady'),
  matches(endpoint) {
    return matchesAnthropicMessagesEndpoint(endpoint)
  },
  prepareRequest(input) {
    return buildAnthropicNativeRuntimePreparedRequest(input)
  },
  normalizeResponse(response) {
    return normalizeAnthropicNativeRuntimeResponse(response)
  },
  normalizeStreamEvent(event) {
    return normalizeAnthropicNativeRuntimeStreamEvent(event)
  },
  async sendMessage() {
    throw createScaffoldedNativeAdapterError(this)
  },
  async ensureSessionWarm() {
    throw createScaffoldedNativeAdapterError(this)
  }
}
