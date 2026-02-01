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
import { loadAuthProvidersAsync, isOAuthProvider as isOAuthProviderCheck, type LoadedProvider } from './auth-loader'
import { encryptString, decryptString, decryptTokens } from '../secure-storage.service'

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

    // Debug logging
    console.log('[AISourceManager] getBackendConfig called')
    console.log('[AISourceManager] current source:', aiSources.current)
    console.log('[AISourceManager] aiSources keys:', Object.keys(aiSources))

    const provider = this.providers.get(aiSources.current)

    if (!provider) {
      console.log(`[AISourceManager] No registered provider for source: ${aiSources.current}`)
      console.log('[AISourceManager] Available providers:', Array.from(this.providers.keys()))

      // Check if current source is a dynamic custom API provider (e.g., 'zhipu', 'kimi', 'deepseek')
      // These have 'apiKey' field but are not registered as providers
      const currentConfig = (aiSources as Record<string, any>)[aiSources.current]
      if (currentConfig && typeof currentConfig === 'object' && 'apiKey' in currentConfig && currentConfig.apiKey) {
        console.log('[AISourceManager] Found dynamic custom API config for:', aiSources.current)
        return this.getDynamicCustomBackendConfig(currentConfig)
      }

      console.warn(`[AISourceManager] No config found for source: ${aiSources.current}`)
      return null
    }

    console.log('[AISourceManager] Found provider:', provider.type)

    if (!provider.isConfigured(aiSources)) {
      console.warn(`[AISourceManager] Provider ${aiSources.current} is not configured`)
      return null
    }

    console.log('[AISourceManager] Provider is configured, calling getBackendConfig')
    const result = provider.getBackendConfig(aiSources)
    console.log('[AISourceManager] getBackendConfig result:', result ? { url: result.url, model: result.model, hasKey: !!result.key } : null)

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

    // Generic OAuth config structure (with encrypted tokens)
    const oauthConfig: OAuthSourceConfig = {
      loggedIn: true,
      user: {
        name: loginResult.user?.name || '',
        uid: tokenData?.uid || ''  // Store uid for API headers (ASCII-safe)
      },
      model: defaultModel,
      availableModels,
      modelNames,  // Store model display names mapping
      // Encrypt tokens before storing
      accessToken: encryptString(tokenData?.accessToken || ''),
      refreshToken: encryptString(tokenData?.refreshToken || ''),
      tokenExpires: tokenData?.expiresAt
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
          providerConfig.accessToken = encryptString(refreshResult.data.accessToken)
          providerConfig.refreshToken = encryptString(refreshResult.data.refreshToken)
          providerConfig.tokenExpires = refreshResult.data.expiresAt

          saveConfig({ aiSources: freshAiSources } as any)
          console.log('[AISourceManager] Token refreshed and saved (encrypted)')
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
      saveConfig({ aiSources } as any)
    }

    return result
  }

  // ========== Helper Methods ==========

  private isOAuthProvider(provider: AISourceProvider): provider is OAuthAISourceProvider {
    return 'startLogin' in provider && 'completeLogin' in provider
  }

  /**
   * Get AISourcesConfig with decrypted tokens and API keys
   * Use this when passing config to providers that need to read tokens
   */
  private getDecryptedAiSources(): AISourcesConfig {
    const config = getConfig() as any
    const aiSources: AISourcesConfig = config.aiSources || { current: 'custom' }

    // Decrypt tokens for each OAuth provider
    const decrypted: AISourcesConfig = { ...aiSources }
    for (const key of Object.keys(decrypted)) {
      if (key === 'current') continue
      const providerConfig = decrypted[key]
      if (providerConfig && typeof providerConfig === 'object') {
        if (key === 'custom' && 'apiKey' in providerConfig) {
          // Decrypt custom API key
          decrypted.custom = {
            ...providerConfig,
            apiKey: decryptString((providerConfig as any).apiKey || '')
          } as any
        } else if ('accessToken' in providerConfig) {
          // Decrypt OAuth tokens
          decrypted[key] = decryptTokens(providerConfig as any)
        }
      }
    }

    return decrypted
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
