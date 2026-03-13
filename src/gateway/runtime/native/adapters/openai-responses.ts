import type { RuntimeEndpoint } from '../../../../shared/types/ai-sources'
import { normalizeNativeRuntimeResponse, normalizeNativeRuntimeStreamEvent } from '../normalize'
import { buildNativeRuntimePreparedRequest } from '../request'
import {
  createScaffoldedNativeAdapterError,
  type NativeRuntimeAdapter
} from '../types'
import { getNativeUserFacingMessage } from '../user-facing'

function matchesOpenAIResponsesEndpoint(endpoint: RuntimeEndpoint): boolean {
  return endpoint.apiType === 'responses'
    && endpoint.provider === 'openai'
    && (
      endpoint.source === 'custom'
      || endpoint.requestedSource === 'custom'
    )
}

export const openAIResponsesNativeAdapter: NativeRuntimeAdapter = {
  id: 'openai-responses',
  displayName: 'OpenAI Responses Adapter',
  providerIds: ['openai'],
  sourceIds: ['custom'],
  apiTypes: ['responses'],
  stage: 'ready',
  providerNativeExecution: true,
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsUsage: true,
  note: getNativeUserFacingMessage('openAIReady'),
  matches(endpoint) {
    return matchesOpenAIResponsesEndpoint(endpoint)
  },
  prepareRequest(input) {
    return buildNativeRuntimePreparedRequest(input, this)
  },
  normalizeResponse(response) {
    return normalizeNativeRuntimeResponse(response)
  },
  normalizeStreamEvent(event) {
    return normalizeNativeRuntimeStreamEvent(event)
  },
  async sendMessage() {
    throw createScaffoldedNativeAdapterError(this)
  },
  async ensureSessionWarm() {
    throw createScaffoldedNativeAdapterError(this)
  }
}
