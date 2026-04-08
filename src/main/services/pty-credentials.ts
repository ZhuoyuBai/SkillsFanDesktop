/**
 * PTY Credentials - API credential resolution for Claude Code CLI terminal
 *
 * Extracted from the retired agent module. Provides:
 * - Working directory resolution for spaces
 * - API credential resolution from aiSources config
 * - SDK transport resolution (Anthropic direct vs OpenAI compat router)
 */

import { homedir } from 'os'
import { getConfig } from './config.service'
import { getSpace } from './space.service'
import { getAISourceManager } from './ai-sources'
import { resolveAccessibleAiSource } from './ai-sources/hosted-ai-availability'
import { ensureOpenAICompatRouter, encodeBackendConfig } from '../openai-compat-router'
import type { AISourcesConfig } from '../../shared/types'

// ============================================
// Types
// ============================================

export interface ApiCredentials {
  baseUrl: string
  apiKey: string
  model: string
  provider: 'anthropic' | 'openai' | 'oauth'
  nativeAnthropicServerTools?: boolean
  customHeaders?: Record<string, string>
  apiType?: 'chat_completions' | 'responses'
}

export interface ResolvedSdkTransport {
  anthropicBaseUrl: string
  anthropicApiKey: string
  sdkModel: string
  routed: boolean
  apiType?: 'chat_completions' | 'responses'
}

const DEFAULT_MODEL = 'claude-opus-4-5-20251101'
const ROUTED_MODEL = 'claude-sonnet-4-20250514'

// ============================================
// Working Directory
// ============================================

export function getWorkingDir(spaceId: string): string {
  if (spaceId === 'skillsfan-temp') {
    return homedir()
  }

  const space = getSpace(spaceId)
  if (space) {
    return space.path
  }

  return homedir()
}

// ============================================
// API Credentials
// ============================================

function isNativeAnthropicBaseUrl(apiUrl: string): boolean {
  if (!apiUrl) return false
  try {
    return new URL(apiUrl).hostname === 'api.anthropic.com'
  } catch {
    return false
  }
}

export function inferOpenAIWireApi(apiUrl: string): 'responses' | 'chat_completions' {
  const envApiType = process.env.HALO_OPENAI_API_TYPE || process.env.HALO_OPENAI_WIRE_API
  if (envApiType) {
    const v = envApiType.toLowerCase()
    if (v.includes('response')) return 'responses'
    if (v.includes('chat')) return 'chat_completions'
  }
  if (apiUrl) {
    if (apiUrl.includes('/chat/completions') || apiUrl.includes('/chat_completions')) return 'chat_completions'
    if (apiUrl.includes('/responses')) return 'responses'
  }
  return 'chat_completions'
}

async function getApiCredentials(config: ReturnType<typeof getConfig>): Promise<ApiCredentials> {
  const manager = getAISourceManager()
  await manager.ensureInitialized()

  const aiSources = (config as any).aiSources
  const currentSource = aiSources?.current || 'custom'
  const currentConfig = aiSources?.[currentSource]
  const isOAuthProvider = currentConfig && typeof currentConfig === 'object' && 'loggedIn' in currentConfig

  let oauthTokenValid = true
  if (isOAuthProvider) {
    const tokenResult = await manager.ensureValidToken(currentSource)
    if (!tokenResult.success) {
      oauthTokenValid = false
    }
  }

  const backendConfig = manager.getBackendConfig()
  if (!backendConfig) {
    if (isOAuthProvider && !oauthTokenValid) {
      throw new Error('OAuth token expired or invalid. Please login again.')
    }
    throw new Error('No AI source configured. Please configure an API key or login.')
  }

  let provider: 'anthropic' | 'openai' | 'oauth'
  let nativeAnthropicServerTools = false

  if (isOAuthProvider && oauthTokenValid) {
    provider = 'oauth'
  } else {
    const providerType = currentConfig?.provider || aiSources?.custom?.provider
    provider = providerType === 'openai' ? 'openai' : 'anthropic'
    nativeAnthropicServerTools = provider === 'anthropic' && isNativeAnthropicBaseUrl(backendConfig.url)
  }

  return {
    baseUrl: backendConfig.url,
    apiKey: backendConfig.key,
    model: backendConfig.model || DEFAULT_MODEL,
    provider,
    nativeAnthropicServerTools,
    customHeaders: backendConfig.headers,
    apiType: backendConfig.apiType
  }
}

export async function getApiCredentialsForSource(
  config: ReturnType<typeof getConfig>,
  source: string,
  modelOverride?: string
): Promise<ApiCredentials> {
  const manager = getAISourceManager()
  await manager.ensureInitialized()

  const aiSources = ((config as any).aiSources || { current: 'custom' }) as AISourcesConfig
  const targetSource = resolveAccessibleAiSource(aiSources, source) || source
  const targetConfig = (aiSources as Record<string, any>)[targetSource]

  if (targetSource === (aiSources.current || 'custom')) {
    const credentials = await getApiCredentials(config)
    if (modelOverride) {
      credentials.model = modelOverride
    }
    return credentials
  }

  if (targetSource === 'custom' && aiSources.custom?.apiKey) {
    const baseUrl = (aiSources.custom.apiUrl || 'https://api.anthropic.com').replace(/\/$/, '')
    const provider = aiSources.custom.provider === 'openai' ? 'openai' : 'anthropic'
    return {
      baseUrl,
      apiKey: aiSources.custom.apiKey,
      model: modelOverride || aiSources.custom.model || DEFAULT_MODEL,
      provider,
      nativeAnthropicServerTools: provider === 'anthropic' && isNativeAnthropicBaseUrl(baseUrl),
      apiType: provider === 'openai' ? inferOpenAIWireApi(baseUrl) : undefined
    }
  }

  if (targetConfig && typeof targetConfig === 'object' && 'apiKey' in targetConfig && targetConfig.apiKey) {
    const baseUrl = (targetConfig.apiUrl || 'https://api.anthropic.com').replace(/\/$/, '')
    const provider = targetConfig.provider === 'openai' ? 'openai' : 'anthropic'
    return {
      baseUrl,
      apiKey: targetConfig.apiKey,
      model: modelOverride || targetConfig.model || DEFAULT_MODEL,
      provider,
      nativeAnthropicServerTools: provider === 'anthropic' && isNativeAnthropicBaseUrl(baseUrl),
      customHeaders: targetConfig.customHeaders,
      apiType: targetConfig.apiType || (provider === 'openai' ? inferOpenAIWireApi(baseUrl) : undefined)
    }
  }

  const providerObj = manager.getProvider(targetSource)
  if (providerObj) {
    await manager.ensureValidToken(targetSource)
    const backendConfig = providerObj.getBackendConfig(aiSources)
    if (!backendConfig) {
      throw new Error(`No AI source configured for ${targetSource}.`)
    }
    return {
      baseUrl: backendConfig.url,
      apiKey: backendConfig.key,
      model: modelOverride || backendConfig.model || DEFAULT_MODEL,
      provider: 'oauth',
      customHeaders: backendConfig.headers,
      apiType: backendConfig.apiType
    }
  }

  throw new Error(`No AI source configured for ${targetSource}. Please configure a model first.`)
}

// ============================================
// SDK Transport Resolution
// ============================================

export async function resolveSdkTransport(credentials: ApiCredentials): Promise<ResolvedSdkTransport> {
  let anthropicBaseUrl = credentials.baseUrl
  let anthropicApiKey = credentials.apiKey
  let sdkModel = credentials.model || DEFAULT_MODEL

  if (credentials.provider === 'anthropic') {
    return { anthropicBaseUrl, anthropicApiKey, sdkModel, routed: false }
  }

  const router = await ensureOpenAICompatRouter({ debug: false })
  anthropicBaseUrl = router.baseUrl

  const apiType = credentials.apiType
    || (credentials.provider === 'oauth' ? 'chat_completions' : inferOpenAIWireApi(credentials.baseUrl))

  anthropicApiKey = encodeBackendConfig({
    url: credentials.baseUrl,
    key: credentials.apiKey,
    model: credentials.model,
    headers: credentials.customHeaders,
    apiType
  })

  sdkModel = ROUTED_MODEL

  return { anthropicBaseUrl, anthropicApiKey, sdkModel, routed: true, apiType }
}
