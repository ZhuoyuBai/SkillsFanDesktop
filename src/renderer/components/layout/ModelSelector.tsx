/**
 * ModelSelector - Dropdown for selecting AI model in header
 * Shows configured models with provider logos
 *
 * Design: Dynamic rendering based on config - no hardcoded provider names
 * OAuth providers are loaded from product.json configuration
 */

import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import {
  getCurrentModelName,
  isSourceConfigured,
  type HaloConfig,
  type AISourceType,
  type OAuthSourceConfig
} from '../../types'
import { useTranslation, getCurrentLanguage } from '../../i18n'
import { SKILLSFAN_PROVIDER_META } from '../../../shared/constants/providers'

// Import provider logos
import zhipuLogo from '../../assets/providers/zhipu.jpg'
import minimaxLogo from '../../assets/providers/minimax.jpg'
import kimiLogo from '../../assets/providers/kimi.jpg'
import deepseekLogo from '../../assets/providers/deepseek.jpg'
import claudeLogo from '../../assets/providers/claude.jpg'
import openaiLogo from '../../assets/providers/openai.jpg'
import skillsfanLogo from '../../assets/logo.png'

// Provider logo mapping by API URL
const PROVIDER_LOGOS: Record<string, string> = {
  'https://open.bigmodel.cn/api/anthropic': zhipuLogo,
  'https://api.minimaxi.com/anthropic': minimaxLogo,
  'https://api.moonshot.cn/anthropic': kimiLogo,
  'https://api.deepseek.com/anthropic': deepseekLogo,
  'https://api.anthropic.com': claudeLogo,
  'https://api.openai.com': openaiLogo,
}

// Provider logo mapping by provider ID (exported for reuse in Loop Task model selector)
export const PROVIDER_LOGOS_BY_ID: Record<string, string> = {
  'glm': zhipuLogo,
  'zhipu': zhipuLogo,
  'minimax': minimaxLogo,
  'minimax-oauth': minimaxLogo,
  'kimi': kimiLogo,
  'deepseek': deepseekLogo,
  'claude': claudeLogo,
  'openai': openaiLogo,
  'skillsfan-credits': skillsfanLogo,
}

// Mapping from backend owned_by values to client provider types (derived from shared config)
const OWNED_BY_TO_PROVIDER: Record<string, string> = Object.fromEntries(
  Object.entries(SKILLSFAN_PROVIDER_META)
    .flatMap(([key, v]) => (v.ownedBy || []).map(ob => [ob, key]))
)

// Provider display names by ID (exported for reuse)
// Merge SkillsFan provider names with other static names
export const PROVIDER_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(SKILLSFAN_PROVIDER_META).map(([k, v]) => [k, v.displayName])
  ),
  'zhipu': 'Zhipu GLM',
  'minimax': 'MiniMax',
  'kimi': 'Kimi',
  'deepseek': 'DeepSeek',
  'claude': 'Claude',
  'openai': 'OpenAI',
  'custom': 'Custom',
}

// Default model by provider when config has no explicit model yet (derived from shared config)
const PROVIDER_DEFAULT_MODELS: Record<string, string> = Object.fromEntries(
  Object.entries(SKILLSFAN_PROVIDER_META)
    .filter(([, v]) => v.defaultModel)
    .map(([k, v]) => [k, v.defaultModel])
)

/**
 * Get provider logo by API URL
 */
function getProviderLogo(apiUrl: string): string | null {
  const normalizedUrl = apiUrl.replace(/\/$/, '')
  return PROVIDER_LOGOS[normalizedUrl] || null
}

/**
 * Get provider logo by provider ID (exported for reuse)
 */
export function getProviderLogoById(providerId: string): string | null {
  return PROVIDER_LOGOS_BY_ID[providerId] || null
}

/**
 * Get logo for a specific model by matching model ID or display name to a provider (exported for reuse)
 */
export function getModelLogo(modelId: string, displayName: string, fallbackProviderType?: string): string | null {
  const key = `${modelId} ${displayName}`.toLowerCase()
  if (key.includes('glm') || key.includes('zhipu')) return zhipuLogo
  if (key.includes('minimax')) return minimaxLogo
  if (key.includes('kimi') || key.includes('moonshot')) return kimiLogo
  if (key.includes('deepseek')) return deepseekLogo
  if (key.includes('claude')) return claudeLogo
  if (key.includes('gpt') || key.includes('openai')) return openaiLogo
  return fallbackProviderType ? getProviderLogoById(fallbackProviderType) : null
}

/**
 * Localized text - either a simple string or object with language codes
 */
type LocalizedText = string | Record<string, string>

// Provider config from authGetProviders
interface AuthProviderConfig {
  type: string
  displayName: LocalizedText
  enabled: boolean
  recommended?: boolean
}

/**
 * Get localized text based on current language
 */
function getLocalizedText(value: LocalizedText): string {
  if (typeof value === 'string') {
    return value
  }
  const lang = getCurrentLanguage()
  return value[lang] || value['en'] || Object.values(value)[0] || ''
}

const SectionHeader = ({ label }: { label: string }) => (
  <div className="px-3 pt-2.5 pb-1 text-left text-xs font-medium text-muted-foreground/70 select-none">
    {label}
  </div>
)

interface ModelSelectorProps {
  variant?: 'header' | 'compact'
  iconOnly?: boolean  // Show only icon without text (for narrow windows)
  disabled?: boolean  // Disable interaction during generation
  onDisabledClick?: () => void  // Callback when clicked while disabled
  popoverUp?: boolean  // true = dropdown opens upward
}

export function ModelSelector({ variant = 'header', iconOnly = false, disabled = false, onDisabledClick, popoverUp = false }: ModelSelectorProps = {}) {
  const { t } = useTranslation()
  const { config, setConfig, setView, publicModels, authProviders: storeAuthProviders, setPublicModels, skillsfanLoggedIn } = useAppStore()
  const authProviders = storeAuthProviders as AuthProviderConfig[]
  const [isOpen, setIsOpen] = useState(false)
  const [isDropdownScrolling, setIsDropdownScrolling] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const lastRefreshRef = useRef<number>(0)
  const scrollHideTimeoutRef = useRef<number | null>(null)

  // Refresh model list when dropdown opens (throttled: once per 60s)
  useEffect(() => {
    if (!isOpen) {
      setIsDropdownScrolling(false)
      if (scrollHideTimeoutRef.current !== null) {
        window.clearTimeout(scrollHideTimeoutRef.current)
        scrollHideTimeoutRef.current = null
      }
      return
    }

    const now = Date.now()
    if (now - lastRefreshRef.current < 60_000) return
    lastRefreshRef.current = now

    api.refreshAISourcesConfig().then((result) => {
      if (result.success) {
        api.getConfig().then((configResult) => {
          if (configResult.success && configResult.data) {
            setConfig(configResult.data as HaloConfig)
          }
        })
      }
    })
    // Refresh public models → update store
    api.getPublicModels().then((result) => {
      if (result.success && result.data) {
        setPublicModels(result.data as Array<{ id: string; name: string; owned_by: string }>)
      }
    })
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (scrollHideTimeoutRef.current !== null) {
        window.clearTimeout(scrollHideTimeoutRef.current)
      }
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use setTimeout to avoid the click event that opened the dropdown
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  if (!config) return null

  const aiSources = config.aiSources || { current: 'custom' as AISourceType }
  const currentSource = aiSources.current

  // Get all configured custom API providers (zhipu, kimi, deepseek, etc.)
  // These are stored as aiSources[providerId] with apiKey field
  // Exclude 'custom' key - it's legacy and should not be shown as a separate option
  const configuredCustomProviders = Object.keys(aiSources)
    .filter(key => {
      if (key === 'current' || key === 'oauth' || key === 'custom') return false
      const source = (aiSources as Record<string, any>)[key]
      // Check if it's a custom API config (has apiKey but not loggedIn)
      return source && typeof source === 'object' && 'apiKey' in source && source.apiKey && !('loggedIn' in source)
    })
    .map(key => {
      const source = (aiSources as Record<string, any>)[key]
      return {
        id: key,
        name: PROVIDER_NAMES[key] || key,
        logo: getProviderLogoById(key),
        model: source.model || '',
        apiUrl: source.apiUrl || '',
        config: source
      }
    })

  // Get all OAuth providers - only show when SkillsFan account is logged in
  const allOAuthProviders = skillsfanLoggedIn
    ? authProviders
        .filter(p => p.type !== 'custom' && p.enabled)
        .map(p => {
          const providerConfig = (aiSources as Record<string, any>)[p.type] as OAuthSourceConfig | undefined
          return {
            type: p.type,
            displayName: getLocalizedText(p.displayName),
            config: providerConfig,
            isLoggedIn: providerConfig?.loggedIn === true || skillsfanLoggedIn,
            recommended: p.recommended
          }
        })
    : []

  const hasBuiltInOptions = allOAuthProviders.length > 0
  const showSectionHeaders = hasBuiltInOptions && configuredCustomProviders.length > 0

  // Get current model display name
  // If logged out and current source is an OAuth provider (has 'loggedIn' field), treat as unconfigured
  const currentSourceObj = (aiSources as Record<string, any>)[currentSource]
  const isOAuthSource = currentSourceObj && typeof currentSourceObj === 'object' && 'loggedIn' in currentSourceObj
  const rawModelName = getCurrentModelName(config)
  const isCurrentConfigured = (isOAuthSource && !skillsfanLoggedIn)
    ? false
    : isSourceConfigured(aiSources, currentSource)
  let currentModelName = rawModelName
  if (!isCurrentConfigured || rawModelName === 'No model') {
    currentModelName = t('model.addModel')
  }

  // Handle model selection for any provider
  const handleSelectModel = async (source: AISourceType, modelId: string) => {
    const newAiSources = {
      ...aiSources,
      current: source
    }

    // Get current provider config
    const providerConfig = aiSources[source] as OAuthSourceConfig | undefined

    if (source === 'custom' && aiSources.custom) {
      newAiSources.custom = {
        ...aiSources.custom,
        model: modelId
      }
      // Also update legacy api field
      ;(config as any).api = {
        ...config.api,
        model: modelId
      }
    } else if (providerConfig) {
      // OAuth provider - update dynamically
      // Merge public model name if not already in modelNames
      const publicModel = publicModels.find(m => m.id === modelId)
      const mergedNames = { ...providerConfig.modelNames }
      if (publicModel && !mergedNames[modelId]) {
        mergedNames[modelId] = publicModel.name
      }
      newAiSources[source] = {
        ...providerConfig,
        model: modelId,
        modelNames: mergedNames
      }
    } else {
      // Provider not configured yet (not logged in) - create minimal config with model
      // Build modelNames from publicModels so getCurrentModelName() can resolve display name
      const names: Record<string, string> = {}
      for (const m of publicModels) {
        names[m.id] = m.name
      }
      newAiSources[source] = { model: modelId, modelNames: names } as any
    }

    const newConfig = {
      ...config,
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as HaloConfig)
    setIsOpen(false)
  }

  // Handle provider selection (for custom API providers like zhipu, kimi, etc.)
  const handleSelectProvider = async (providerId: string) => {
    const newAiSources = {
      ...aiSources,
      current: providerId
    }

    // Get provider config and update legacy api field for compatibility
    const providerConfig = (aiSources as Record<string, any>)[providerId]
    if (providerConfig) {
      ;(config as any).api = {
        provider: providerConfig.provider,
        apiKey: providerConfig.apiKey,
        apiUrl: providerConfig.apiUrl,
        model: providerConfig.model
      }
    }

    const newConfig = {
      ...config,
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as HaloConfig)
    setIsOpen(false)
  }

  // Handle add source - navigate to settings
  const handleAddSource = () => {
    setIsOpen(false)
    setView('settings')
  }

  const handleDropdownScroll = () => {
    setIsDropdownScrolling(true)
    if (scrollHideTimeoutRef.current !== null) {
      window.clearTimeout(scrollHideTimeoutRef.current)
    }
    scrollHideTimeoutRef.current = window.setTimeout(() => {
      setIsDropdownScrolling(false)
      scrollHideTimeoutRef.current = null
    }, 700)
  }

  // Handle selecting a not-logged-in OAuth provider - just switch, login prompted on send
  const handleSelectOAuthProvider = async (providerType: string, displayName: string) => {
    const newAiSources = {
      ...aiSources,
      current: providerType
    }

    const newConfig = {
      ...config,
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as HaloConfig)
    setIsOpen(false)
  }

  // Style configuration for different variants
  const styleConfig = {
    header: {
      button: "flex items-center gap-1.5 px-3 py-1.5 text-sm",
      dropdown: "absolute left-0 top-full mt-2",
      showChevron: true,
    },
    compact: {
      button: "h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs",
      dropdown: popoverUp ? "absolute left-0 bottom-full mb-1" : "absolute left-0 top-full mt-1",
      showChevron: false,
    }
  }

  const styles = styleConfig[variant]

  // Get current provider logo - always try model ID matching first
  const currentProviderConfig = configuredCustomProviders.find(p => p.id === currentSource)
  const currentSourceConfig = (aiSources as Record<string, any>)[currentSource]
  const currentModelId = currentSourceConfig?.model || ''
  const getPublicModelProviderType = (model: { owned_by: string }) => {
    // Public model list belongs to built-in providers.
    // Keep routing stable to built-in provider types to avoid silently
    // switching to similarly named custom API providers (e.g. glm-5 -> zhipu).
    const mappedProvider = OWNED_BY_TO_PROVIDER[model.owned_by]
    if (mappedProvider) return mappedProvider

    // Fallback: if backend returns provider type directly, use it.
    const oauthProvider = allOAuthProviders.find(p => p.type === model.owned_by)?.type
    if (oauthProvider) return oauthProvider

    // Last fallback for legacy/unknown providers.
    return 'skillsfan-credits'
  }
  const effectiveCurrentModelId = (() => {
    if (currentModelId) return currentModelId

    const currentProvider = allOAuthProviders.find(p => p.type === currentSource)
    const availableModels = currentProvider?.config?.availableModels || []
    if (availableModels.length > 0) return availableModels[0]

    const sourcePublicModels = publicModels.filter(m => getPublicModelProviderType(m) === currentSource)
    if (sourcePublicModels.length === 0) return ''

    const providerDefaultModel = PROVIDER_DEFAULT_MODELS[currentSource]
    if (providerDefaultModel) {
      const normalizedDefault = providerDefaultModel.toLowerCase()
      const defaultMatch = sourcePublicModels.find(m => m.id.toLowerCase() === normalizedDefault)
      if (defaultMatch) return defaultMatch.id
    }

    return sourcePublicModels[0].id
  })()
  const currentModelDisplayName = currentSourceConfig?.modelNames?.[currentModelId] || ''
  const currentProviderLogo = isCurrentConfigured
    ? (currentProviderConfig?.logo ||
       (currentProviderConfig?.apiUrl ? getProviderLogo(currentProviderConfig.apiUrl) : null) ||
       (currentModelId ? getModelLogo(currentModelId, currentModelDisplayName, currentSource) : null) ||
       getProviderLogoById(currentSource))
    : null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => {
          if (disabled) {
            onDisabledClick?.()
            return
          }
          setIsOpen(!isOpen)
        }}
        className={`
          ${styles.button}
          ${variant === 'header'
            ? 'text-foreground rounded-lg transition-colors hover:bg-secondary/80'
            : `transition-all duration-200 border ${isOpen
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'text-muted-foreground border-border/60 hover:bg-muted hover:border-border hover:text-foreground'
              }`
          }
        `.trim().replace(/\s+/g, ' ')}
      >
        {/* Provider Logo */}
        {currentProviderLogo ? (
          <img src={currentProviderLogo} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-muted-foreground">AI</span>
          </div>
        )}
        {!iconOnly && (
          <span className={variant === 'header' ? 'max-w-[140px] truncate' : ''}>
            {currentModelName}
          </span>
        )}
        {styles.showChevron && !iconOnly && (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown Menu - appears from bottom with animation */}
      {isOpen && (
        <div
          onScroll={handleDropdownScroll}
          className={`
            ${styles.dropdown}
            min-w-[11rem] max-w-[16rem] max-h-[20rem] overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-50 py-0
            model-selector-scrollbar ${isDropdownScrolling ? 'model-selector-scrollbar--visible' : ''}
            animate-in fade-in-0 slide-in-from-top-2 duration-200
          `.trim().replace(/\s+/g, ' ')}
        >
          {/* Public models from backend (shown for all users, no login required) */}
          {(() => {
            const seenModelIds = new Set<string>()

            // First: show models from logged-in providers (with full availableModels)
            const loggedInElements = allOAuthProviders
              .filter(p => p.isLoggedIn && p.config?.availableModels?.length)
              .map((provider) => (
                <div key={provider.type}>
                  {provider.config!.availableModels.map((modelId) => {
                    if (seenModelIds.has(modelId)) return null
                    seenModelIds.add(modelId)
                    const displayName = provider.config?.modelNames?.[modelId] || modelId
                    const isSelected = currentSource === provider.type && effectiveCurrentModelId === modelId
                    const modelLogo = getModelLogo(modelId, displayName, provider.type)
                    return (
                      <button
                        key={modelId}
                        onClick={() => handleSelectModel(provider.type, modelId)}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2.5 ${
                          isSelected
                            ? 'bg-primary/15 text-primary font-medium hover:bg-primary/20'
                            : 'text-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {modelLogo ? (
                          <img src={modelLogo} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-muted-foreground">AI</span>
                          </div>
                        )}
                        <span className="flex-1 truncate">{displayName}</span>
                        {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))

            // Then: show public models from backend (deduped against logged-in models)
            // Only show when SkillsFan account is logged in
            const publicElements = (skillsfanLoggedIn ? publicModels : [])
              .filter(m => !seenModelIds.has(m.id))
              .map((model) => {
                seenModelIds.add(model.id)
                // Find the best matching provider for this model
                const providerType = getPublicModelProviderType(model)
                const isSelected = currentSource === providerType && effectiveCurrentModelId === model.id
                const modelLogo = getModelLogo(model.id, model.name, providerType)
                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelectModel(providerType, model.id)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-primary/15 text-primary font-medium hover:bg-primary/20'
                        : 'text-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {modelLogo ? (
                      <img src={modelLogo} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-muted-foreground">AI</span>
                      </div>
                    )}
                    <span className="flex-1 truncate">{model.name}</span>
                    {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
                  </button>
                )
              })

            // If no models at all (backend empty + not logged in), fall back to provider names
            if (loggedInElements.length === 0 && publicElements.length === 0) {
              const providerElements = allOAuthProviders.map((provider) => {
                const providerLogo = getProviderLogoById(provider.type)
                const isSelected = currentSource === provider.type
                return (
                  <button
                    key={provider.type}
                    onClick={() => handleSelectOAuthProvider(provider.type, provider.displayName)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-primary/15 text-primary font-medium hover:bg-primary/20'
                        : 'text-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {providerLogo ? (
                      <img src={providerLogo} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-muted-foreground">AI</span>
                      </div>
                    )}
                    <span className="flex-1 truncate">{provider.displayName}</span>
                    {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
                  </button>
                )
              })

              return [
                ...(showSectionHeaders
                  ? [<SectionHeader key="built-in-models-header" label={t('Built-in Models')} />]
                  : []),
                ...providerElements
              ]
            }

            return [
              ...(showSectionHeaders
                ? [<SectionHeader key="built-in-models-header" label={t('Built-in Models')} />]
                : []),
              ...loggedInElements,
              ...publicElements
            ]
          })()}

          {/* Section header for custom API providers */}
          {showSectionHeaders && (
            <SectionHeader label={t('Custom Models')} />
          )}

          {/* Custom API Providers - shown after official */}
          {configuredCustomProviders.map((provider, index) => {
            const isSelected = currentSource === provider.id
            return (
              <button
                key={provider.id}
                onClick={() => handleSelectProvider(provider.id)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2.5 ${
                  isSelected
                    ? 'bg-primary/15 text-primary font-medium hover:bg-primary/20'
                    : 'text-foreground hover:bg-secondary/80'
                }`}
              >
                {provider.logo ? (
                  <img src={provider.logo} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-muted-foreground">AI</span>
                  </div>
                )}
                <span className="flex-1 truncate">{provider.model || provider.name}</span>
                {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            )
          })}

          {/* Divider */}
          {(configuredCustomProviders.length > 0 || allOAuthProviders.length > 0) && (
            <div className="border-t border-border" />
          )}

          {/* Add custom model - navigate to settings */}
          <button
            onClick={handleAddSource}
            className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2.5"
          >
            <Plus className="w-5 h-5 flex-shrink-0" />
            <span>{t('Custom Model')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
