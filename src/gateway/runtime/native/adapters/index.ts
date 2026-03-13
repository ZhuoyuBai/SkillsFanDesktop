import type { RuntimeEndpoint } from '../../../../shared/types/ai-sources'
import { openAICodexResponsesNativeAdapter } from './openai-codex-responses'
import { openAIResponsesNativeAdapter } from './openai-responses'
import type { NativeAdapterId, NativeRuntimeAdapter, NativeRuntimeAdapterResolution } from '../types'
import { getNativeUserFacingMessage } from '../user-facing'

const NATIVE_RUNTIME_ADAPTERS: NativeRuntimeAdapter[] = [
  openAIResponsesNativeAdapter,
  openAICodexResponsesNativeAdapter
]

export function listNativeRuntimeAdapters(): NativeRuntimeAdapter[] {
  return [...NATIVE_RUNTIME_ADAPTERS]
}

export function getNativeRuntimeAdapter(
  adapterId: NativeAdapterId
): NativeRuntimeAdapter | null {
  return NATIVE_RUNTIME_ADAPTERS.find((adapter) => adapter.id === adapterId) || null
}

export function resolveNativeRuntimeAdapter(
  endpoint?: RuntimeEndpoint | null
): NativeRuntimeAdapterResolution {
  if (!endpoint) {
    return {
      adapter: null,
      reason: getNativeUserFacingMessage('noEndpoint')
    }
  }

  const adapter = NATIVE_RUNTIME_ADAPTERS.find((candidate) => candidate.matches(endpoint))
  if (!adapter) {
    return {
      adapter: null,
      reason: getNativeUserFacingMessage('outsideScope')
    }
  }

  return {
    adapter,
    reason: adapter.note
  }
}
