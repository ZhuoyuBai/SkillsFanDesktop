/**
 * SkillsFan Proxy Provider Factory
 *
 * Parameterized factory that generates OAuthAISourceProvider implementations
 * for models proxied through the SkillsFan backend.
 *
 * All SkillsFan-proxied providers (GLM, MiniMax, SkillsFan Credits, etc.) share:
 * - Same OAuth authentication flow (SkillsFan account)
 * - Same API endpoint (SKILLSFAN_BASE_URL/api/v1/chat/completions)
 * - Same token management logic
 * - Same model list API (SKILLSFAN_BASE_URL/api/v1/models)
 *
 * Instead of duplicating ~370 lines per provider, this factory takes a config
 * object and produces a complete provider instance.
 */

import type {
  OAuthAISourceProvider,
  ProviderResult
} from '../../../../shared/interfaces'
import type {
  AISourceType,
  AISourcesConfig,
  BackendRequestConfig,
  OAuthSourceConfig,
  OAuthStartResult,
  OAuthCompleteResult,
  AISourceUserInfo
} from '../../../../shared/types'
import {
  startLogin as sfStartLogin,
  isLoggedIn as sfIsLoggedIn,
  getUserInfo as sfGetUserInfo,
  getAccessToken as sfGetAccessToken,
  refreshToken as sfRefreshToken,
  logout as sfLogout,
  onLoginSuccess,
  getFullAuthState as sfGetFullAuthState
} from '../../skillsfan/auth.service'
import { SKILLSFAN_BASE_URL, AUTH_TIMEOUT_MS, TOKEN_REFRESH_THRESHOLD_MS } from '../../skillsfan/constants'

// ============================================================================
// Types
// ============================================================================

interface SkillsFanModel {
  id: string
  name: string
  owned_by: string
  pricing?: {
    input_credits_per_1k: number
    output_credits_per_1k: number
  }
}

interface ModelsResponse {
  object: string
  data: SkillsFanModel[]
}

export interface SkillsFanProxySourceConfig extends OAuthSourceConfig {
  modelPricing?: Record<string, { input: number; output: number }>
}

// ============================================================================
// Factory Config
// ============================================================================

export interface SkillsFanProxyConfig {
  /** Provider unique identifier, e.g. 'glm', 'minimax-oauth', 'deepseek-proxy' */
  type: AISourceType
  /** Display name, e.g. 'GLM-5', 'MiniMax' */
  displayName: string
  /** Default model ID, e.g. 'glm-5'. Empty string means use first available from API */
  defaultModel: string
  /** Filter models from /api/v1/models response. undefined means no filter (show all) */
  modelFilter?: (model: { id: string; owned_by: string }) => boolean
  /** Custom API fallback key when OAuth is unavailable, e.g. 'zhipu', 'minimax' */
  customApiFallback?: string
  /** Login state identifier string, e.g. 'glm-login'. Defaults to '{type}-login' */
  loginState?: string
}

// ============================================================================
// Extended interface for token management (used by AISourceManager)
// ============================================================================

interface SkillsFanProxyProvider extends OAuthAISourceProvider {
  checkTokenWithConfig(config: AISourcesConfig): { valid: boolean; expiresIn?: number; needsRefresh: boolean }
  refreshTokenWithConfig(config: AISourcesConfig): Promise<ProviderResult<{
    accessToken: string
    refreshToken: string
    expiresAt: number
  }>>
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an OAuthAISourceProvider for a model proxied through SkillsFan backend.
 */
export function createSkillsFanProxyProvider(proxyConfig: SkillsFanProxyConfig): SkillsFanProxyProvider {
  const {
    type,
    displayName,
    defaultModel,
    modelFilter,
    loginState = `${type}-login`
  } = proxyConfig

  // Internal helper: get provider-specific config from AISourcesConfig
  function getProviderConfig(config: AISourcesConfig): SkillsFanProxySourceConfig | undefined {
    return config[type] as SkillsFanProxySourceConfig | undefined
  }

  // Internal helper: fetch and optionally filter models from API
  async function fetchModelsFromAPI(): Promise<SkillsFanModel[]> {
    const token = await sfGetAccessToken()
    if (!token) {
      throw new Error('No access token')
    }

    const response = await fetch(`${SKILLSFAN_BASE_URL}/api/v1/models`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const data: ModelsResponse = await response.json()
    const allModels = data.data || []
    return modelFilter ? allModels.filter(modelFilter) : allModels
  }

  // Internal helper: extract model metadata (names, pricing)
  function extractModelMeta(models: SkillsFanModel[]) {
    const modelIds = models.map(m => m.id)
    const modelNames: Record<string, string> = {}
    const modelPricing: Record<string, { input: number; output: number }> = {}

    for (const m of models) {
      modelNames[m.id] = m.name || m.id
      if (m.pricing) {
        modelPricing[m.id] = {
          input: m.pricing.input_credits_per_1k,
          output: m.pricing.output_credits_per_1k
        }
      }
    }

    return { modelIds, modelNames, modelPricing }
  }

  // Internal helper: build login result after successful authentication
  async function buildLoginResult(): Promise<ProviderResult<OAuthCompleteResult>> {
    const user = sfGetUserInfo()
    const token = await sfGetAccessToken()

    if (!user || !token) {
      return { success: false, error: 'Failed to get user info or token' }
    }

    let models: SkillsFanModel[] = []
    try {
      models = await fetchModelsFromAPI()
    } catch (e) {
      console.warn(`[${displayName}] Failed to fetch models during login:`, e)
    }

    const { modelIds, modelNames, modelPricing } = extractModelMeta(models)
    const fullState = sfGetFullAuthState()

    const resolvedDefaultModel = defaultModel
      ? (modelIds.includes(defaultModel) ? defaultModel : (modelIds[0] || defaultModel))
      : (modelIds[0] || '')

    const result: OAuthCompleteResult & {
      _tokenData: { accessToken: string; refreshToken: string; expiresAt: number; uid: string }
      _availableModels: string[]
      _modelNames: Record<string, string>
      _defaultModel: string
      _modelPricing: Record<string, { input: number; output: number }>
    } = {
      success: true,
      user: {
        name: user.name,
        avatar: user.avatar,
        uid: user.id
      },
      _tokenData: {
        accessToken: fullState.accessToken || token,
        refreshToken: fullState.refreshToken || '',
        expiresAt: fullState.tokenExpiresAt || Date.now() + 3600 * 1000,
        uid: user.id
      },
      _availableModels: modelIds,
      _modelNames: modelNames,
      _defaultModel: resolvedDefaultModel,
      _modelPricing: modelPricing
    }

    return { success: true, data: result }
  }

  // ========== Build the provider object ==========

  const provider: SkillsFanProxyProvider = {
    type,
    displayName,

    isConfigured(config: AISourcesConfig): boolean {
      if (sfIsLoggedIn()) return true
      const providerConfig = getProviderConfig(config)
      return !!(providerConfig?.loggedIn)
    },

    getBackendConfig(config: AISourcesConfig): BackendRequestConfig | null {
      const providerConfig = getProviderConfig(config)

      const token = sfGetFullAuthState().accessToken || providerConfig?.accessToken
      if (!token) {
        console.warn(`[${displayName}] No access token available`)
        return null
      }

      const model = providerConfig?.model || defaultModel
      if (!model) {
        console.warn(`[${displayName}] No model selected`)
        return null
      }

      return {
        url: `${SKILLSFAN_BASE_URL}/api/v1/chat/completions`,
        key: token,
        model,
        apiType: 'chat_completions'
      }
    },

    getCurrentModel(config: AISourcesConfig): string | null {
      const providerConfig = getProviderConfig(config)
      return providerConfig?.model || defaultModel || null
    },

    async getAvailableModels(config: AISourcesConfig): Promise<string[]> {
      const providerConfig = getProviderConfig(config)
      try {
        const models = await fetchModelsFromAPI()
        return models.map(m => m.id)
      } catch {
        return providerConfig?.availableModels || (defaultModel ? [defaultModel] : [])
      }
    },

    getUserInfo(config: AISourcesConfig): AISourceUserInfo | null {
      const user = sfGetUserInfo()
      if (!user) {
        const providerConfig = getProviderConfig(config)
        return providerConfig?.user || null
      }
      return {
        name: user.name,
        avatar: user.avatar,
        uid: user.id
      }
    },

    // ========== OAuth Flow ==========

    async startLogin(): Promise<ProviderResult<OAuthStartResult>> {
      try {
        const result = await sfStartLogin()
        if (!result.success) {
          return { success: false, error: result.error }
        }

        return {
          success: true,
          data: {
            loginUrl: SKILLSFAN_BASE_URL,
            state: loginState
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start login'
        }
      }
    },

    async completeLogin(_state: string): Promise<ProviderResult<OAuthCompleteResult>> {
      if (sfIsLoggedIn()) {
        return buildLoginResult()
      }

      return new Promise<ProviderResult<OAuthCompleteResult>>((resolve) => {
        const timeout = setTimeout(() => {
          cleanup()
          resolve({ success: false, error: 'Login timeout' })
        }, AUTH_TIMEOUT_MS)

        const cleanup = onLoginSuccess(async () => {
          clearTimeout(timeout)
          resolve(await buildLoginResult())
        })
      })
    },

    async refreshToken(): Promise<ProviderResult<void>> {
      const result = await sfRefreshToken()
      return result.success ? { success: true } : { success: false, error: 'Token refresh failed' }
    },

    async checkToken(): Promise<ProviderResult<{ valid: boolean; expiresIn?: number }>> {
      const valid = sfIsLoggedIn()
      return { success: true, data: { valid } }
    },

    async logout(): Promise<ProviderResult<void>> {
      await sfLogout()
      return { success: true }
    },

    // ========== Token Management ==========

    checkTokenWithConfig(_config: AISourcesConfig): { valid: boolean; expiresIn?: number; needsRefresh: boolean } {
      if (!sfIsLoggedIn()) {
        return { valid: false, needsRefresh: false }
      }

      const fullState = sfGetFullAuthState()
      const expiresAt = fullState.tokenExpiresAt || 0
      const now = Date.now()

      return {
        valid: expiresAt > now,
        expiresIn: Math.max(0, expiresAt - now),
        needsRefresh: expiresAt < now + TOKEN_REFRESH_THRESHOLD_MS
      }
    },

    async refreshTokenWithConfig(_config: AISourcesConfig): Promise<ProviderResult<{
      accessToken: string
      refreshToken: string
      expiresAt: number
    }>> {
      const result = await sfRefreshToken()
      if (!result.success) {
        return { success: false, error: 'Token refresh failed' }
      }

      const fullState = sfGetFullAuthState()
      return {
        success: true,
        data: {
          accessToken: fullState.accessToken || '',
          refreshToken: fullState.refreshToken || '',
          expiresAt: fullState.tokenExpiresAt || Date.now() + 3600 * 1000
        }
      }
    },

    async refreshConfig(config: AISourcesConfig): Promise<ProviderResult<Partial<AISourcesConfig>>> {
      if (!sfIsLoggedIn()) {
        return { success: false, error: 'Not logged in' }
      }

      try {
        const models = await fetchModelsFromAPI()
        const providerConfig = getProviderConfig(config)
        const { modelIds, modelNames, modelPricing } = extractModelMeta(models)

        const user = sfGetUserInfo()
        const baseConfig: Record<string, unknown> = {
          loggedIn: true,
          user: providerConfig?.user || (user ? { name: user.name, avatar: user.avatar, uid: user.id } : undefined),
          model: providerConfig?.model || defaultModel || modelIds[0] || '',
        }

        return {
          success: true,
          data: {
            [type]: {
              ...baseConfig,
              ...providerConfig,
              availableModels: modelIds,
              modelNames,
              modelPricing
            } as SkillsFanProxySourceConfig
          }
        }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  }

  return provider
}
