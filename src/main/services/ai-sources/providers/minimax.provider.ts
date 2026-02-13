/**
 * MiniMax Provider
 *
 * Uses the SkillsFan website as an OpenAI-compatible API proxy to access MiniMax models.
 * Shares OAuth authentication with SkillsFan Credits and GLM providers.
 *
 * Authentication: Delegates to the existing SkillsFan OAuth auth service.
 * Tokens stay in skillsfan-auth.json (shared with SkillsFan Credits and GLM).
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
// Constants
// ============================================================================

const MINIMAX_DEFAULT_MODEL = 'MiniMax-M2.1'
const PROVIDER_KEY = 'minimax-oauth'

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

export interface MiniMaxConfig extends OAuthSourceConfig {
  modelPricing?: Record<string, { input: number; output: number }>
}

// ============================================================================
// Provider Implementation
// ============================================================================

class MiniMaxProvider implements OAuthAISourceProvider {
  readonly type: AISourceType = PROVIDER_KEY
  readonly displayName = 'MiniMax'

  isConfigured(config: AISourcesConfig): boolean {
    if (sfIsLoggedIn()) return true
    const mmConfig = config[PROVIDER_KEY] as MiniMaxConfig | undefined
    return !!(mmConfig?.loggedIn)
  }

  getBackendConfig(config: AISourcesConfig): BackendRequestConfig | null {
    const mmConfig = config[PROVIDER_KEY] as MiniMaxConfig | undefined

    const token = sfGetFullAuthState().accessToken || mmConfig?.accessToken
    if (!token) {
      console.warn('[MiniMax] No access token available')
      return null
    }

    const model = mmConfig?.model || MINIMAX_DEFAULT_MODEL

    return {
      url: `${SKILLSFAN_BASE_URL}/api/v1/chat/completions`,
      key: token,
      model,
      apiType: 'chat_completions'
    }
  }

  getCurrentModel(config: AISourcesConfig): string | null {
    const mmConfig = config[PROVIDER_KEY] as MiniMaxConfig | undefined
    return mmConfig?.model || MINIMAX_DEFAULT_MODEL
  }

  async getAvailableModels(config: AISourcesConfig): Promise<string[]> {
    const mmConfig = config[PROVIDER_KEY] as MiniMaxConfig | undefined
    try {
      const models = await this.fetchModelsFromAPI()
      return models.map(m => m.id)
    } catch {
      return mmConfig?.availableModels || [MINIMAX_DEFAULT_MODEL]
    }
  }

  getUserInfo(config: AISourcesConfig): AISourceUserInfo | null {
    const user = sfGetUserInfo()
    if (!user) {
      const mmConfig = config[PROVIDER_KEY] as MiniMaxConfig | undefined
      return mmConfig?.user || null
    }
    return {
      name: user.name,
      avatar: user.avatar,
      uid: user.id
    }
  }

  // ========== OAuth Flow (shared with SkillsFan Credits and GLM) ==========

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
          state: 'minimax-oauth-login'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start login'
      }
    }
  }

  async completeLogin(_state: string): Promise<ProviderResult<OAuthCompleteResult>> {
    if (sfIsLoggedIn()) {
      return this.buildLoginResult()
    }

    return new Promise<ProviderResult<OAuthCompleteResult>>((resolve) => {
      const timeout = setTimeout(() => {
        cleanup()
        resolve({ success: false, error: 'Login timeout' })
      }, AUTH_TIMEOUT_MS)

      const cleanup = onLoginSuccess(async () => {
        clearTimeout(timeout)
        resolve(await this.buildLoginResult())
      })
    })
  }

  async refreshToken(): Promise<ProviderResult<void>> {
    const result = await sfRefreshToken()
    return result.success ? { success: true } : { success: false, error: 'Token refresh failed' }
  }

  async checkToken(): Promise<ProviderResult<{ valid: boolean; expiresIn?: number }>> {
    const valid = sfIsLoggedIn()
    return { success: true, data: { valid } }
  }

  async logout(): Promise<ProviderResult<void>> {
    await sfLogout()
    return { success: true }
  }

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
  }

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
  }

  async refreshConfig(config: AISourcesConfig): Promise<ProviderResult<Partial<AISourcesConfig>>> {
    if (!sfIsLoggedIn()) {
      return { success: false, error: 'Not logged in' }
    }

    try {
      const models = await this.fetchModelsFromAPI()
      const mmConfig = config[PROVIDER_KEY] as MiniMaxConfig | undefined

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

      const user = sfGetUserInfo()
      const baseConfig: Record<string, unknown> = {
        loggedIn: true,
        user: mmConfig?.user || (user ? { name: user.name, avatar: user.avatar, uid: user.id } : undefined),
        model: mmConfig?.model || MINIMAX_DEFAULT_MODEL,
      }

      return {
        success: true,
        data: {
          [PROVIDER_KEY]: {
            ...baseConfig,
            ...mmConfig,
            availableModels: modelIds,
            modelNames,
            modelPricing
          } as MiniMaxConfig
        }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // ========== Internal ==========

  private async buildLoginResult(): Promise<ProviderResult<OAuthCompleteResult>> {
    const user = sfGetUserInfo()
    const token = await sfGetAccessToken()

    if (!user || !token) {
      return { success: false, error: 'Failed to get user info or token' }
    }

    let models: SkillsFanModel[] = []
    try {
      models = await this.fetchModelsFromAPI()
    } catch (e) {
      console.warn('[MiniMax] Failed to fetch models during login:', e)
    }

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

    const fullState = sfGetFullAuthState()

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
      _defaultModel: modelIds.includes(MINIMAX_DEFAULT_MODEL) ? MINIMAX_DEFAULT_MODEL : (modelIds[0] || MINIMAX_DEFAULT_MODEL),
      _modelPricing: modelPricing
    }

    return { success: true, data: result }
  }

  private async fetchModelsFromAPI(): Promise<SkillsFanModel[]> {
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
    // Filter to only MiniMax models
    return (data.data || []).filter(m =>
      m.owned_by === 'minimax' || m.id.toLowerCase().includes('minimax')
    )
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let providerInstance: MiniMaxProvider | null = null

export function getMiniMaxProvider(): MiniMaxProvider {
  if (!providerInstance) {
    providerInstance = new MiniMaxProvider()
  }
  return providerInstance
}

export { MiniMaxProvider }
