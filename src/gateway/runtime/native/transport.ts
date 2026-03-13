import type { RuntimeEndpoint } from '../../../shared/types/ai-sources'
import { resolveNativeRuntimeAdapter } from './adapters'
import type { NativeAdapterId } from './types'

export interface NativeRuntimeTransportPlan {
  adapterId: NativeAdapterId
  endpointUrl: string
  apiType: 'responses'
  defaultTransport: 'auto'
  supportsWebSocket: boolean
  websocketWarmup: boolean
  storePolicy: 'force-true' | 'force-false'
  serverCompactionCapable: boolean
  serverCompactionDefault: boolean
  authHeaderMode: 'bearer'
  extraHeaderKeys: string[]
  note: string
}

export interface NativeRuntimeTransportResolution {
  plan: NativeRuntimeTransportPlan | null
  reason: string
}

function isDirectOpenAIResponsesBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    const hostname = url.hostname.toLowerCase()
    return hostname === 'api.openai.com'
  } catch {
    return baseUrl.includes('api.openai.com')
  }
}

function isAzureOpenAIResponsesBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return url.hostname.toLowerCase().endsWith('.openai.azure.com')
  } catch {
    return baseUrl.includes('.openai.azure.com')
  }
}

export function resolveNativeRuntimeTransportPlan(
  endpoint?: RuntimeEndpoint | null
): NativeRuntimeTransportResolution {
  const resolution = resolveNativeRuntimeAdapter(endpoint)
  const adapter = resolution.adapter

  if (!endpoint || !adapter) {
    return {
      plan: null,
      reason: resolution.reason
    }
  }

  if (adapter.id === 'openai-responses') {
    const serverCompactionCapable =
      isDirectOpenAIResponsesBaseUrl(endpoint.baseUrl)
      || isAzureOpenAIResponsesBaseUrl(endpoint.baseUrl)

    return {
      plan: {
        adapterId: adapter.id,
        endpointUrl: endpoint.baseUrl,
        apiType: 'responses',
        defaultTransport: 'auto',
        supportsWebSocket: true,
        websocketWarmup: true,
        storePolicy: 'force-true',
        serverCompactionCapable,
        serverCompactionDefault: isDirectOpenAIResponsesBaseUrl(endpoint.baseUrl),
        authHeaderMode: 'bearer',
        extraHeaderKeys: Object.keys(endpoint.headers || {}),
        note: serverCompactionCapable
          ? 'OpenAI Responses uses auto transport, enables WebSocket warmup, and can apply server-side compaction rules.'
          : 'OpenAI Responses uses auto transport and WebSocket warmup, but server-side compaction defaults depend on the upstream endpoint.'
      },
      reason: 'Transport plan resolved for the OpenAI Responses adapter.'
    }
  }

  if (adapter.id === 'openai-codex-responses') {
    return {
      plan: {
        adapterId: adapter.id,
        endpointUrl: endpoint.baseUrl,
        apiType: 'responses',
        defaultTransport: 'auto',
        supportsWebSocket: true,
        websocketWarmup: false,
        storePolicy: 'force-false',
        serverCompactionCapable: false,
        serverCompactionDefault: false,
        authHeaderMode: 'bearer',
        extraHeaderKeys: Object.keys(endpoint.headers || {}),
        note: 'OpenAI Codex Responses uses auto transport, disables warmup by default, and forces store=false.'
      },
      reason: 'Transport plan resolved for the OpenAI Codex Responses adapter.'
    }
  }

  return {
    plan: null,
    reason: resolution.reason
  }
}
