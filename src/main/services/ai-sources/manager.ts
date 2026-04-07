/**
 * AI Source Manager
 *
 * Central manager for all AI source providers.
 * Responsible for:
 * - Provider registration and lifecycle
 * - Configuration management
 * - Backend config generation for OpenAI compat router
 * - OAuth flow coordination
 *
 * Design Principles:
 * - Single point of access for all AI source operations
 * - Decoupled from specific provider implementations
 * - Dynamic provider loading via auth-loader
 * - Thread-safe singleton pattern
 */

import type {
  AISourceProvider,
  OAuthAISourceProvider,
  ProviderResult
} from '../../../shared/interfaces'
import type {
  AISourceType,
  AISourcesConfig,
  BackendRequestConfig,
  OAuthSourceConfig,
  OAuthStartResult,
  OAuthCompleteResult
} from '../../../shared/types'
import { getConfig, saveConfig } from '../config.service'
import { getCustomProvider } from './providers/custom.provider'
import { getGitHubCopilotProvider } from './providers/github-copilot.provider'
import { getOpenAICodexProvider } from './providers/openai-codex.provider'
import { loadAuthProvidersAsync, isOAuthProvider as isOAuthProviderCheck, type LoadedProvider } from './auth-loader'
import { decryptString, decryptTokens } from '../secure-storage.service'

/**
 * Extended OAuth provider interface for token management
 */
interface OAuthProviderWithTokenManagement extends OAuthAISourceProvider {
  checkTokenWithConfig?(config: AISourcesConfig): { valid: boolean; expiresIn?: number; needsRefresh: boolean }
  refreshTokenWithConfig?(config: AISourcesConfig): Promise<ProviderResult<{
    accessToken: string
    refreshToken: string
    expiresAt: number
  }>>
}

/**
 * AISourceManager - Singleton manager for AI sources
 */
class AISourceManager {
  private providers: Map<AISourceType, AISourceProvider> = new Map()
  private initialized = false
  private initPromise: Promise<void> | null = null

  constructor() {
    // Register built-in providers immediately
    this.registerProvider(getCustomProvider())
    this.registerProvider(getGitHubCopilotProvider())
    this.registerProvider(getOpenAICodexProvider())

    // Start async initialization (optional providers + dynamic loading)
    this.initPromise = this.initializeAsync()
  }

  /**
   * Async initialization - loads providers from product.json configuration
   * This is the core configuration-driven loading mechanism
   */
  private async initializeAsync(): Promise<void> {
    // Load all providers based on product.json configuration
    const loadedProviders = await loadAuthProvidersAsync()

    for (const loaded of loadedProviders) {
      if (loaded.config.builtin) {
        // Built-in providers are already registered in constructor
        continue
      }

      if (loaded.provider) {
        this.registerProvider(loaded.provider)
      } else if (loaded.loadError) {
        console.warn(`[AISourceManager] Provider ${loaded.config.type} not loaded: ${loaded.loadError}`)
      }
    }

    this.initialized = true
    console.log('[AISourceManager] Initialization complete, providers:', Array.from(this.providers.keys()).join(', '))
  }

  /**
   * Ensure manager is fully initialized before operations
   */
  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  /**
   * Register a new provider
   */
  registerProvider(provider: AISourceProvider): void {
    this.providers.set(provider.type, provider)
    console.log(`[AISourceManager] Registered provider: ${provider.type}`)
  }

  /**
   * Get a specific provider
   */
  getProvider(type: AISourceType): AISourceProvider | undefined {
    return this.providers.get(type)
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): AISourceProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get the current active provider based on config
   */
  getCurrentProvider(): AISourceProvider | null {
    const config = getConfig() as any
    const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }
    return this.providers.get(aiSources.current) || null
  }

  /**
   * Get backend request configuration for the current source
   * This is the main method used by agent.service.ts
   */
  getBackendConfig(): BackendRequestConfig | null {
    // Use decrypted config for providers to read tokens
    const aiSources = this.getDecryptedAiSources()

    const provider = this.providers.get(aiSources.current)

    if (!provider) {
      // Check if current source is a dynamic custom API provider (e.g., 'zhipu', 'kimi', 'deepseek')
      // These have 'apiKey' field but are not registered as providers
      const currentConfig = (aiSources as Record<string, any>)[aiSources.current]
      if (currentConfig && typeof currentConfig === 'object' && 'apiKey' in currentConfig && currentConfig.apiKey) {
        return this.getDynamicCustomBackendConfig(currentConfig)
      }

      console.warn(`[AISourceManager] No config found for source: ${aiSources.current}`)
      return null
    }

    if (!provider.isConfigured(aiSources)) {
      console.warn(`[AISourceManager] Provider ${aiSources.current} is not configured`)
      // Fallback: if OAuth provider is not configured (not logged in),
      // check for a matching custom API provider with an API key
      return this.tryCustomApiFallback(aiSources)
    }

    const result = provider.getBackendConfig(aiSources)

    if (!result) {
      // Provider is configured but returned null (e.g., expired token)
      // Try custom API fallback
      return this.tryCustomApiFallback(aiSources)
    }

    return result
  }

  /**
   * Get backend config for dynamic custom API providers (zhipu, kimi, deepseek, etc.)
   * These are stored by provider ID but use the same format as CustomSourceConfig
   */
  private getDynamicCustomBackendConfig(config: Record<string, any>): BackendRequestConfig | null {
    if (!config.apiKey) return null

    const isAnthropic = config.provider === 'anthropic'
    const baseUrl = (config.apiUrl || 'https://api.anthropic.com').replace(/\/$/, '')

    return {
      url: baseUrl,
      key: config.apiKey,
      model: config.model,
      apiType: isAnthropic ? undefined : (baseUrl.includes('/responses') ? 'responses' : 'chat_completions')
    }
  }

  /**
   * Try falling back to a custom API provider when an OAuth provider fails.
   */
  private tryCustomApiFallback(_aiSources: AISourcesConfig): BackendRequestConfig | null {
    return null
  }

  /**
   * Check if any AI source is configured
   */
  hasAnySource(): boolean {
    const config = getConfig() as any
    const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }

    for (const provider of this.providers.values()) {
      if (provider.isConfigured(aiSources)) {
        return true
      }
    }
    return false
  }

  /**
   * Check if a specific source is configured
   */
  isSourceConfigured(type: AISourceType): boolean {
    const config = getConfig() as any
    const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }
    const provider = this.providers.get(type)

    return provider ? provider.isConfigured(aiSources) : false
  }

  // ========== OAuth Methods ==========

  /**
   * Start OAuth login for a source
   */
  async startOAuthLogin(type: AISourceType): Promise<ProviderResult<OAuthStartResult>> {
    // Ensure async initialization is complete
    await this.ensureInitialized()

    const provider = this.providers.get(type)
    if (!provider) {
      return { success: false, error: `Unknown source type: ${type}` }
    }

    if (!this.isOAuthProvider(provider)) {
      return { success: false, error: `Source ${type} does not support OAuth` }
    }

    return provider.startLogin()
  }

  /**
   * Complete OAuth login for a source
   */
  async completeOAuthLogin(
    type: AISourceType,
    state: string
  ): Promise<ProviderResult<OAuthCompleteResult>> {
    await this.ensureInitialized()
    const provider = this.providers.get(type)
    if (!provider) {
      return { success: false, error: `Unknown source type: ${type}` }
    }

    if (!this.isOAuthProvider(provider)) {
      return { success: false, error: `Source ${type} does not support OAuth` }
    }

    const result = await provider.completeLogin(state)

    if (result.success && result.data) {
      // Update config with login result
      await this.handleOAuthLoginSuccess(type, result.data)

      // Refresh sibling providers that share the same auth
      // e.g., GLM and SkillsFan Credits share SkillsFan OAuth
      await this.refreshSiblingProviders(type)
    }

    return result
  }

  /**
   * Handle successful OAuth login
   */
  private async handleOAuthLoginSuccess(
    type: AISourceType,
    loginResult: OAuthCompleteResult
  ): Promise<void> {
    const config = getConfig() as any
    const aiSources: AISourcesConfig = config.aiSources || { current: 'custom', custom: config.aiSources?.custom }

    // Extract token data from login result
    const data = loginResult as any
    const tokenData = data._tokenData
    const availableModels = data._availableModels || []
    const modelNames = data._modelNames || {}
    const defaultModel = data._defaultModel || ''

    // Generic OAuth config structure
    const oauthConfig: Record<string, unknown> = {
      loggedIn: true,
      user: {
        name: loginResult.user?.name || '',
        uid: tokenData?.uid || ''  // Store uid for API headers (ASCII-safe)
      },
      model: defaultModel,
      availableModels,
      modelNames,  // Store model display names mapping
      accessToken: tokenData?.accessToken || '',
      refreshToken: tokenData?.refreshToken || '',
      tokenExpires: tokenData?.expiresAt
    }

    // Store provider-specific extra data (e.g., modelPricing from SkillsFan)
    if (data._modelPricing) {
      oauthConfig.modelPricing = data._modelPricing
    }

    // Store ChatGPT account ID (for OpenAI ChatGPT backend-api auth)
    if (data._chatgptAccountId) {
      oauthConfig.chatgptAccountId = data._chatgptAccountId
    }

    // Store as the active OAuth source
    aiSources.current = type
    aiSources[type] = oauthConfig

    saveConfig({
      aiSources,
      isFirstLaunch: false
    } as any)

    console.log(`[AISourceManager] OAuth login for ${type} saved to config`)
  }

  /**
   * After login, refresh other providers that share the same auth.
   * e.g., GLM and SkillsFan Credits share SkillsFan OAuth tokens.
   */
  private async refreshSiblingProviders(loginType: AISourceType): Promise<void> {
    const freshConfig = getConfig() as any
    const aiSources: AISourcesConfig = freshConfig.aiSources || { current: loginType }
    let updated = false

    for (const provider of this.providers.values()) {
      if (provider.type === loginType) continue
      if (!provider.refreshConfig) continue
      if (!provider.isConfigured(aiSources)) continue

      try {
        const result = await provider.refreshConfig(aiSources)
        if (result.success && result.data) {
          Object.assign(aiSources, result.data)
          updated = true
          console.log(`[AISourceManager] Sibling provider ${provider.type} config refreshed`)
        }
      } catch (error) {
        console.warn(`[AISourceManager] Failed to refresh sibling ${provider.type}:`, error)
      }
    }

    if (updated) {
      this.preserveUserSelections(aiSources)
      saveConfig({ aiSources } as any)
    }
  }

  /**
   * Logout from a source
   */
  async logout(type: AISourceType): Promise<ProviderResult<void>> {
    const provider = this.providers.get(type)
    if (!provider) {
      return { success: false, error: `Unknown source type: ${type}` }
    }

    if (this.isOAuthProvider(provider)) {
      await provider.logout()
    }

    // Update config - remove the OAuth source
    const config = getConfig() as any
    const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }

    const wasCurrent = aiSources.current === type

    // Delete the provider's config
    delete aiSources[type]

    if (wasCurrent) {
      // Switch to custom if available, otherwise pick another logged-in provider
      if (aiSources.custom?.apiKey) {
        aiSources.current = 'custom'
      } else {
        const fallback = Object.keys(aiSources).find(key => {
          if (key === 'current' || key === 'custom') return false
          const source = aiSources[key] as OAuthSourceConfig | undefined
          return source?.loggedIn === true
        })
        aiSources.current = (fallback as AISourceType) || 'custom'
      }
    }

    saveConfig({ aiSources } as any)
    console.log(`[AISourceManager] Logout complete for ${type}`)

    return { success: true }
  }

  // ========== Token Management ==========

  /**
   * Check and refresh token if needed (for OAuth sources)
   */
  async ensureValidToken(type: AISourceType): Promise<ProviderResult<void>> {
    const provider = this.providers.get(type) as OAuthProviderWithTokenManagement | undefined
    if (!provider) {
      return { success: false, error: 'Provider not found' }
    }

    // Check if provider supports token management
    if (!provider.checkTokenWithConfig || !provider.refreshTokenWithConfig) {
      // Provider doesn't need token management
      return { success: true }
    }

    // Use decrypted config for token operations
    const aiSources = this.getDecryptedAiSources()

    const tokenStatus = provider.checkTokenWithConfig(aiSources)

    if (!tokenStatus.valid) {
      return { success: false, error: 'Token expired' }
    }

    if (tokenStatus.needsRefresh) {
      console.log(`[AISourceManager] Token for ${type} needs refresh, refreshing...`)
      const refreshResult = await provider.refreshTokenWithConfig(aiSources)

      if (refreshResult.success && refreshResult.data) {
        // Get fresh config from disk (with encrypted tokens) and update only the refreshed provider
        const freshConfig = getConfig() as any
        const freshAiSources: AISourcesConfig = freshConfig.aiSources || { current: 'custom' }
        const providerConfig = freshAiSources[type] as any
        if (providerConfig) {
          providerConfig.accessToken = refreshResult.data.accessToken
          providerConfig.refreshToken = refreshResult.data.refreshToken
          providerConfig.tokenExpires = refreshResult.data.expiresAt
          // Update chatgptAccountId if provided (OpenAI Codex)
          if ((refreshResult.data as any).chatgptAccountId !== undefined) {
            providerConfig.chatgptAccountId = (refreshResult.data as any).chatgptAccountId
          }

          saveConfig({ aiSources: freshAiSources } as any)
          console.log('[AISourceManager] Token refreshed and saved')
        }
      } else {
        console.error(`[AISourceManager] Token refresh failed for ${type}:`, refreshResult.error)
        return refreshResult
      }
    }

    return { success: true }
  }

  // ========== Configuration Refresh ==========

  /**
   * Refresh configuration for all sources
   */
  async refreshAllConfigs(): Promise<void> {
    await this.ensureInitialized()
    // Use decrypted config for provider calls
    const decryptedAiSources = this.getDecryptedAiSources()
    // Get fresh config from disk for saving (keeps tokens encrypted)
    const freshConfig = getConfig() as any
    const aiSources: AISourcesConfig = freshConfig.aiSources || { current: 'custom' }

    for (const provider of this.providers.values()) {
      if (provider.refreshConfig && provider.isConfigured(decryptedAiSources)) {
        try {
          const result = await provider.refreshConfig(decryptedAiSources)
          if (result.success && result.data) {
            // Merge non-token updates into fresh config
            // Provider refreshConfig returns model lists, not tokens
            Object.assign(aiSources, result.data)
          }
        } catch (error) {
          console.error(`[AISourceManager] Failed to refresh ${provider.type}:`, error)
        }
      }
    }

    // Preserve user selections (current source, model per provider) that may
    // have changed while providers were refreshing (race condition fix)
    this.preserveUserSelections(aiSources)

    // Save merged config (tokens remain encrypted)
    saveConfig({ aiSources } as any)
  }

  /**
   * Refresh configuration for a specific source
   */
  async refreshSourceConfig(type: AISourceType): Promise<ProviderResult<void>> {
    await this.ensureInitialized()
    const provider = this.providers.get(type)
    if (!provider?.refreshConfig) {
      return { success: true }
    }

    // Use decrypted config for provider call
    const decryptedAiSources = this.getDecryptedAiSources()

    if (!provider.isConfigured(decryptedAiSources)) {
      return { success: false, error: 'Source not configured' }
    }

    const result = await provider.refreshConfig(decryptedAiSources)

    if (result.success && result.data) {
      // Get fresh config from disk and merge updates
      const freshConfig = getConfig() as any
      const aiSources: AISourcesConfig = freshConfig.aiSources || { current: 'custom' }
      Object.assign(aiSources, result.data)
      this.preserveUserSelections(aiSources)
      saveConfig({ aiSources } as any)
    }

    return result
  }

  // ========== Helper Methods ==========

  private isOAuthProvider(provider: AISourceProvider): provider is OAuthAISourceProvider {
    return 'startLogin' in provider && 'completeLogin' in provider
  }

  /**
   * Get AISourcesConfig with all tokens/keys in plaintext.
   *
   * Detects legacy 'enc:' prefixed values from the old encryption scheme,
   * decrypts them via safeStorage (may trigger Keychain prompt on macOS),
   * and persists plaintext back to config.json so subsequent calls never
   * touch Keychain again.
   */
  private getDecryptedAiSources(): AISourcesConfig {
    const config = getConfig() as any
    const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }

    let needsMigration = false
    const result: AISourcesConfig = { ...aiSources }

    for (const key of Object.keys(result)) {
      if (key === 'current') continue
      const providerConfig = result[key]
      if (!providerConfig || typeof providerConfig !== 'object') continue

      // Case 1: API-key based configs (custom, anthropic, openai, zhipu, deepseek, etc.)
      if ('apiKey' in providerConfig) {
        const apiKey = (providerConfig as any).apiKey || ''
        if (typeof apiKey === 'string' && apiKey.startsWith('enc:')) {
          needsMigration = true
          ;(result as any)[key] = {
            ...providerConfig,
            apiKey: decryptString(apiKey)
          }
        }
        // Also decrypt apiKeys inside configs[] array
        const configs = (providerConfig as any).configs
        if (Array.isArray(configs)) {
          const decryptedConfigs = configs.map((cfg: any) => {
            if (typeof cfg.apiKey === 'string' && cfg.apiKey.startsWith('enc:')) {
              needsMigration = true
              return { ...cfg, apiKey: decryptString(cfg.apiKey) }
            }
            return cfg
          })
          const pc = (result as any)[key] || { ...providerConfig }
          ;(result as any)[key] = { ...pc, configs: decryptedConfigs }
        }
      }

      // Case 2: OAuth configs (accessToken / refreshToken)
      if ('accessToken' in providerConfig) {
        const pc = (result as any)[key] || providerConfig
        const atEncrypted = typeof pc.accessToken === 'string' && pc.accessToken.startsWith('enc:')
        const rtEncrypted = typeof pc.refreshToken === 'string' && pc.refreshToken.startsWith('enc:')
        if (atEncrypted || rtEncrypted) {
          needsMigration = true
          ;(result as any)[key] = {
            ...pc,
            ...(atEncrypted ? { accessToken: decryptString(pc.accessToken) } : {}),
            ...(rtEncrypted ? { refreshToken: decryptString(pc.refreshToken) } : {})
          }
        }
      }
    }

    // Lazy migration: persist plaintext so Keychain is never needed again
    if (needsMigration) {
      console.log('[AISourceManager] Migrated encrypted values to plaintext in config')
      saveConfig({ aiSources: result } as any)
    }

    return result
  }

  /**
   * Re-read latest config from disk and preserve user-mutable fields
   * (current source, model selection per provider) in the refreshed aiSources.
   * Prevents race conditions where user changes during async refresh get overwritten.
   */
  private preserveUserSelections(aiSources: AISourcesConfig): void {
    const latestConfig = getConfig() as any
    const latestAiSources = latestConfig.aiSources || {}

    aiSources.current = latestAiSources.current || aiSources.current

    for (const key of Object.keys(aiSources)) {
      if (key === 'current') continue
      const refreshed = aiSources[key]
      const latest = latestAiSources[key]
      if (
        refreshed && typeof refreshed === 'object' && 'model' in refreshed &&
        latest && typeof latest === 'object' && 'model' in latest
      ) {
        ;(refreshed as any).model = (latest as any).model
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let managerInstance: AISourceManager | null = null

export function getAISourceManager(): AISourceManager {
  if (!managerInstance) {
    managerInstance = new AISourceManager()
  }
  return managerInstance
}

// Export class for testing
export { AISourceManager }
