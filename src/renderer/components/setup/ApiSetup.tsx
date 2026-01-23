/**
 * API Setup - Custom API configuration
 * No validation - just save and enter, errors will show on first chat
 * Includes language selector for first-time users
 * Now supports back button for multi-source login flow
 */

import { useState } from 'react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import { Lightbulb } from '../icons/ToolIcons'
import { Globe, ChevronDown, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../../types'
import { useTranslation, setLanguage, getCurrentLanguage, SUPPORTED_LOCALES, type LocaleCode } from '../../i18n'
import { HaloLogo } from '../brand/HaloLogo'

interface ApiSetupProps {
  /** Called when user clicks back button */
  onBack?: () => void
  /** Whether to show the back button */
  showBack?: boolean
}

export function ApiSetup({ onBack, showBack = false }: ApiSetupProps) {
  const { t } = useTranslation()
  const { config, setConfig, setView } = useAppStore()

  // Form state
  const [provider, setProvider] = useState(config?.api.provider || 'anthropic')
  const [apiKey, setApiKey] = useState(config?.api.apiKey || '')
  const [apiUrl, setApiUrl] = useState(config?.api.apiUrl || 'https://api.anthropic.com')
  const [model, setModel] = useState(config?.api.model || DEFAULT_MODEL)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Custom model toggle
  const [useCustomModel, setUseCustomModel] = useState(() => {
    const currentModel = config?.api.model || DEFAULT_MODEL
    return !AVAILABLE_MODELS.some(m => m.id === currentModel)
  })

  // Language selector state
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false)
  const [currentLang, setCurrentLang] = useState<LocaleCode>(getCurrentLanguage())
  // API Key visibility
  const [showApiKey, setShowApiKey] = useState(false)

  // Handle language change
  const handleLanguageChange = (lang: LocaleCode) => {
    setLanguage(lang)
    setCurrentLang(lang)
    setIsLangDropdownOpen(false)
  }

  const handleProviderChange = (next: string) => {
    setProvider(next)
    setError(null)

    if (next === 'anthropic') {
      // Claude
      if (!apiUrl || apiUrl.includes('openai')) setApiUrl('https://api.anthropic.com')
      if (!model || !model.startsWith('claude-')) {
        setModel(DEFAULT_MODEL)
        setUseCustomModel(false)
      }
    } else if (next === 'openai') {
      // OpenAI compatible
      if (!apiUrl || apiUrl.includes('anthropic')) setApiUrl('https://api.openai.com')
      if (!model || model.startsWith('claude-')) setModel('gpt-4o-mini')
    }
  }

  // Handle save and enter
  const handleSaveAndEnter = async () => {
    if (!apiKey.trim()) {
      setError(t('Please enter API Key'))
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Save config with new aiSources structure
      const customConfig = {
        provider: provider as 'anthropic' | 'openai',
        apiKey,
        apiUrl: apiUrl || 'https://api.anthropic.com',
        model
      }

      const newConfig = {
        ...config,
        // Legacy api field for backward compatibility
        api: customConfig,
        // New aiSources structure
        aiSources: {
          current: 'custom' as const,
          custom: customConfig
        },
        isFirstLaunch: false
      }

      await api.setConfig(newConfig)
      setConfig(newConfig as any)

      // Enter Halo
      setView('home')
    } catch (err) {
      setError(t('Save failed, please try again'))
      setIsSaving(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background p-8 relative">
      {/* Back Button - Top Left (when showBack is true) */}
      {showBack && onBack && (
        <div className="absolute top-6 left-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Language Selector - Top Right */}
      <div className="absolute top-6 right-6">
        <div className="relative">
          <button
            onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span>{SUPPORTED_LOCALES[currentLang]}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {isLangDropdownOpen && (
            <>
              {/* Backdrop to close dropdown */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsLangDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-1 py-1 w-40 bg-card border border-border rounded-lg shadow-lg z-20">
                {Object.entries(SUPPORTED_LOCALES).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => handleLanguageChange(code as LocaleCode)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-secondary/80 transition-colors ${
                      currentLang === code ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        {/* Logo */}
        <HaloLogo size={64} />
        <h1 className="mt-4 text-2xl font-light">技能范</h1>
      </div>

      {/* Main content */}
      <div className="w-full max-w-md">
        <h2 className="text-center text-lg mb-6">
          {showBack ? t('Configure Custom API') : t('Before you start, configure your AI')}
        </h2>

        <div className="bg-card rounded-xl p-6 border border-border">
          {/* Provider */}
          <div className="mb-4 flex items-center justify-between gap-3 p-3 bg-secondary/50 rounded-lg">
            <div className="w-8 h-8 rounded-lg bg-[#da7756]/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#da7756]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.709 15.955l4.72-2.647.08-.08 2.726-1.529.08-.08 6.206-3.48a.25.25 0 00.125-.216V6.177a.25.25 0 00-.375-.217l-6.206 3.48-.08.08-2.726 1.53-.08.079-4.72 2.647a.25.25 0 00-.125.217v1.746c0 .18.193.294.354.216h.001zm13.937-3.584l-4.72 2.647-.08.08-2.726 1.529-.08.08-6.206 3.48a.25.25 0 00-.125.216v1.746a.25.25 0 00.375.217l6.206-3.48.08-.08 2.726-1.53.08-.079 4.72-2.647a.25.25 0 00.125-.217v-1.746a.25.25 0 00-.375-.216z"/>
              </svg>
            </div>
            <div>
              <p className="font-medium text-sm">
                {provider === 'anthropic'
                  ? t('Claude (Recommended)')
                  : t('OpenAI Compatible')}
              </p>
              <p className="text-xs text-muted-foreground">
                {provider === 'openai'
                  ? t('Support OpenAI/compatible models via local protocol conversion')
                  : t('Connect directly to Anthropic official or compatible proxy')}
              </p>
            </div>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="px-3 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors text-sm"
            >
              <option value="anthropic">{t('Claude (Recommended)')}</option>
              <option value="openai">{t('OpenAI Compatible')}</option>
            </select>
          </div>

          {/* API Key input */}
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-2">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'openai' ? 'sk-xxxxxxxxxxxxx' : 'sk-ant-xxxxxxxxxxxxx'}
                className="w-full px-4 py-2 pr-12 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* API URL input */}
          <div className="mb-6">
            <label className="block text-sm text-muted-foreground mb-2">{t('API URL (optional)')}</label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={provider === 'openai' ? 'https://api.openai.com or https://xx/v1' : 'https://api.anthropic.com'}
              className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {provider === 'openai'
                ? t('Enter OpenAI compatible service URL (supports /v1/chat/completions)')
                : t('Default official URL, modify for custom proxy')}
            </p>
          </div>

          {/* Model */}
          <div className="mb-2">
            <label className="block text-sm text-muted-foreground mb-2">{t('Model')}</label>
            {provider === 'anthropic' ? (
              <>
                {useCustomModel ? (
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="claude-sonnet-4-5-20250929"
                    className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
                  />
                ) : (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="mt-1 flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">
                    {useCustomModel
                      ? t('Enter official Claude model name')
                      : t(AVAILABLE_MODELS.find((m) => m.id === model)?.description || '')}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground/70 cursor-pointer hover:text-muted-foreground transition-colors whitespace-nowrap shrink-0">
                    <input
                      type="checkbox"
                      checked={useCustomModel}
                      onChange={(e) => {
                        setUseCustomModel(e.target.checked)
                        if (!e.target.checked && !AVAILABLE_MODELS.some(m => m.id === model)) {
                          setModel(DEFAULT_MODEL)
                        }
                      }}
                    className="w-3 h-3 rounded border-border"
                  />
                    {t('Custom')}
                  </label>
                </div>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini / deepseek-chat"
                  className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('Enter OpenAI compatible service model name')}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Help link */}
        <p className="text-center mt-4 text-sm text-muted-foreground">
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary cursor-pointer hover:underline inline-flex items-center gap-1"
          >
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            {t("Don't know how to get it? View tutorial")}
          </a>
        </p>

        {/* Error message */}
        {error && (
          <p className="text-center mt-4 text-sm text-red-500">{error}</p>
        )}

        {/* Save button */}
        <button
          onClick={handleSaveAndEnter}
          disabled={isSaving}
          className="w-full mt-6 px-8 py-3 bg-primary text-primary-foreground rounded-lg btn-primary disabled:opacity-50"
        >
          {isSaving ? t('Saving...') : t('Save and enter')}
        </button>
      </div>
    </div>
  )
}
