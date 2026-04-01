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
import { isSkillsFanHostedProviderType } from '../../../shared/constants/providers'
import {
  normalizeThinkingEffortForModel,
  type ThinkingEffort
} from '../../../shared/utils/openai-models'

// Import provider logos
import zhipuLogo from '../../assets/providers/zhipu.jpg'
import minimaxLogo from '../../assets/providers/minimax.jpg'
import kimiLogo from '../../assets/providers/kimi.jpg'
import deepseekLogo from '../../assets/providers/deepseek.jpg'
import claudeLogo from '../../assets/providers/claude.jpg'
import openaiLogo from '../../assets/providers/openai.jpg'
import openrouterLogo from '../../assets/providers/openrouter.jpg'
import xiaomiLogo from '../../assets/providers/xiaomi.png'
import skillsfanLogo from '../../assets/logo.png'

// Provider logo mapping by API URL
const PROVIDER_LOGOS: Record<string, string> = {
  'https://open.bigmodel.cn/api/anthropic': zhipuLogo,
  'https://api.minimaxi.com/anthropic': minimaxLogo,
  'https://api.moonshot.cn/anthropic': kimiLogo,
  'https://api.deepseek.com/anthropic': deepseekLogo,
  'https://api.anthropic.com': claudeLogo,
  'https://api.openai.com': openaiLogo,
  'https://openrouter.ai/api/v1/chat/completions': openrouterLogo,
  'https://api.xiaomimimo.com/anthropic': xiaomiLogo,
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
  'openai-codex': openaiLogo,
  'openrouter': openrouterLogo,
  'xiaomi': xiaomiLogo,
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
  'openai-codex': 'OpenAI (ChatGPT)',
  'openrouter': 'OpenRouter',
  'xiaomi': 'Xiaomi',
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
  if (key.includes('openrouter')) return openrouterLogo
  if (key.includes('xiaomi') || key.includes('mimo')) return xiaomiLogo
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

function isOAuthProviderConfig(value: unknown): value is OAuthSourceConfig {
  return !!value && typeof value === 'object' && 'loggedIn' in value
}

function getOAuthModelIds(providerConfig?: OAuthSourceConfig): string[] {
  if (!providerConfig) return []

  const candidates = [
    ...(Array.isArray(providerConfig.availableModels) ? providerConfig.availableModels : []),
    ...Object.keys(providerConfig.modelNames || {}),
    ...(providerConfig.model ? [providerConfig.model] : [])
  ]

  return Array.from(new Set(candidates.filter(Boolean)))
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
  onModelChange?: () => void  // Called after model selection is saved
}

export function ModelSelector({ variant = 'header', iconOnly = false, disabled = false, onDisabledClick, popoverUp = false, onModelChange }: ModelSelectorProps = {}) {
  const { t } = useTranslation()
  const {
    config,
    setConfig,
    setView,
    publicModels,
    authProviders: storeAuthProviders,
    setPublicModels,
    skillsfanLoggedIn,
    productFeatures
  } = useAppStore()
  const authProviders = (storeAuthProviders || []) as AuthProviderConfig[]
  const hostedAiEnabled = productFeatures?.skillsfanHostedAiEnabled
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

    if (typeof api.refreshAISourcesConfig === 'function') {
      api.refreshAISourcesConfig().then((result) => {
        if (result.success) {
          api.getConfig().then((configResult) => {
            if (configResult.success && configResult.data) {
              setConfig(configResult.data as HaloConfig)
            }
          })
        }
      })
    }
    // Refresh public models → update store
    if (typeof (api as any).getPublicModels === 'function') {
      (api as any).getPublicModels().then((result: any) => {
        if (result.success && result.data) {
          setPublicModels(result.data as Array<{ id: string; name: string; owned_by: string }>)
        }
      })
    }
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
  // Flatten configs[] arrays into individual entries for multi-config support
  const configuredCustomProviders = Object.keys(aiSources)
    .filter(key => {
      if (key === 'current' || key === 'oauth' || key === 'custom') return false
      const source = (aiSources as Record<string, any>)[key]
      // Check if it's a custom API config (has apiKey but not loggedIn)
      return source && typeof source === 'object' && 'apiKey' in source && source.apiKey && !('loggedIn' in source)
    })
    .flatMap(key => {
      const source = (aiSources as Record<string, any>)[key]
      const configs = source.configs as Array<{ provider: string; apiKey: string; apiUrl: string; model: string; label?: string }> | undefined
      const activeConfigIndex = source.activeConfigIndex ?? 0
      const providerName = PROVIDER_NAMES[key] || key
      const logo = getProviderLogoById(key)

      // If has multi-configs, generate one entry per config
      if (configs && configs.length > 1) {
        return configs.map((cfg, idx) => ({
          id: key,
          configIndex: idx,
          name: providerName,
          logo,
          model: cfg.model || '',
          label: cfg.label || cfg.model || '',
          apiUrl: cfg.apiUrl || '',
          config: source,
          isActiveConfig: idx === activeConfigIndex
        }))
      }

      // Single or no configs - show as before
      const singleLabel = configs?.[0]?.label || ''
      return [{
        id: key,
        configIndex: 0,
        name: providerName,
        logo,
        model: source.model || '',
        label: singleLabel,
        apiUrl: source.apiUrl || '',
        config: source,
        isActiveConfig: true
      }]
    })

  // Get all OAuth providers - show regardless of SkillsFan login status
  const providerMetaByType = new Map(
    authProviders
      .filter(provider => hostedAiEnabled || !isSkillsFanHostedProviderType(provider.type))
      .filter(p => p.type !== 'custom')
      .map(provider => [provider.type, provider])
  )
  const oauthProviderTypes = Array.from(new Set([
    ...Array.from(providerMetaByType.keys()),
    ...Object.keys(aiSources).filter(key => {
      if (key === 'current' || key === 'oauth' || key === 'custom') return false
      if (!hostedAiEnabled && isSkillsFanHostedProviderType(key)) return false
      return isOAuthProviderConfig((aiSources as Record<string, unknown>)[key])
    })
  ]))

  const allOAuthProviders = oauthProviderTypes
    .filter(type => {
      const meta = providerMetaByType.get(type)
      const providerConfig = (aiSources as Record<string, any>)[type] as OAuthSourceConfig | undefined
      return meta?.enabled !== false || providerConfig?.loggedIn === true || currentSource === type
    })
    .map(type => {
      const meta = providerMetaByType.get(type)
      const providerConfig = (aiSources as Record<string, any>)[type] as OAuthSourceConfig | undefined
      return {
        type,
        displayName: meta ? getLocalizedText(meta.displayName) : (PROVIDER_NAMES[type] || type),
        config: providerConfig,
        isLoggedIn: providerConfig?.loggedIn === true,
        recommended: meta?.recommended
      }
    })

  // Get current model display name
  // If logged out and current source is an OAuth provider (has 'loggedIn' field), treat as unconfigured
  const currentSourceObj = (aiSources as Record<string, any>)[currentSource]
  const isOAuthSource = currentSourceObj && typeof currentSourceObj === 'object' && 'loggedIn' in currentSourceObj
  const currentSourceHiddenByProduct = !hostedAiEnabled && isSkillsFanHostedProviderType(currentSource)
  const isSkillsFanCreditsSource = hostedAiEnabled && currentSource === 'skillsfan-credits'
  const rawModelName = getCurrentModelName(config)
  const isCurrentConfigured = currentSourceHiddenByProduct
    ? false
    : isSkillsFanCreditsSource
    ? skillsfanLoggedIn
    : isSourceConfigured(aiSources, currentSource)
  let currentModelName = rawModelName
  if (currentSourceHiddenByProduct || !isCurrentConfigured || rawModelName === 'No model') {
    currentModelName = t('model.addModel')
  } else if (variant === 'header' && isOAuthSource && currentSourceObj?.loggedIn) {
    currentModelName = `${rawModelName} (${t('Subscription')})`
  }

  // Handle model selection for any provider
  const handleSelectModel = async (source: AISourceType, modelId: string) => {
    const newAiSources = {
      ...aiSources,
      current: source
    } as Record<string, any>

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
      thinkingEffort: normalizeThinkingEffortForModel(
        modelId,
        (config.thinkingEffort as ThinkingEffort | undefined) ?? 'off'
      ),
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as HaloConfig)
    setIsOpen(false)
    onModelChange?.()
  }

  // Handle provider selection for configured custom API providers
  const handleSelectProvider = async (providerId: string) => {
    const newAiSources = {
      ...aiSources,
      current: providerId
    } as Record<string, any>

    const providerConfig = (aiSources as Record<string, any>)[providerId]

    const newConfig = {
      ...config,
      thinkingEffort: normalizeThinkingEffortForModel(
        providerConfig?.model,
        (config.thinkingEffort as ThinkingEffort | undefined) ?? 'off'
      ),
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as HaloConfig)
    setIsOpen(false)
    onModelChange?.()
  }

  // Handle selecting a specific config within a provider (multi-config support)
  const handleSelectProviderConfig = async (providerId: string, configIndex: number) => {
    const providerConfig = (aiSources as Record<string, any>)[providerId]
    if (!providerConfig?.configs) {
      // Fallback to simple provider switch
      return handleSelectProvider(providerId)
    }

    const targetCfg = providerConfig.configs[configIndex]
    if (!targetCfg) return

    const updatedProvider = {
      ...providerConfig,
      activeConfigIndex: configIndex,
      provider: targetCfg.provider,
      apiKey: targetCfg.apiKey,
      apiUrl: targetCfg.apiUrl,
      model: targetCfg.model
    }

    const newAiSources = {
      ...aiSources,
      current: providerId,
      [providerId]: updatedProvider
    } as Record<string, any>

    const newConfig = {
      ...config,
      thinkingEffort: normalizeThinkingEffortForModel(
        targetCfg.model,
        (config.thinkingEffort as ThinkingEffort | undefined) ?? 'off'
      ),
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as HaloConfig)
    setIsOpen(false)
    onModelChange?.()
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
  const currentProviderConfig = configuredCustomProviders.find(p => p.id === currentSource && p.isActiveConfig)
  const currentOAuthProvider = allOAuthProviders.find(
    provider => provider.type === currentSource && provider.isLoggedIn && provider.config
  )
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
  const currentSourcePublicModels = (() => {
    if (!hostedAiEnabled || !skillsfanLoggedIn || publicModels.length === 0) return []
    if (!(currentSource in SKILLSFAN_PROVIDER_META)) return []

    return publicModels.filter((model) => {
      if (currentSource === 'skillsfan-credits') return true
      return getPublicModelProviderType(model) === currentSource
    })
  })()
  const effectiveCurrentModelId = (() => {
    if (currentModelId) return currentModelId

    const availableModels = getOAuthModelIds(currentOAuthProvider?.config)
    if (availableModels.length > 0) return availableModels[0]

    const sourcePublicModels = currentSourcePublicModels
    if (sourcePublicModels.length === 0) return ''

    const providerDefaultModel = PROVIDER_DEFAULT_MODELS[currentSource]
    if (providerDefaultModel) {
      const normalizedDefault = providerDefaultModel.toLowerCase()
      const defaultMatch = sourcePublicModels.find(m => m.id.toLowerCase() === normalizedDefault)
      if (defaultMatch) return defaultMatch.id
    }

    return sourcePublicModels[0].id
  })()
  const currentPublicModel = currentSourcePublicModels.find(model => model.id === effectiveCurrentModelId)
  const currentModelDisplayName =
    currentSourceConfig?.modelNames?.[currentModelId] ||
    currentPublicModel?.name ||
    ''
  const currentProviderLogo = isCurrentConfigured
    && !currentSourceHiddenByProduct
    ? (currentPublicModel
        ? getModelLogo(
            currentPublicModel.id,
            currentPublicModel.name,
            getPublicModelProviderType(currentPublicModel)
          )
        : null) ||
      (currentProviderConfig?.logo ||
       (currentSource === 'custom' && aiSources.custom?.apiUrl ? getProviderLogo(aiSources.custom.apiUrl) : null) ||
       (currentProviderConfig?.apiUrl ? getProviderLogo(currentProviderConfig.apiUrl) : null) ||
       (currentModelId ? getModelLogo(currentModelId, currentModelDisplayName, currentSource) : null) ||
       getProviderLogoById(currentSource))
    : null

  const customOAuthProviders = allOAuthProviders.filter(
    provider => provider.isLoggedIn && provider.config && !(provider.type in SKILLSFAN_PROVIDER_META)
  )
  const customOAuthModelIds = new Set<string>()
  customOAuthProviders.forEach((provider) => {
    getOAuthModelIds(provider.config).forEach((modelId) => customOAuthModelIds.add(modelId))
  })

  const builtInModelOptions = (() => {
    if (!hostedAiEnabled || !skillsfanLoggedIn || publicModels.length === 0) return []

    return publicModels
      .filter((model) => {
        const isCurrentBuiltInSelection =
          (currentSource in SKILLSFAN_PROVIDER_META) && effectiveCurrentModelId === model.id
        return isCurrentBuiltInSelection || !customOAuthModelIds.has(model.id)
      })
      .map((model) => {
        const providerType = getPublicModelProviderType(model)
        return {
          key: `built-in:${providerType}:${model.id}`,
          modelName: model.name,
          isSelected: currentSource === providerType && effectiveCurrentModelId === model.id,
          logo: getModelLogo(model.id, model.name, providerType) || getProviderLogoById(providerType),
          onSelect: () => handleSelectModel(providerType, model.id)
        }
      })
  })()

  const customModelOptions = (() => {
    const options = customOAuthProviders.flatMap((provider) => {
      const modelIds = getOAuthModelIds(provider.config)
      return modelIds.map((modelId) => {
        const modelName = provider.config?.modelNames?.[modelId] || modelId
        return {
          key: `custom-oauth:${provider.type}:${modelId}`,
          modelName,
          isSelected: currentSource === provider.type && effectiveCurrentModelId === modelId,
          logo: getModelLogo(modelId, modelName, provider.type) || getProviderLogoById(provider.type),
          onSelect: () => handleSelectModel(provider.type, modelId)
        }
      })
    })

    if (aiSources.custom?.apiKey && aiSources.custom.model) {
      const modelId = aiSources.custom.model
      const modelName = getCurrentModelName({
        ...config,
        aiSources: {
          ...aiSources,
          current: 'custom'
        }
      } as HaloConfig)
      options.push({
        key: 'custom:legacy',
        modelName,
        isSelected: currentSource === 'custom',
        logo: getProviderLogo(aiSources.custom.apiUrl) || getModelLogo(modelId, modelName, 'custom'),
        onSelect: () => handleSelectModel('custom', modelId)
      })
    }

    configuredCustomProviders.forEach((provider) => {
      const modelId = provider.model || provider.name
      // Show label (model name) if available, otherwise fall back to model ID
      const displayName = provider.label || provider.model || provider.name
      const isSelected = currentSource === provider.id && provider.isActiveConfig
      options.push({
        key: `custom-provider:${provider.id}:${provider.configIndex}`,
        modelName: displayName,
        isSelected,
        logo: provider.logo ||
          (provider.apiUrl ? getProviderLogo(provider.apiUrl) : null) ||
          getModelLogo(modelId, provider.model || provider.name, provider.id),
        onSelect: () => handleSelectProviderConfig(provider.id, provider.configIndex)
      })
    })

    return options
  })()

  const currentSourceFallbackOptions = (() => {
    if (!hostedAiEnabled) return []
    if (builtInModelOptions.length > 0 || customModelOptions.length > 0) return []

    return currentSourcePublicModels.map((model) => {
      const providerType = getPublicModelProviderType(model)
      return {
        key: `fallback:${providerType}:${model.id}`,
        modelName: model.name,
        isSelected: effectiveCurrentModelId === model.id,
        logo: getModelLogo(model.id, model.name, providerType) || getProviderLogoById(providerType),
        onSelect: () => handleSelectModel(providerType, model.id)
      }
    })
  })()

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
          <img src={currentProviderLogo} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
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
            min-w-[13rem] max-w-[20rem] max-h-[20rem] overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-50 py-0
            model-selector-scrollbar ${isDropdownScrolling ? 'model-selector-scrollbar--visible' : ''}
            animate-in fade-in-0 slide-in-from-top-2 duration-200
          `.trim().replace(/\s+/g, ' ')}
        >
          {builtInModelOptions.length > 0 && (
            <SectionHeader label={t('Built-in Models')} />
          )}
          {builtInModelOptions.map((option) => (
            <button
              key={option.key}
              onClick={option.onSelect}
              className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                option.isSelected
                  ? 'bg-primary/15 text-primary font-medium hover:bg-primary/20'
                  : 'text-foreground hover:bg-secondary/80'
              }`}
            >
              {option.logo ? (
                <img src={option.logo} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">AI</span>
                </div>
              )}
              <span className="flex-1 truncate">{option.modelName}</span>
              {option.isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
            </button>
          ))}

          {builtInModelOptions.length > 0 && customModelOptions.length > 0 && (
            <div className="border-t border-border" />
          )}

          {customModelOptions.length > 0 && (
            <SectionHeader label={t('Custom Models')} />
          )}
          {customModelOptions.map((option) => (
            <button
              key={option.key}
              onClick={option.onSelect}
              className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                option.isSelected
                  ? 'bg-primary/15 text-primary font-medium hover:bg-primary/20'
                  : 'text-foreground hover:bg-secondary/80'
              }`}
            >
              {option.logo ? (
                <img src={option.logo} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">AI</span>
                </div>
              )}
              <span className="flex-1 truncate">{option.modelName}</span>
              {option.isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
            </button>
          ))}

          {currentSourceFallbackOptions.length > 0 && builtInModelOptions.length === 0 && customModelOptions.length === 0 && (
            currentSourceFallbackOptions.map((option) => (
              <button
                key={option.key}
                onClick={option.onSelect}
                className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                  option.isSelected
                    ? 'bg-primary/15 text-primary font-medium hover:bg-primary/20'
                    : 'text-foreground hover:bg-secondary/80'
                }`}
              >
                {option.logo ? (
                  <img src={option.logo} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground">AI</span>
                  </div>
                )}
                <span className="flex-1 truncate">{option.modelName}</span>
                {option.isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            ))
          )}

          {/* Divider */}
          {(builtInModelOptions.length > 0 || customModelOptions.length > 0 || currentSourceFallbackOptions.length > 0) && (
            <div className="border-t border-border" />
          )}

          {/* Add custom model - navigate to settings */}
          <button
            onClick={handleAddSource}
            className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span>{t('Custom Model')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
