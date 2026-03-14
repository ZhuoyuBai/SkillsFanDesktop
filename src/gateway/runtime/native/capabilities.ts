import type { RuntimeEndpoint } from '../../../shared/types/ai-sources'
import { resolveNativeRuntimeAdapter } from './adapters'
import type {
  NativeAdapterId,
  NativeAdapterStage,
  NativeProviderCapabilityReasonId
} from './types'
import { getNativeUserFacingMessage } from './user-facing'

export interface NativeProviderCapability {
  supported: boolean
  reasonId: NativeProviderCapabilityReasonId
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
      reasonId: 'no-endpoint',
      adapterId: null,
      adapterStage: null,
      providerNativeExecution: false,
      supportsStreaming: false,
      supportsToolCalls: false,
      supportsUsage: false,
      reason: getNativeUserFacingMessage('noEndpoint')
    }
  }

  const resolution = resolveNativeRuntimeAdapter(endpoint)
  if (resolution.adapter) {
    return {
      supported: true,
      reasonId: 'supported',
      adapterId: resolution.adapter.id,
      adapterStage: resolution.adapter.stage,
      providerNativeExecution: resolution.adapter.providerNativeExecution,
      supportsStreaming: resolution.adapter.supportsStreaming,
      supportsToolCalls: resolution.adapter.supportsToolCalls,
      supportsUsage: resolution.adapter.supportsUsage,
      reason: resolution.reason
    }
  }

  if (endpoint.provider !== 'anthropic' && endpoint.apiType !== 'responses') {
    return {
      supported: false,
      reasonId: 'requires-responses',
      adapterId: null,
      adapterStage: null,
      providerNativeExecution: false,
      supportsStreaming: false,
      supportsToolCalls: false,
      supportsUsage: false,
      reason: getNativeUserFacingMessage('requiresResponses')
    }
  }

  return {
    supported: false,
    reasonId: 'adapter-unavailable',
    adapterId: null,
    adapterStage: null,
    providerNativeExecution: false,
    supportsStreaming: false,
    supportsToolCalls: false,
    supportsUsage: false,
    reason: resolution.reason
  }
}
