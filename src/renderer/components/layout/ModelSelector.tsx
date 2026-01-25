/**
 * ModelSelector - Dropdown for selecting AI model in header
 * Shows models grouped by source (OAuth providers / Custom API)
 *
 * Design: Dynamic rendering based on config - no hardcoded provider names
 * OAuth providers are loaded from product.json configuration
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import {
  AVAILABLE_MODELS,
  getCurrentModelName,
  type HaloConfig,
  type AISourceType,
  type OAuthSourceConfig
} from '../../types'
import { useTranslation, getCurrentLanguage } from '../../i18n'

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
}

export function ModelSelector({ variant = 'header' }: ModelSelectorProps = {}) {
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
  const isCustomAnthropic = aiSources.custom?.provider === 'anthropic'

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

  // Handle add source
  const handleAddSource = () => {
    setIsOpen(false)
    setView('settings')
  }

  // Style configuration for different variants
  const styleConfig = {
    header: {
      button: "flex items-center gap-1.5 px-3 py-1.5 text-sm",
      dropdown: "absolute right-0 top-full mt-1",
      showChevron: true,
    },
    compact: {
      button: "h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs",
      dropdown: "absolute left-0 bottom-full mb-1",
      showChevron: false,
    }
  }

  const styles = styleConfig[variant]

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          ${styles.button}
          ${variant === 'header'
            ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors'
            : `transition-colors duration-200 ${isOpen
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
              }`
          }
        `.trim().replace(/\s+/g, ' ')}
      >
        <span className={variant === 'header' ? 'max-w-[140px] truncate' : ''}>
          {currentModelName}
        </span>
        {styles.showChevron && (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`
          ${styles.dropdown}
          w-56 bg-card border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden
        `.trim().replace(/\s+/g, ' ')}>
          {/* Custom API Section */}
          {hasCustom && aiSources.custom && (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>{t('Custom API')}</span>
                <button
                  onClick={handleAddSource}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  &gt;
                </button>
              </div>
              {isCustomAnthropic ? (
                // Anthropic provider: show Claude model list
                AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleSelectModel('custom', model.id)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 ${
                      currentSource === 'custom' && aiSources.custom?.model === model.id
                        ? 'text-primary'
                        : 'text-foreground'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      currentSource === 'custom' && aiSources.custom?.model === model.id
                        ? 'bg-primary'
                        : 'bg-transparent'
                    }`} />
                    {model.name}
                  </button>
                ))
              ) : (
                // OpenAI compatible: show current model only (user configures in settings)
                <button
                  onClick={() => setIsOpen(false)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 ${
                    currentSource === 'custom' ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    currentSource === 'custom' ? 'bg-primary' : 'bg-transparent'
                  }`} />
                  {aiSources.custom?.model || 'Custom Model'}
                </button>
              )}
            </>
          )}

          {/* OAuth Providers - Dynamic rendering */}
          {loggedInOAuthProviders.map((provider, index) => (
            <div key={provider.type}>
              {(hasCustom || index > 0) && <div className="my-1 border-t border-border" />}
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {provider.displayName}
              </div>
              {(provider.config?.availableModels || []).map((modelId) => {
                const displayName = provider.config?.modelNames?.[modelId] || modelId
                return (
                  <button
                    key={modelId}
                    onClick={() => handleSelectModel(provider.type, modelId)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 ${
                      currentSource === provider.type && provider.config?.model === modelId
                        ? 'text-primary'
                        : 'text-foreground'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      currentSource === provider.type && provider.config?.model === modelId
                        ? 'bg-primary'
                        : 'bg-transparent'
                    }`} />
                    {displayName}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Add source if none configured */}
          {!hasCustom && loggedInOAuthProviders.length === 0 && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={handleAddSource}
                className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('Add Custom API')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
