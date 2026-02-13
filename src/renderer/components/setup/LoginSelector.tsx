/**
 * LoginSelector - First-time login method selection
 * Shows AI provider grid for selection
 */

import { useState } from 'react'
import { Globe, ChevronDown, Settings, ChevronLeft } from 'lucide-react'
import { useTranslation, setLanguage, getCurrentLanguage, SUPPORTED_LOCALES, type LocaleCode } from '../../i18n'
import { HaloLogo } from '../brand/HaloLogo'

// Import provider logos
import zhipuLogo from '../../assets/providers/zhipu.jpg'
import minimaxLogo from '../../assets/providers/minimax.jpg'
import kimiLogo from '../../assets/providers/kimi.jpg'
import deepseekLogo from '../../assets/providers/deepseek.jpg'
import claudeLogo from '../../assets/providers/claude.jpg'
import openaiLogo from '../../assets/providers/openai.jpg'
import skillsfanLogo from '../../assets/logo.png'

/**
 * Provider preset configuration
 */
interface ProviderPreset {
  id: string
  name: string
  nameKey: string
  logo?: string
  isCustom?: boolean
  isOAuth?: boolean  // OAuth provider (uses SkillsFan login, not API key)
}

/**
 * OAuth-based providers (shown as recommended section)
 */
const OAUTH_PROVIDERS: ProviderPreset[] = [
  {
    id: 'glm',
    name: 'GLM-5',
    nameKey: 'GLM-5',
    logo: zhipuLogo,
    isOAuth: true,
  },
  {
    id: 'minimax-oauth',
    name: 'MiniMax',
    nameKey: 'MiniMax',
    logo: minimaxLogo,
    isOAuth: true,
  },
  {
    id: 'skillsfan-credits',
    name: 'SkillsFan',
    nameKey: 'SkillsFan Credits',
    logo: skillsfanLogo,
    isOAuth: true,
  },
]

/**
 * Custom API providers (user brings their own API key)
 */
const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'zhipu',
    name: 'Zhipu GLM',
    nameKey: 'Zhipu GLM',
    logo: zhipuLogo,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    nameKey: 'MiniMax',
    logo: minimaxLogo,
  },
  {
    id: 'kimi',
    name: 'Kimi',
    nameKey: 'Kimi',
    logo: kimiLogo,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    nameKey: 'DeepSeek',
    logo: deepseekLogo,
  },
  {
    id: 'claude',
    name: 'Claude',
    nameKey: 'Claude',
    logo: claudeLogo,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    nameKey: 'OpenAI',
    logo: openaiLogo,
  },
  {
    id: 'custom',
    name: '自定义',
    nameKey: 'Custom',
    isCustom: true
  }
]

interface LoginSelectorProps {
  onSelectProvider: (providerId: string) => void
  onBack?: () => void  // Optional back button handler (e.g., from onboarding)
  onSkip?: () => void  // Optional skip button handler (set up later)
}

export function LoginSelector({ onSelectProvider, onBack, onSkip }: LoginSelectorProps) {
  const { t } = useTranslation()

  // Language selector state
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false)
  const [currentLang, setCurrentLang] = useState<LocaleCode>(getCurrentLanguage())

  // Handle language change
  const handleLanguageChange = (lang: LocaleCode) => {
    setLanguage(lang)
    setCurrentLang(lang)
    setIsLangDropdownOpen(false)
  }

  return (
    <div className="h-full w-full flex flex-col items-center bg-white pt-[12vh] px-8 relative overflow-y-auto">
      {/* Back Button - Top Left (when coming from onboarding) */}
      {onBack && (
        <div className="absolute top-6 left-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('onboarding.back')}
          </button>
        </div>
      )}

      {/* Language Selector - Top Right */}
      <div className="absolute top-6 right-6">
        <div className="relative">
          <button
            onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
              <div className="absolute right-0 mt-1 py-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                {Object.entries(SUPPORTED_LOCALES).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => handleLanguageChange(code as LocaleCode)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors ${
                      currentLang === code ? 'text-orange-600 font-medium' : 'text-gray-900'
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

      {/* Header with Logo */}
      <div className="flex flex-col items-center mb-10 mt-8">
        <HaloLogo size={80} animated={false} />
        <h1 className="mt-4 text-3xl font-bold tracking-wide text-gray-900">技能范</h1>
      </div>

      {/* Main content */}
      <div className="w-full max-w-xl">
        {/* Custom API Provider Grid */}
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
          <h3 className="text-sm text-gray-500 mb-4">{t('Custom API Key')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectProvider(preset.id)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-orange-500 hover:bg-orange-50 transition-all"
              >
                {/* Logo or Icon */}
                <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                  {preset.logo ? (
                    <img src={preset.logo} alt={preset.name} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center rounded-lg">
                      <Settings className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                </div>

                {/* Name */}
                <span className="text-sm font-medium text-gray-700">
                  {preset.isCustom ? t(preset.nameKey) : preset.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Skip button - set up later */}
        {onSkip && (
          <button
            onClick={onSkip}
            className="mt-6 w-full py-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            {t('setup.skipForNow')}
          </button>
        )}
      </div>
    </div>
  )
}
