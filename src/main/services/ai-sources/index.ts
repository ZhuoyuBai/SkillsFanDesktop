/**
 * AI Sources Module
 *
 * Unified entry point for AI source management.
 * Import from this module for clean access to all AI source functionality.
 */

// Manager
export { getAISourceManager, AISourceManager } from './manager'

// Auth Loader (for dynamic provider loading)
export {
  loadProductConfig,
  loadAuthProviders,
  getEnabledAuthProviderConfigs,
  isProviderAvailable,
  getProviderByType,
  isOAuthProvider,
  type AuthProviderConfig,
  type ProductConfig,
  type LoadedProvider
} from './auth-loader'

// Built-in Providers
export { getCustomProvider, CustomAISourceProvider } from './providers/custom.provider'
export { getGitHubCopilotProvider, GitHubCopilotProvider } from './providers/github-copilot.provider'

// SkillsFan Proxy Providers (GLM, MiniMax, SkillsFan Credits, etc.)
export { createSkillsFanProxyProvider, type SkillsFanProxyConfig } from './providers/skillsfan-proxy-provider'
export { SKILLSFAN_PROXY_CONFIGS, createAllSkillsFanProviders, getOAuthToCustomFallbackMap } from './providers/skillsfan-providers'
