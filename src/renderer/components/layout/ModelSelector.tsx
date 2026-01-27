/**
 * ModelSelector - Dropdown for selecting AI model in header
 * Shows configured models with provider logos
 *
 * Design: Dynamic rendering based on config - no hardcoded provider names
 * OAuth providers are loaded from product.json configuration
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import {
  getCurrentModelName,
  type HaloConfig,
  type AISourceType,
  type OAuthSourceConfig
} from '../../types'
import { useTranslation, getCurrentLanguage } from '../../i18n'

// Import provider logos
import zhipuLogo from '../../assets/providers/zhipu.jpg'
import minimaxLogo from '../../assets/providers/minimax.jpg'
import kimiLogo from '../../assets/providers/kimi.jpg'
import deepseekLogo from '../../assets/providers/deepseek.jpg'
import claudeLogo from '../../assets/providers/claude.jpg'
import openaiLogo from '../../assets/providers/openai.jpg'

// Provider logo mapping by API URL
const PROVIDER_LOGOS: Record<string, string> = {
  'https://open.bigmodel.cn/api/anthropic': zhipuLogo,
  'https://api.minimaxi.com/anthropic': minimaxLogo,
  'https://api.moonshot.cn/anthropic': kimiLogo,
  'https://api.deepseek.com/anthropic': deepseekLogo,
  'https://api.anthropic.com': claudeLogo,
  'https://api.openai.com': openaiLogo,
}

/**
 * Get provider logo by API URL
 */
function getProviderLogo(apiUrl: string): string | null {
  const normalizedUrl = apiUrl.replace(/\/$/, '')
  return PROVIDER_LOGOS[normalizedUrl] || null
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

interface ModelSelectorProps {
  variant?: 'header' | 'compact'
  iconOnly?: boolean  // Show only icon without text (for narrow windows)
}

export function ModelSelector({ variant = 'header', iconOnly = false }: ModelSelectorProps = {}) {
  const { t } = useTranslation()
  const { config, setConfig, setView } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load auth providers from config
  useEffect(() => {
    api.authGetProviders().then((result) => {
      if (result.success && result.data) {
        setAuthProviders(result.data as AuthProviderConfig[])
      }
    })
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
  const hasCustom = !!(aiSources.custom?.apiKey)

  // Get logged-in OAuth providers dynamically
  const loggedInOAuthProviders = authProviders
    .filter(p => p.type !== 'custom' && p.enabled)
    .map(p => {
      const providerConfig = aiSources[p.type] as OAuthSourceConfig | undefined
      return {
        type: p.type,
        displayName: getLocalizedText(p.displayName),
        config: providerConfig,
        isLoggedIn: providerConfig?.loggedIn === true
      }
    })
    .filter(p => p.isLoggedIn)

  // Get current model display name
  const currentModelName = getCurrentModelName(config)

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
      newAiSources[source] = {
        ...providerConfig,
        model: modelId
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

  // Style configuration for different variants
  const styleConfig = {
    header: {
      button: "flex items-center gap-1.5 px-3 py-1.5 text-sm",
      dropdown: "absolute left-0 bottom-full mb-2",
      showChevron: true,
    },
    compact: {
      button: "h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs",
      dropdown: "absolute left-0 bottom-full mb-1",
      showChevron: false,
    }
  }

  const styles = styleConfig[variant]

  // Get custom API provider logo
  const customApiLogo = aiSources.custom?.apiUrl ? getProviderLogo(aiSources.custom.apiUrl) : null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          ${styles.button}
          ${variant === 'header'
            ? 'text-foreground hover:bg-secondary/80 rounded-lg transition-colors'
            : `transition-all duration-200 border ${isOpen
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'text-muted-foreground border-border/60 hover:bg-muted hover:border-border hover:text-foreground'
              }`
          }
        `.trim().replace(/\s+/g, ' ')}
      >
        {/* Provider Logo */}
        {customApiLogo ? (
          <img src={customApiLogo} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
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
          className={`
            ${styles.dropdown}
            w-56 bg-card border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden
            animate-in fade-in-0 slide-in-from-bottom-2 duration-200
          `.trim().replace(/\s+/g, ' ')}
        >
          {/* Custom API - show only the configured model with logo */}
          {hasCustom && aiSources.custom && (
            <button
              onClick={() => setIsOpen(false)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2.5 ${
                currentSource === 'custom' ? 'text-primary' : 'text-foreground'
              }`}
            >
              {customApiLogo ? (
                <img src={customApiLogo} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-xs text-muted-foreground">AI</span>
                </div>
              )}
              <span className="truncate">{aiSources.custom?.model || 'Custom Model'}</span>
              {currentSource === 'custom' && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              )}
            </button>
          )}

          {/* OAuth Providers - Dynamic rendering */}
          {loggedInOAuthProviders.map((provider) => (
            <div key={provider.type}>
              {hasCustom && <div className="my-1 border-t border-border" />}
              {(provider.config?.availableModels || []).map((modelId) => {
                const displayName = provider.config?.modelNames?.[modelId] || modelId
                const isSelected = currentSource === provider.type && provider.config?.model === modelId
                return (
                  <button
                    key={modelId}
                    onClick={() => handleSelectModel(provider.type, modelId)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2.5 ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-muted-foreground">O</span>
                    </div>
                    <span className="truncate">{displayName}</span>
                    {isSelected && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Divider */}
          {(hasCustom || loggedInOAuthProviders.length > 0) && (
            <div className="my-1 border-t border-border" />
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
