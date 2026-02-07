/**
 * SkillsFan Credits Provider
 *
 * Uses the SkillsFan website as an OpenAI-compatible API proxy.
 * Users pay with credits instead of needing their own API keys.
 * Full Agent capabilities (tool calls, file ops, etc.) work via the OpenAI compat router.
 *
 * Authentication: Delegates to the existing SkillsFan OAuth auth service.
 * Tokens stay in skillsfan-auth.json, not duplicated in config.json.
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
  ensureValidToken as sfEnsureValidToken,
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

/** Extended config to store pricing info alongside standard OAuthSourceConfig */
export interface SkillsFanCreditsConfig extends OAuthSourceConfig {
  modelPricing?: Record<string, { input: number; output: number }>
}

// ============================================================================
// Provider Implementation
// ============================================================================

class SkillsFanCreditsProvider implements OAuthAISourceProvider {
  readonly type: AISourceType = 'skillsfan-credits'
  readonly displayName = 'SkillsFan Credits'

  /**
   * Check if provider is configured (user is logged into SkillsFan)
   */
  isConfigured(config: AISourcesConfig): boolean {
    // Primary check: is the user logged into SkillsFan auth service?
    if (sfIsLoggedIn()) return true
    // Fallback: check config (for when auth state hasn't loaded yet)
    const sfConfig = config['skillsfan-credits'] as SkillsFanCreditsConfig | undefined
    return !!(sfConfig?.loggedIn)
  }

  /**
   * Get backend configuration for API calls.
   * Routes through the OpenAI compat router to the website's chat completions endpoint.
   */
  getBackendConfig(config: AISourcesConfig): BackendRequestConfig | null {
    const sfConfig = config['skillsfan-credits'] as SkillsFanCreditsConfig | undefined

    // Prefer in-memory auth state (always up-to-date after loadAuthState/refreshToken)
    // over config.json token which may be stale after token refresh at startup
    const token = sfGetFullAuthState().accessToken || sfConfig?.accessToken
    if (!token) {
      console.warn('[SkillsFanCredits] No access token available')
      return null
    }

    const model = sfConfig?.model || ''
    if (!model) {
      console.warn('[SkillsFanCredits] No model selected')
      return null
    }

    return {
      url: `${SKILLSFAN_BASE_URL}/api/v1/chat/completions`,
      key: token,
      model,
      apiType: 'chat_completions'
    }
  }

  /**
   * Get current model
   */
  getCurrentModel(config: AISourcesConfig): string | null {
    const sfConfig = config['skillsfan-credits'] as SkillsFanCreditsConfig | undefined
    return sfConfig?.model || null
  }

  /**
   * Get available models from website API
   */
  async getAvailableModels(config: AISourcesConfig): Promise<string[]> {
    const sfConfig = config['skillsfan-credits'] as SkillsFanCreditsConfig | undefined
    try {
      const models = await this.fetchModelsFromAPI()
      return models.map(m => m.id)
    } catch {
      return sfConfig?.availableModels || []
    }
  }

  /**
   * Get user info from SkillsFan auth
   */
  getUserInfo(config: AISourcesConfig): AISourceUserInfo | null {
    const user = sfGetUserInfo()
    if (!user) {
      const sfConfig = config['skillsfan-credits'] as SkillsFanCreditsConfig | undefined
      return sfConfig?.user || null
    }
    return {
      name: user.name,
      avatar: user.avatar,
      uid: user.id
    }
  }

  // ========== OAuth Flow ==========

  /**
   * Start login - delegates to existing SkillsFan OAuth
   */
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
          state: 'skillsfan-credits-login'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start login'
      }
    }
  }

  /**
   * Complete login - waits for deep link callback via onLoginSuccess hook
   */
  async completeLogin(_state: string): Promise<ProviderResult<OAuthCompleteResult>> {
    // If already logged in, complete immediately
    if (sfIsLoggedIn()) {
      return this.buildLoginResult()
    }

    // Wait for deep link callback
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

  /**
   * Refresh token - delegates to SkillsFan auth
   */
  async refreshToken(): Promise<ProviderResult<void>> {
    const result = await sfRefreshToken()
    return result.success ? { success: true } : { success: false, error: 'Token refresh failed' }
  }

  /**
   * Check token validity
   */
  async checkToken(): Promise<ProviderResult<{ valid: boolean; expiresIn?: number }>> {
    const valid = sfIsLoggedIn()
    return { success: true, data: { valid } }
  }

  /**
   * Logout
   */
  async logout(): Promise<ProviderResult<void>> {
    await sfLogout()
    return { success: true }
  }

  // ========== Token Management (called by AISourceManager) ==========

  /**
   * Check token validity using SkillsFan auth state
   */
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

  /**
   * Refresh token and return updated data for config storage
   */
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

  /**
   * Refresh config - re-fetch model list from API
   */
  async refreshConfig(config: AISourcesConfig): Promise<ProviderResult<Partial<AISourcesConfig>>> {
    if (!sfIsLoggedIn()) {
      return { success: false, error: 'Not logged in' }
    }

    try {
      const models = await this.fetchModelsFromAPI()
      const sfConfig = config['skillsfan-credits'] as SkillsFanCreditsConfig | undefined

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

      // Build base config - ensure loggedIn and user info are present
      // even when sfConfig is undefined (e.g. logged in via auth.service
      // but config.json doesn't have skillsfan-credits yet)
      const user = sfGetUserInfo()
      const baseConfig: Record<string, unknown> = {
        loggedIn: true,
        user: sfConfig?.user || (user ? { name: user.name, avatar: user.avatar, uid: user.id } : undefined),
        model: sfConfig?.model || modelIds[0] || '',
      }

      return {
        success: true,
        data: {
          'skillsfan-credits': {
            ...baseConfig,
            ...sfConfig,
            availableModels: modelIds,
            modelNames,
            modelPricing
          } as SkillsFanCreditsConfig
        }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // ========== Internal ==========

  /**
   * Build login result after successful authentication
   */
  private async buildLoginResult(): Promise<ProviderResult<OAuthCompleteResult>> {
    const user = sfGetUserInfo()
    const token = await sfGetAccessToken()

    if (!user || !token) {
      return { success: false, error: 'Failed to get user info or token' }
    }

    // Fetch models from website
    let models: SkillsFanModel[] = []
    try {
      models = await this.fetchModelsFromAPI()
    } catch (e) {
      console.warn('[SkillsFanCredits] Failed to fetch models during login:', e)
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
      _defaultModel: modelIds[0] || '',
      _modelPricing: modelPricing
    }

    return { success: true, data: result }
  }

  /**
   * Fetch available models from SkillsFan website API
   */
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
    return data.data || []
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let providerInstance: SkillsFanCreditsProvider | null = null

export function getSkillsFanCreditsProvider(): SkillsFanCreditsProvider {
  if (!providerInstance) {
    providerInstance = new SkillsFanCreditsProvider()
  }
  return providerInstance
}

export { SkillsFanCreditsProvider }
