/**
 * API Setup - Custom API configuration
 * No validation - just save and enter, errors will show on first chat
 * Includes language selector for first-time users
 * Now supports back button for multi-source login flow
 */

import { useState } from 'react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import { Globe, ChevronDown, ArrowLeft, Eye, EyeOff, Settings, ExternalLink } from 'lucide-react'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../../types'
import { useTranslation, setLanguage, getCurrentLanguage, SUPPORTED_LOCALES, type LocaleCode } from '../../i18n'
import { Select } from '../ui/Select'

// Import provider logos
import zhipuLogo from '../../assets/providers/zhipu.jpg'
import minimaxLogo from '../../assets/providers/minimax.jpg'
import kimiLogo from '../../assets/providers/kimi.jpg'
import deepseekLogo from '../../assets/providers/deepseek.jpg'
import claudeLogo from '../../assets/providers/claude.jpg'
import openaiLogo from '../../assets/providers/openai.jpg'

interface ProviderPreset {
  id: string
  name: string
  nameKey: string              // 翻译键
  apiUrl?: string              // 自定义选项无默认 URL
  defaultModel?: string        // 自定义选项无默认模型
  logo?: string                // Logo 图片路径
  apiType: 'anthropic' | 'openai' | 'custom'
  isCustom?: boolean           // 标记是否为自定义选项
  docsUrl?: string             // 获取 API Key 链接
  apiDocsUrl?: string          // API 文档链接（可选）
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'zhipu',
    name: 'Zhipu GLM',
    nameKey: 'Zhipu GLM',
    apiUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'GLM-5-Turbo',
    logo: zhipuLogo,
    apiType: 'anthropic',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    apiDocsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/claude'
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    nameKey: 'MiniMax',
    apiUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-2.7',
    logo: minimaxLogo,
    apiType: 'anthropic',
    docsUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    apiDocsUrl: 'https://platform.minimaxi.com/docs/api-reference/text-anthropic-api'
  },
  {
    id: 'kimi',
    name: 'Kimi',
    nameKey: 'Kimi',
    apiUrl: 'https://api.moonshot.cn/anthropic',
    defaultModel: 'kimi-k2-thinking',
    logo: kimiLogo,
    apiType: 'anthropic',
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
    apiDocsUrl: 'https://platform.moonshot.cn/docs/guide/agent-support#%E4%BD%BF%E7%94%A8%E6%B3%A8%E6%84%8F%E4%BA%8B%E9%A1%B9'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    nameKey: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/anthropic',
    defaultModel: 'DeepSeek-V3.2',
    logo: deepseekLogo,
    apiType: 'anthropic',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    apiDocsUrl: 'https://api-docs.deepseek.com/zh-cn/guides/anthropic_api'
  },
  {
    id: 'claude',
    name: 'Claude',
    nameKey: 'Claude',
    apiUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-5-20250929',
    logo: claudeLogo,
    apiType: 'anthropic',
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    nameKey: 'OpenAI',
    apiUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini',
    logo: openaiLogo,
    apiType: 'openai',
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'custom',
    name: '自定义',
    nameKey: 'Custom',
    apiType: 'custom',
    isCustom: true
  }
]

interface ApiSetupProps {
  /** Called when user clicks back button */
  onBack?: () => void
  /** Whether to show the back button */
  showBack?: boolean
  /** Initial provider ID to pre-select */
  initialProviderId?: string
}

export function ApiSetup({ onBack, showBack = false, initialProviderId }: ApiSetupProps) {
  const { t } = useTranslation()
  const { config, setConfig, initialize } = useAppStore()

  // Selected provider - use initialProviderId if provided, otherwise infer from config
  const selectedProvider = initialProviderId || 'claude'

  // Get the current preset
  const currentPreset = PROVIDER_PRESETS.find(p => p.id === selectedProvider)

  // Form state - initialized based on selected preset
  const [provider, setProvider] = useState<'anthropic' | 'openai'>(() => {
    if (currentPreset?.isCustom) {
      return 'anthropic'
    }
    return currentPreset?.apiType === 'openai' ? 'openai' : 'anthropic'
  })
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState(() => {
    if (currentPreset?.isCustom) {
      return ''
    }
    return currentPreset?.apiUrl || 'https://api.anthropic.com'
  })
  const [model, setModel] = useState(() => {
    if (currentPreset?.isCustom) {
      return ''
    }
    return ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Custom model toggle (only for Claude)
  const [useCustomModel, setUseCustomModel] = useState(false)

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

  // Handle save and enter
  const handleSaveAndEnter = async () => {
    if (!apiKey.trim()) {
      setError(t('Please enter API Key'))
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Use selected provider ID as storage key (e.g., 'zhipu', 'deepseek', 'claude', 'custom')
      const storageKey = selectedProvider

      const providerConfig = {
        provider: provider as 'anthropic' | 'openai',
        apiKey,
        apiUrl: apiUrl || 'https://api.anthropic.com',
        model
      }

      const newConfig = {
        ...config,
        ...(storageKey === 'custom' ? {
          // Legacy api field is reserved for the generic custom provider.
          api: providerConfig
        } : {}),
        // New aiSources structure - use provider ID as key
        aiSources: {
          ...config?.aiSources,
          current: storageKey as const,
          [storageKey]: providerConfig  // Store under provider ID key
        },
        isFirstLaunch: false
      }

      const result = await api.setConfig(newConfig)
      if (!result.success) {
        throw new Error(result.error || t('Failed to save config'))
      }
      setConfig(newConfig as any)

      // Re-run app initialization to load spaces and set the correct view
      await initialize()
    } catch (err) {
      setError(t('Save failed, please try again'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-background relative overflow-y-auto">
      {/* Top Bar - Fixed positioning */}
      <div className="sticky top-0 left-0 right-0 z-10 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 pt-8 pb-4">
          {/* Back Button - Top Left (when showBack is true) */}
          {showBack && onBack ? (
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div />
          )}

          {/* Language Selector - Top Right */}
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
      </div>

      {/* Main content - Centered with proper spacing */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-8 pt-[8vh] pb-12">
        <div className="w-full max-w-lg">
        {/* Provider Header */}
        <div className="flex flex-col items-center mb-12">
          {currentPreset && (
            <>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 overflow-hidden">
                {currentPreset.logo ? (
                  <img src={currentPreset.logo} alt={currentPreset.name} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <div className="w-full h-full bg-muted/50 flex items-center justify-center rounded-xl">
                    <Settings className="w-7 h-7 text-muted-foreground" />
                  </div>
                )}
              </div>
              <h2 className="text-lg font-medium">
                {currentPreset.isCustom ? t('Custom') : currentPreset.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('Configure API')}
              </p>
            </>
          )}
        </div>

        <div className="space-y-4">
          {/* API Configuration Card */}
          <div className="bg-card rounded-xl p-5 border border-border/80 shadow-sm space-y-5">

            {/* API Key input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">API Key</label>
                {selectedProvider && !PROVIDER_PRESETS.find(p => p.id === selectedProvider)?.isCustom && (
                  <a
                    href={PROVIDER_PRESETS.find(p => p.id === selectedProvider)?.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t('Get API Key')}
                  </a>
                )}
              </div>
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
                  title={showApiKey ? t('Hide API Key') : t('Show API Key')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/50"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* API URL input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">{t('API URL')}</label>
                {selectedProvider && PROVIDER_PRESETS.find(p => p.id === selectedProvider)?.apiDocsUrl && (
                  <a
                    href={PROVIDER_PRESETS.find(p => p.id === selectedProvider)?.apiDocsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t('API Documentation')}
                  </a>
                )}
              </div>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={PROVIDER_PRESETS.find(p => p.id === selectedProvider)?.apiUrl || 'https://...'}
                className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('Default URL is pre-filled, you can modify it')}
              </p>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">{t('Model')}</label>
              {selectedProvider === 'claude' ? (
                // Claude: 保持原有的下拉选择 + 自定义切换
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
                    <Select
                      value={model}
                      onChange={setModel}
                      options={AVAILABLE_MODELS.map((m) => ({ value: m.id, label: m.name }))}
                    />
                  )}
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      {useCustomModel
                        ? t('Enter official Claude model name')
                        : t(AVAILABLE_MODELS.find((m) => m.id === model)?.description || '')}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer whitespace-nowrap shrink-0">
                      <input
                        type="checkbox"
                        checked={useCustomModel}
                        onChange={(e) => {
                          setUseCustomModel(e.target.checked)
                          if (!e.target.checked && !AVAILABLE_MODELS.some(m => m.id === model)) {
                            setModel(DEFAULT_MODEL)
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-border cursor-pointer accent-primary"
                      />
                      {t('Custom')}
                    </label>
                  </div>
                </>
              ) : (
                // 其他供应商: 文本输入框，显示预设模型
                <>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={PROVIDER_PRESETS.find(p => p.id === selectedProvider)?.defaultModel || 'model-name'}
                    className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('Default model is pre-filled, you can modify it')}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-center mt-4 text-sm text-red-500">{error}</p>
        )}

        {/* Save button */}
        <button
          onClick={handleSaveAndEnter}
          disabled={isSaving}
          className="w-full mt-8 px-8 py-3 bg-primary text-primary-foreground rounded-lg btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? t('Saving...') : t('Save and enter')}
        </button>
        </div>
      </div>
    </div>
  )
}
