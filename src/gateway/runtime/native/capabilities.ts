import type { RuntimeEndpoint } from '../../../shared/types/ai-sources'
import { resolveNativeRuntimeAdapter } from './adapters'
import type { NativeAdapterId, NativeAdapterStage } from './types'
import { getNativeUserFacingMessage } from './user-facing'

export interface NativeProviderCapability {
  supported: boolean
  adapterId: NativeAdapterId | null
  adapterStage: NativeAdapterStage | null
  providerNativeExecution: boolean
  supportsStreaming: boolean
  supportsToolCalls: boolean
  supportsUsage: boolean
  reason: string
}

export function resolveNativeProviderCapability(
  endpoint?: RuntimeEndpoint | null
): NativeProviderCapability {
  if (!endpoint) {
    return {
      supported: false,
      adapterId: null,
      adapterStage: null,
      providerNativeExecution: false,
      supportsStreaming: false,
      supportsToolCalls: false,
      supportsUsage: false,
      reason: getNativeUserFacingMessage('noEndpoint')
    }
  }

  if (endpoint.apiType !== 'responses') {
    return {
      supported: false,
      adapterId: null,
      adapterStage: null,
      providerNativeExecution: false,
      supportsStreaming: false,
      supportsToolCalls: false,
      supportsUsage: false,
      reason: getNativeUserFacingMessage('requiresResponses')
    }
  }

  const resolution = resolveNativeRuntimeAdapter(endpoint)
  if (resolution.adapter) {
    return {
      supported: true,
      adapterId: resolution.adapter.id,
      adapterStage: resolution.adapter.stage,
      providerNativeExecution: resolution.adapter.providerNativeExecution,
      supportsStreaming: resolution.adapter.supportsStreaming,
      supportsToolCalls: resolution.adapter.supportsToolCalls,
      supportsUsage: resolution.adapter.supportsUsage,
      reason: resolution.reason
    }
  }

  return {
    supported: false,
    adapterId: null,
    adapterStage: null,
    providerNativeExecution: false,
    supportsStreaming: false,
    supportsToolCalls: false,
    supportsUsage: false,
    reason: resolution.reason
  }
}
