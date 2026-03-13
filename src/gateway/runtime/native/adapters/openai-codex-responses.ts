import type { RuntimeEndpoint } from '../../../../shared/types/ai-sources'
import { normalizeNativeRuntimeResponse, normalizeNativeRuntimeStreamEvent } from '../normalize'
import { buildNativeRuntimePreparedRequest } from '../request'
import {
  createScaffoldedNativeAdapterError,
  type NativeRuntimeAdapter
} from '../types'
import { getNativeUserFacingMessage } from '../user-facing'

function matchesOpenAICodexResponsesEndpoint(endpoint: RuntimeEndpoint): boolean {
  return endpoint.apiType === 'responses'
    && (
      endpoint.source === 'openai-codex'
      || endpoint.requestedSource === 'openai-codex'
    )
}

export const openAICodexResponsesNativeAdapter: NativeRuntimeAdapter = {
  id: 'openai-codex-responses',
  displayName: 'OpenAI Codex Responses Adapter',
  providerIds: ['openai-codex'],
  sourceIds: ['openai-codex'],
  apiTypes: ['responses'],
  stage: 'ready',
  providerNativeExecution: true,
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsUsage: true,
  note: getNativeUserFacingMessage('codexReady'),
  matches(endpoint) {
    return matchesOpenAICodexResponsesEndpoint(endpoint)
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
