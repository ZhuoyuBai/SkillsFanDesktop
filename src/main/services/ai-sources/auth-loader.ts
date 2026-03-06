/**
 * Auth Provider Loader
 *
 * Dynamically loads authentication providers based on product.json configuration.
 *
 * Design Principles:
 * - Configuration-driven provider loading
 * - Graceful fallback when providers are unavailable
 * - Type-safe provider interface enforcement
 */

import { join, dirname } from 'path'
import { pathToFileURL } from 'url'
import { existsSync, readFileSync } from 'fs'
import { app } from 'electron'
import type { AISourceProvider, OAuthAISourceProvider } from '../../../shared/interfaces'
import type { AISourceType } from '../../../shared/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Localized text - either a simple string or object with language codes
 */
export type LocalizedText = string | Record<string, string>

/**
 * Provider configuration from product.json
 */
export interface AuthProviderConfig {
  /** Provider type identifier (e.g., 'oauth', 'custom') */
  type: AISourceType
  /** Display name for UI (supports i18n: string or { "en": "...", "zh-CN": "..." }) */
  displayName: LocalizedText
  /** Description text for UI (supports i18n: string or { "en": "...", "zh-CN": "..." }) */
  description: LocalizedText
  /** Lucide icon name */
  icon: string
  /** Icon background color (hex color) */
  iconBgColor: string
  /** Whether this is the recommended option */
  recommended: boolean
  /** Path to provider module (relative to product.json) */
  path?: string
  /** Whether this is a built-in provider */
  builtin?: boolean
  /** Whether this provider is enabled */
  enabled: boolean
}

/**
 * Product configuration from product.json
 */
export interface ProductConfig {
  name: string
  version: string
  authProviders: AuthProviderConfig[]
}

/**
 * Loaded provider with its configuration
 */
export interface LoadedProvider {
  config: AuthProviderConfig
  provider: AISourceProvider | null
  loadError?: string
}

// ============================================================================
// Product Configuration Loading
// ============================================================================

let productConfig: ProductConfig | null = null
let productConfigPath: string | null = null

/**
 * Get the path to product.json
 */
function getProductConfigPath(): string {
  if (productConfigPath) return productConfigPath

  // In development, product.json is in project root
  // In production, it's inside app.asar
  const isDev = !app.isPackaged

  if (isDev) {
    // Development: project root (app.getAppPath() returns project root in dev)
    productConfigPath = join(app.getAppPath(), 'product.json')
  } else {
    // Production: inside app.asar (app.getAppPath() returns app.asar path)
    // Electron automatically handles app.asar paths
    productConfigPath = join(app.getAppPath(), 'product.json')
  }

  return productConfigPath
}

/**
 * Load product.json configuration
 */
export function loadProductConfig(): ProductConfig {
  if (productConfig) return productConfig

  const configPath = getProductConfigPath()

  try {
    if (existsSync(configPath)) {
      // Use readFileSync + JSON.parse (works reliably in both CJS and ESM)
      const content = readFileSync(configPath, 'utf-8')
      productConfig = JSON.parse(content) as ProductConfig
      console.log('[AuthLoader] Loaded product.json from:', configPath)
      console.log('[AuthLoader] Auth providers configured:', productConfig.authProviders.map(p => p.type).join(', '))
    } else {
      console.log('[AuthLoader] product.json not found, using defaults')
      productConfig = getDefaultProductConfig()
    }
  } catch (error) {
    console.error('[AuthLoader] Failed to load product.json:', error)
    productConfig = getDefaultProductConfig()
  }

  return productConfig
}

/**
 * Get default product configuration (open-source version)
 */
function getDefaultProductConfig(): ProductConfig {
  return {
    name: 'Halo',
    version: '1.0.0',
    authProviders: [
      {
        type: 'openai-codex',
        displayName: { en: 'OpenAI (ChatGPT)', 'zh-CN': 'OpenAI (ChatGPT)', 'zh-TW': 'OpenAI (ChatGPT)' },
        description: { en: 'Use your ChatGPT Plus/Pro subscription', 'zh-CN': '使用您的 ChatGPT Plus/Pro 订阅', 'zh-TW': '使用您的 ChatGPT Plus/Pro 訂閱' },
        icon: 'sparkles',
        iconBgColor: '#10a37f',
        recommended: false,
        builtin: true,
        enabled: true
      },
      {
        type: 'custom',
        displayName: { en: 'Custom API', 'zh-CN': '自定义 API', 'zh-TW': '自訂 API' },
        description: { en: 'Claude / OpenAI compatible', 'zh-CN': '兼容 Claude / OpenAI', 'zh-TW': '相容 Claude / OpenAI' },
        icon: 'key',
        iconBgColor: '#da7756',
        recommended: true,
        builtin: true,
        enabled: true
      }
    ]
  }
}

// ============================================================================
// Provider Loading
// ============================================================================

/**
 * Resolve the absolute path to a provider module
 */
function resolveProviderPath(providerConfig: AuthProviderConfig): string | null {
  if (!providerConfig.path) return null

  const configPath = getProductConfigPath()
  const configDir = dirname(configPath)

  // Remove leading ./ from path if present
  const cleanPath = providerConfig.path.startsWith('./')
    ? providerConfig.path.slice(2)
    : providerConfig.path

  // Resolve path relative to product.json
  return join(configDir, cleanPath)
}

/**
 * Load a provider module dynamically using ESM import()
 */
async function loadProviderModuleAsync(providerPath: string): Promise<AISourceProvider | null> {
  try {
    // Check if the provider directory exists
    if (!existsSync(providerPath)) {
      console.log(`[AuthLoader] Provider path does not exist: ${providerPath}`)
      return null
    }

    // Use file URL to ensure Windows paths import correctly
    const importUrl = pathToFileURL(providerPath).href
    console.log(`[AuthLoader] Attempting to load provider from: ${importUrl}`)

    // Use dynamic import for ESM compatibility
    const providerModule = await import(importUrl)

    // Look for a getter function (e.g., getGoogleProvider)
    const getterNames = Object.keys(providerModule).filter(key =>
      key.startsWith('get') && key.endsWith('Provider') && typeof providerModule[key] === 'function'
    )

    if (getterNames.length > 0) {
      const provider = providerModule[getterNames[0]]()
      console.log(`[AuthLoader] Loaded provider from ${providerPath} using ${getterNames[0]}`)
      return provider
    }

    // Fallback: look for a class export
    const classNames = Object.keys(providerModule).filter(key =>
      key.endsWith('Provider') && typeof providerModule[key] === 'function'
    )

    if (classNames.length > 0) {
      const ProviderClass = providerModule[classNames[0]]
      const provider = new ProviderClass()
      console.log(`[AuthLoader] Loaded provider from ${providerPath} using class ${classNames[0]}`)
      return provider
    }

    console.warn(`[AuthLoader] No provider found in module: ${providerPath}`)
    return null
  } catch (error) {
    console.error(`[AuthLoader] Failed to load provider from ${providerPath}:`, error)
    return null
  }
}

/**
 * Load all enabled providers based on product.json configuration
 * This is the core configuration-driven loading mechanism
 */
export async function loadAuthProvidersAsync(): Promise<LoadedProvider[]> {
  const config = loadProductConfig()
  const loadedProviders: LoadedProvider[] = []

  for (const providerConfig of config.authProviders) {
    if (!providerConfig.enabled) {
      console.log(`[AuthLoader] Skipping disabled provider: ${providerConfig.type}`)
      continue
    }

    const loaded: LoadedProvider = {
      config: providerConfig,
      provider: null
    }

    if (providerConfig.builtin) {
      // Built-in provider (loaded separately by manager)
      console.log(`[AuthLoader] Built-in provider: ${providerConfig.type}`)
      loaded.provider = null // Will be loaded by manager
    } else if (providerConfig.path) {
      // External provider - load from path using dynamic import
      const providerPath = resolveProviderPath(providerConfig)
      if (providerPath) {
        loaded.provider = await loadProviderModuleAsync(providerPath)
        if (!loaded.provider) {
          loaded.loadError = `Failed to load from ${providerPath}`
        }
      }
    }

    loadedProviders.push(loaded)
  }

  return loadedProviders
}

/**
 * Synchronous version for backward compatibility (returns configs only)
 * @deprecated Use loadAuthProvidersAsync for full provider loading
 */
export function loadAuthProviders(): LoadedProvider[] {
  const config = loadProductConfig()
  return config.authProviders
    .filter(p => p.enabled)
    .map(providerConfig => ({
      config: providerConfig,
      provider: null,
      loadError: providerConfig.builtin ? undefined : 'Use loadAuthProvidersAsync for dynamic loading'
    }))
}

/**
 * Get enabled auth provider configurations for UI
 * This returns only the configs, not the loaded providers
 */
export function getEnabledAuthProviderConfigs(): AuthProviderConfig[] {
  const config = loadProductConfig()
  return config.authProviders.filter(p => p.enabled)
}

/**
 * Check if a specific provider type is available
 */
export function isProviderAvailable(type: AISourceType): boolean {
  const providers = loadAuthProviders()
  const provider = providers.find(p => p.config.type === type)
  return provider !== undefined && (provider.config.builtin || provider.provider !== null)
}

/**
 * Get a specific provider by type
 */
export function getProviderByType(type: AISourceType): LoadedProvider | null {
  const providers = loadAuthProviders()
  return providers.find(p => p.config.type === type) || null
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a provider supports OAuth
 */
export function isOAuthProvider(provider: AISourceProvider): provider is OAuthAISourceProvider {
  return 'startLogin' in provider && 'completeLogin' in provider
}
