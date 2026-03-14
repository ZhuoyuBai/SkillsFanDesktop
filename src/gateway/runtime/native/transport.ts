import type { RuntimeEndpoint } from '../../../shared/types/ai-sources'
import { resolveNativeRuntimeAdapter } from './adapters'
import type { NativeAdapterId } from './types'

export interface NativeRuntimeTransportPlan {
  adapterId: NativeAdapterId
  endpointUrl: string
  requestTimeoutMs: number
  apiType: 'responses' | 'messages'
  defaultTransport: 'auto'
  supportsWebSocket: boolean
  websocketWarmup: boolean
  storePolicy: 'force-true' | 'force-false'
  serverCompactionCapable: boolean
  serverCompactionDefault: boolean
  authHeaderMode: 'bearer' | 'x-api-key'
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

const DEFAULT_NATIVE_REQUEST_TIMEOUT_MS = 5 * 60_000
const DEEPSEEK_NATIVE_REQUEST_TIMEOUT_MS = 10 * 60_000

function isDeepSeekSource(endpoint: RuntimeEndpoint): boolean {
  const source = (endpoint.source || endpoint.requestedSource || '').toLowerCase()
  if (source === 'deepseek') {
    return true
  }

  try {
    return new URL(endpoint.baseUrl).hostname.toLowerCase() === 'api.deepseek.com'
  } catch {
    return endpoint.baseUrl.toLowerCase().includes('api.deepseek.com')
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
        requestTimeoutMs: DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
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
        requestTimeoutMs: DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
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

  if (adapter.id === 'anthropic-messages') {
    return {
      plan: {
        adapterId: adapter.id,
        endpointUrl: `${endpoint.baseUrl.replace(/\/$/, '')}/v1/messages`,
        requestTimeoutMs: isDeepSeekSource(endpoint)
          ? DEEPSEEK_NATIVE_REQUEST_TIMEOUT_MS
          : DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
        apiType: 'messages',
        defaultTransport: 'auto',
        supportsWebSocket: false,
        websocketWarmup: false,
        storePolicy: 'force-false',
        serverCompactionCapable: false,
        serverCompactionDefault: false,
        authHeaderMode: 'x-api-key',
        extraHeaderKeys: Object.keys(endpoint.headers || {}),
        note: 'Anthropic-compatible Messages uses direct HTTPS requests, disables warmup, and keeps tool roundtrips on the messages endpoint.'
      },
      reason: 'Transport plan resolved for the Anthropic Messages adapter.'
    }
  }

  return {
    plan: null,
    reason: resolution.reason
  }
}
