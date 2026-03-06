/**
 * Settings Page - App configuration
 */

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { useUpdaterStore } from '../stores/updater.store'
import { api } from '../api'
import type { HaloConfig, ThemeMode, McpServersConfig, AISourceType, OAuthSourceConfig, ApiProvider, CustomSourceConfig } from '../types'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../types'
import { Select } from '../components/ui/Select'

/**
 * Localized text - either a simple string or object with language codes
 */
type LocalizedText = string | Record<string, string>

// Auth provider config from product.json
interface AuthProviderConfig {
  type: string
  displayName: LocalizedText
  description: LocalizedText
  icon: string
  iconBgColor: string
  recommended: boolean
  enabled: boolean
}
import { CheckCircle2, XCircle, Eye, EyeOff } from '../components/icons/ToolIcons'
import { McpServerList } from '../components/settings/McpServerList'
import { SkillList } from '../components/settings/SkillList'
import { SkillsFanAccountSection } from '../components/settings/SkillsFanAccountSection'
import { SpaceManagementSection } from '../components/settings/SpaceManagementSection'
import { ResetSection } from '../components/settings/ResetSection'
import { ScheduledTasksSection } from '../components/settings/ScheduledTasksSection'
import { FeishuSettings } from '../components/settings/FeishuSettings'
import { useTranslation, setLanguage, getCurrentLanguage, SUPPORTED_LOCALES, type LocaleCode } from '../i18n'
import { Loader2, LogOut, Plus, Check, Globe, Key, MessageSquare, Bot, Palette, Server, Settings as SettingsIcon, Wifi, ExternalLink, X, Package, User, Layers, Lock, SlidersHorizontal, Clock, ArrowLeft, type LucideIcon } from 'lucide-react'
import { usePlatform } from '../components/layout/Header'
import { isElectron } from '../api/transport'
import { useToastStore } from '../stores/toast.store'
import { getProviderLogoById } from '../components/layout/ModelSelector'
import type { SkillsFanAuthState } from '../../shared/types/skillsfan'

// Import provider logos
import zhipuLogo from '../assets/providers/zhipu.jpg'
import minimaxLogo from '../assets/providers/minimax.jpg'
import kimiLogo from '../assets/providers/kimi.jpg'
import deepseekLogo from '../assets/providers/deepseek.jpg'
import claudeLogo from '../assets/providers/claude.jpg'
import openaiLogo from '../assets/providers/openai.jpg'

// Provider presets for the grid
interface ProviderPreset {
  id: string
  name: string
  nameKey: string
  apiUrl?: string
  defaultModel?: string
  logo?: string
  apiType: 'anthropic' | 'openai' | 'custom'
  isCustom?: boolean
  docsUrl?: string
  apiDocsUrl?: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'zhipu',
    name: 'Zhipu GLM',
    nameKey: 'Zhipu GLM',
    apiUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'GLM-5',
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
    defaultModel: 'MiniMax-M2.1',
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

const OAUTH_PROVIDER_TO_PRESET: Record<string, string> = {
  'glm': 'zhipu',
  'minimax-oauth': 'minimax'
}

function normalizeProviderType(provider?: string, fallback: ApiProvider = 'anthropic'): ApiProvider {
  if (provider === 'openai') return 'openai'
  if (provider === 'anthropic') return 'anthropic'
  return fallback
}

function resolveInitialSelectedProviderId(config?: HaloConfig): string {
  const current = config?.aiSources?.current
  if (current && current !== 'oauth' && PROVIDER_PRESETS.some(p => p.id === current)) {
    return current
  }

  if (current && OAUTH_PROVIDER_TO_PRESET[current] && PROVIDER_PRESETS.some(p => p.id === OAUTH_PROVIDER_TO_PRESET[current])) {
    return OAUTH_PROVIDER_TO_PRESET[current]
  }

  // Only try URL matching when no current source is set (fresh install with legacy config)
  if (!current) {
    const currentApiUrl = config?.aiSources?.custom?.apiUrl || config?.api?.apiUrl || ''
    const matchedPreset = PROVIDER_PRESETS.find(p => p.apiUrl && currentApiUrl.includes(p.apiUrl.replace('https://', '').split('/')[0]))
    if (matchedPreset) return matchedPreset.id
  }

  return PROVIDER_PRESETS[0].id
}

function resolveProviderFormValues(config: HaloConfig | undefined, providerId: string): {
  provider: ApiProvider
  apiKey: string
  apiUrl: string
  model: string
} {
  const preset = PROVIDER_PRESETS.find(p => p.id === providerId)
  const savedConfig = config?.aiSources?.[providerId] as Partial<CustomSourceConfig> | undefined

  if (savedConfig?.apiKey) {
    const fallbackProvider = preset?.apiType === 'openai' ? 'openai' : 'anthropic'
    return {
      provider: normalizeProviderType(savedConfig.provider, fallbackProvider),
      apiKey: savedConfig.apiKey || '',
      apiUrl: savedConfig.apiUrl || preset?.apiUrl || '',
      model: savedConfig.model || preset?.defaultModel || DEFAULT_MODEL
    }
  }

  if (preset && !preset.isCustom) {
    return {
      provider: preset.apiType === 'openai' ? 'openai' : 'anthropic',
      apiKey: '',
      apiUrl: preset.apiUrl || '',
      model: preset.defaultModel || DEFAULT_MODEL
    }
  }

  const customConfig = config?.aiSources?.custom
  const legacyApi = config?.api
  return {
    provider: normalizeProviderType(customConfig?.provider || legacyApi?.provider, 'anthropic'),
    apiKey: customConfig?.apiKey || legacyApi?.apiKey || '',
    apiUrl: customConfig?.apiUrl || legacyApi?.apiUrl || '',
    model: customConfig?.model || legacyApi?.model || DEFAULT_MODEL
  }
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

// Icon mapping for dynamic rendering
const ICON_MAP: Record<string, LucideIcon> = {
  globe: Globe,
  key: Key,
  'message-square': MessageSquare,
}

// Get icon component by name
function getIconComponent(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || Globe
}

// Remote access status type
interface RemoteAccessStatus {
  enabled: boolean
  server: {
    running: boolean
    port: number
    token: string | null
    localUrl: string | null
    lanUrl: string | null
  }
  tunnel: {
    status: 'stopped' | 'starting' | 'running' | 'error'
    url: string | null
    error: string | null
  }
  clients: number
}

// Settings section type
type SettingsSection = 'ai-model' | 'display' | 'mcp' | 'skills' | 'system' | 'remote' | 'feishu' | 'account' | 'spaces' | 'advanced' | 'scheduled'

export function SettingsPage() {
  const { t } = useTranslation()
  const { config, setConfig, goBack, settingsSection, setSettingsSection } = useAppStore()
  const { currentSpace } = useSpaceStore()
  const { addToast } = useToastStore()
  const platform = usePlatform()
  const isInElectron = isElectron()
  const macTrafficLightPadding = isInElectron && platform.isMac

  // Active section state - use settingsSection from store if available
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => {
    return settingsSection || 'ai-model'
  })

  // Clear settingsSection from store after reading
  useEffect(() => {
    if (settingsSection) {
      setSettingsSection(null)
    }
  }, [])

  // AI Source state
  const [currentSource, setCurrentSource] = useState<AISourceType>(config?.aiSources?.current || 'custom')
  const [showCustomApiForm, setShowCustomApiForm] = useState(false)

  // Selected provider in the grid - initialize from current source/config
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => resolveInitialSelectedProviderId(config))
  const initialProviderFormValues = resolveProviderFormValues(config, selectedProviderId)

  // OAuth providers state (dynamic from product.json)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])
  const [loginState, setLoginState] = useState<{
    provider: string
    status: string
    userCode?: string
    verificationUri?: string
    error?: boolean
  } | null>(null)
  const [loggingOutProvider, setLoggingOutProvider] = useState<string | null>(null)

  // Custom API local state for editing
  const [apiKey, setApiKey] = useState(initialProviderFormValues.apiKey)
  const [apiUrl, setApiUrl] = useState(initialProviderFormValues.apiUrl)
  const [provider, setProvider] = useState<ApiProvider>(initialProviderFormValues.provider)
  const [model, setModel] = useState(initialProviderFormValues.model)
  const [theme, setTheme] = useState<ThemeMode>(config?.appearance?.theme || 'system')
  // Custom model toggle: enable by default if current model is not in preset list
  const [useCustomModel, setUseCustomModel] = useState(() => {
    return !AVAILABLE_MODELS.some(m => m.id === initialProviderFormValues.model)
  })

  // Connection status
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    message?: string
  } | null>(null)

  // Remote access state
  const [authState, setAuthState] = useState<SkillsFanAuthState | null>(null)
  const [remoteStatus, setRemoteStatus] = useState<RemoteAccessStatus | null>(null)
  const [isEnablingRemote, setIsEnablingRemote] = useState(false)
  const [isEnablingTunnel, setIsEnablingTunnel] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isEditingPassword, setIsEditingPassword] = useState(false)
  const [customPassword, setCustomPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  // System settings state
  const [autoLaunch, setAutoLaunch] = useState(config?.system?.autoLaunch || false)
  const [minimizeToTray, setMinimizeToTray] = useState(config?.system?.minimizeToTray || false)

  // Advanced settings state
  const [showClearMemoryDialog, setShowClearMemoryDialog] = useState(false)
  const [clearMemoryScope, setClearMemoryScope] = useState<'space' | 'all'>('space')
  const [isClearingMemory, setIsClearingMemory] = useState(false)

  // API Key visibility state
  const [showApiKey, setShowApiKey] = useState(false)

  // Version update state (from shared store)
  const { status: updateStatus, currentVersion: appVersion, latestVersion, downloadProgress } = useUpdaterStore()
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)

  // Load SkillsFan auth state for permission checks
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const result = await api.skillsfanGetAuthState()
        if (result.success) setAuthState(result.data)
      } catch { /* ignore */ }
    }
    loadAuthState()
    const unsubLogin = api.onSkillsFanLoginSuccess(() => loadAuthState())
    const unsubLogout = api.onSkillsFanLogout(() => setAuthState({ isLoggedIn: false }))
    return () => { unsubLogin(); unsubLogout() }
  }, [])

  // Load remote access status
  useEffect(() => {
    loadRemoteStatus()

    // Listen for status changes
    const unsubscribe = api.onRemoteStatusChange((data) => {
      setRemoteStatus(data as RemoteAccessStatus)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Reset checking state when update status changes
  useEffect(() => {
    if (updateStatus !== 'checking') {
      setIsCheckingUpdate(false)
    }
  }, [updateStatus])

  // Handler for check updates button
  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true)
    try {
      await api.checkForUpdates()
    } finally {
      // Reset after a short delay to ensure status event has time to arrive
      setTimeout(() => setIsCheckingUpdate(false), 3000)
    }
  }

  // Handler for download update button
  const handleDownloadUpdate = async () => {
    await api.downloadUpdate()
  }

  // Handler for install update button
  const handleInstallUpdate = () => {
    api.installUpdate()
  }

  // Handler for opening download page (fallback)
  const handleOpenDownloadPage = () => {
    api.openDownloadPage()
  }

  // Load auth providers and refresh AI sources config
  useEffect(() => {
    // Load available auth providers from product.json
    api.authGetProviders().then((result) => {
      if (result.success && result.data) {
        setAuthProviders(result.data as AuthProviderConfig[])
      }
    })

    // Refresh AI sources config
    api.refreshAISourcesConfig().then((result) => {
      if (result.success) {
        console.log('[Settings] AI sources config refreshed')
        api.getConfig().then((configResult) => {
          if (configResult.success) {
            setConfig(configResult.data)
          }
        })
      }
    })

    // Listen for auth login progress
    const unsubscribe = api.onAuthLoginProgress((data: { provider: string; status: string }) => {
      setLoginState(data)
      if (data.status === 'completed' || data.status === 'failed') {
        // Reload config after login completes
        setTimeout(() => {
          api.getConfig().then((configResult) => {
            if (configResult.success) {
              setConfig(configResult.data)
            }
          })
          setLoginState(null)
        }, 500)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Load system settings
  useEffect(() => {
    loadSystemSettings()
  }, [])

  const loadSystemSettings = async () => {
    try {
      const [autoLaunchRes, minimizeRes] = await Promise.all([
        api.getAutoLaunch(),
        api.getMinimizeToTray()
      ])
      if (autoLaunchRes.success) {
        setAutoLaunch(autoLaunchRes.data as boolean)
      }
      if (minimizeRes.success) {
        setMinimizeToTray(minimizeRes.data as boolean)
      }
    } catch (error) {
      console.error('[Settings] Failed to load system settings:', error)
    }
  }

  // Load QR code when remote is enabled
  useEffect(() => {
    if (remoteStatus?.enabled) {
      loadQRCode()
    } else {
      setQrCode(null)
    }
  }, [remoteStatus?.enabled, remoteStatus?.tunnel.url])

  const loadRemoteStatus = async () => {
    console.log('[Settings] loadRemoteStatus called')
    try {
      const response = await api.getRemoteStatus()
      console.log('[Settings] getRemoteStatus response:', response)
      if (response.success && response.data) {
        setRemoteStatus(response.data as RemoteAccessStatus)
      }
    } catch (error) {
      console.error('[Settings] loadRemoteStatus error:', error)
    }
  }

  const loadQRCode = async () => {
    const response = await api.getRemoteQRCode(false) // URL only, user enters password on device
    if (response.success && response.data) {
      setQrCode((response.data as any).qrCode)
    }
  }

  const handleToggleRemote = async () => {
    // Permission check: not logged in
    if (!authState?.isLoggedIn) {
      addToast(t('Please log in to use this feature'), 'info')
      return
    }
    console.log('[Settings] handleToggleRemote called, current status:', remoteStatus?.enabled)

    if (remoteStatus?.enabled) {
      // Disable
      console.log('[Settings] Disabling remote access...')
      const response = await api.disableRemoteAccess()
      console.log('[Settings] Disable response:', response)
      setRemoteStatus(null)
      setQrCode(null)
    } else {
      // Enable
      console.log('[Settings] Enabling remote access...')
      setIsEnablingRemote(true)
      try {
        const response = await api.enableRemoteAccess()
        console.log('[Settings] Enable response:', response)
        if (response.success && response.data) {
          setRemoteStatus(response.data as RemoteAccessStatus)
        } else {
          console.error('[Settings] Enable failed:', response.error)
        }
      } catch (error) {
        console.error('[Settings] Enable error:', error)
      } finally {
        setIsEnablingRemote(false)
      }
    }
  }

  const handleToggleTunnel = async () => {
    if (remoteStatus?.tunnel.status === 'running') {
      // Disable tunnel
      await api.disableTunnel()
    } else {
      // Enable tunnel
      setIsEnablingTunnel(true)
      try {
        await api.enableTunnel()
      } finally {
        setIsEnablingTunnel(false)
      }
    }
    loadRemoteStatus()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Auto-save helper for appearance settings
  const autoSave = useCallback(async (partialConfig: Partial<HaloConfig>) => {
    const newConfig = { ...config, ...partialConfig } as HaloConfig
    await api.setConfig(partialConfig)
    setConfig(newConfig)
  }, [config, setConfig])

  // Handle theme change with auto-save
  const handleThemeChange = async (value: ThemeMode) => {
    setTheme(value)
    // Sync to localStorage immediately (for anti-flash on reload)
    try {
      localStorage.setItem('skillsfan-theme', value)
    } catch (e) { /* ignore */ }
    await autoSave({
      appearance: { theme: value }
    })
  }

  // Handle auto launch change
  const handleAutoLaunchChange = async (enabled: boolean) => {
    setAutoLaunch(enabled)
    try {
      await api.setAutoLaunch(enabled)
    } catch (error) {
      console.error('[Settings] Failed to set auto launch:', error)
      setAutoLaunch(!enabled) // Revert on error
    }
  }

  // Handle minimize to tray change
  const handleMinimizeToTrayChange = async (enabled: boolean) => {
    setMinimizeToTray(enabled)
    try {
      await api.setMinimizeToTray(enabled)
    } catch (error) {
      console.error('[Settings] Failed to set minimize to tray:', error)
      setMinimizeToTray(!enabled) // Revert on error
    }
  }

  // Handle memory enabled change
  const handleMemoryEnabledChange = async (enabled: boolean) => {
    const memoryConfig = { enabled, retentionDays: config?.memory?.retentionDays ?? 0 }
    try {
      await api.setConfig({ memory: memoryConfig })
      setConfig({ ...config!, memory: memoryConfig } as HaloConfig)
    } catch (error) {
      console.error('[Settings] Failed to update memory config:', error)
    }
  }

  // Handle memory retention change
  const handleRetentionChange = async (days: number) => {
    const memoryConfig = { enabled: config?.memory?.enabled ?? true, retentionDays: days }
    try {
      await api.setConfig({ memory: memoryConfig })
      setConfig({ ...config!, memory: memoryConfig } as HaloConfig)
    } catch (error) {
      console.error('[Settings] Failed to update memory retention:', error)
    }
  }

  // Handle clear memory
  const handleClearMemory = async () => {
    setIsClearingMemory(true)
    try {
      const spaceId = clearMemoryScope === 'space' ? currentSpace?.id : undefined
      const result = await api.clearMemory(clearMemoryScope, spaceId)
      if (result.success) {
        addToast(t('Memory cleared successfully'), 'success')
      } else {
        addToast(result.error || t('Failed to clear memory'), 'error')
      }
    } catch {
      addToast(t('Failed to clear memory'), 'error')
    } finally {
      setIsClearingMemory(false)
      setShowClearMemoryDialog(false)
    }
  }

  // Handle MCP servers save
  const handleMcpServersSave = async (servers: McpServersConfig) => {
    await api.setConfig({ mcpServers: servers })
    setConfig({ ...config, mcpServers: servers } as HaloConfig)
  }

  // Handle source switch
  const handleSwitchSource = async (source: AISourceType) => {
    setCurrentSource(source)
    const newConfig = {
      aiSources: {
        ...config?.aiSources,
        current: source
      }
    }
    await api.setConfig(newConfig)
    setConfig({ ...config, ...newConfig } as HaloConfig)
  }

  // Handle OAuth login (generic - works for any provider)
  const handleOAuthLogin = async (providerType: string) => {
    try {
      setLoginState({ provider: providerType, status: t('Starting login...') })
      const result = await api.authStartLogin(providerType)
      if (!result.success) {
        console.error('[Settings] OAuth login start failed:', result.error)
        setLoginState(null)
        return
      }

      // Get state and device code info from start result
      const { state, userCode, verificationUri } = result.data as {
        loginUrl: string
        state: string
        userCode?: string
        verificationUri?: string
      }

      // Update login state with device code info if available
      setLoginState({
        provider: providerType,
        status: userCode ? t('Enter the code in your browser') : t('Waiting for login...'),
        userCode,
        verificationUri
      })

      // Complete login - this polls for the token until user completes login
      const completeResult = await api.authCompleteLogin(providerType, state)
      if (!completeResult.success) {
        console.error('[Settings] OAuth login complete failed:', completeResult.error)
        setLoginState({
          provider: providerType,
          status: t(completeResult.error || 'Login failed'),
          error: true
        })
        return
      }

      // Success! Reload config
      const configResult = await api.getConfig()
      if (configResult.success && configResult.data) {
        setConfig(configResult.data as HaloConfig)
        setCurrentSource(providerType as AISourceType)
      }
      setLoginState(null)
    } catch (err) {
      console.error('[Settings] OAuth login error:', err)
      setLoginState(null)
    }
  }

  // Handle OAuth logout (generic - works for any provider)
  const handleOAuthLogout = async (providerType: string) => {
    try {
      setLoggingOutProvider(providerType)
      await api.authLogout(providerType)
      // Reload config
      const configResult = await api.getConfig()
      if (configResult.success && configResult.data) {
        setConfig(configResult.data as HaloConfig)
        // Switch to custom if available
        if (config?.aiSources?.custom?.apiKey) {
          setCurrentSource('custom')
        }
      }
    } catch (err) {
      console.error('[Settings] OAuth logout error:', err)
    } finally {
      setLoggingOutProvider(null)
    }
  }

  // Handle OAuth model change (generic - works for any provider)
  const handleOAuthModelChange = async (providerType: string, modelId: string) => {
    const providerConfig = config?.aiSources?.[providerType] as OAuthSourceConfig | undefined
    if (!providerConfig) return

    const newConfig = {
      aiSources: {
        ...config?.aiSources,
        [providerType]: {
          ...providerConfig,
          model: modelId
        }
      }
    }
    await api.setConfig(newConfig)
    setConfig({ ...config, ...newConfig } as HaloConfig)
  }

  // Handle save Custom API - use provider ID as storage key to support multiple APIs
  const handleSaveCustomApi = async () => {
    setIsValidating(true)
    setValidationResult(null)

    try {
      // Use provider ID as the storage key (e.g., 'zhipu', 'deepseek', 'openai', 'claude', 'custom')
      const storageKey = selectedProviderId

      const providerConfig = {
        provider,
        apiKey,
        apiUrl,
        model
      }

      const updates = {
        api: providerConfig,  // Legacy field for backward compatibility
        aiSources: {
          ...config?.aiSources,
          current: storageKey as AISourceType,
          [storageKey]: providerConfig  // Store under provider ID key
        }
      }
      await api.setConfig(updates)
      setConfig({ ...config, ...updates } as HaloConfig)
      setCurrentSource(storageKey as AISourceType)
      setValidationResult({ valid: true, message: t('Saved') })
      setShowCustomApiForm(false)
      goBack()  // Close the modal immediately after successful save
    } catch (error) {
      setValidationResult({ valid: false, message: t('Save failed') })
    } finally {
      setIsValidating(false)
    }
  }

  // Handle back - return to previous view (not always home)
  const handleBack = () => {
    goBack()
  }

  // Navigation items configuration
  const navItems: { id: SettingsSection; icon: LucideIcon; label: string; desktopOnly?: boolean; hidden?: boolean }[] = [
    { id: 'account', icon: User, label: t('Account'), desktopOnly: true },
    { id: 'ai-model', icon: Bot, label: t('AI Model') },
    { id: 'skills', icon: Package, label: t('Skills') },
    { id: 'spaces', icon: Layers, label: t('Spaces'), desktopOnly: true },
    { id: 'system', icon: SettingsIcon, label: t('System'), desktopOnly: true },
    { id: 'advanced', icon: SlidersHorizontal, label: t('Advanced'), desktopOnly: true },
    { id: 'mcp', icon: Server, label: t('MCP Servers'), hidden: true },
    { id: 'display', icon: Palette, label: t('Display & Language') },
    { id: 'feishu', icon: MessageSquare, label: t('Message Channels'), desktopOnly: true },
    { id: 'scheduled', icon: Clock, label: t('Scheduled Tasks'), desktopOnly: true },
    { id: 'remote', icon: Wifi, label: t('Remote Access'), desktopOnly: true },
  ]

  return (
    <div className="h-full w-full flex bg-card">
      {/* Left sidebar navigation */}
      <nav className={`w-56 border-r border-border/50 flex flex-col bg-accent/40 ${macTrafficLightPadding ? 'pt-8' : ''}`}>
        {/* macOS drag region */}
        {macTrafficLightPadding && <div className="h-2 drag-region" />}

        {/* Back button */}
        <div className="px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors no-drag"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('Back to app')}
          </button>
        </div>

        <div className="flex-1 p-2 space-y-0.5">
          {navItems
            .filter(item => !item.hidden && (!item.desktopOnly || !api.isRemoteMode()))
            .map(item => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full min-h-[36px] flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-secondary text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                </button>
              )
            })}
        </div>

        {/* About section at bottom */}
        <div className="p-3 border-t border-border/50">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between items-center">
              <span>{t('Version')}</span>
              <span className="font-mono flex items-center gap-1.5">
                {appVersion}
                {updateStatus === 'available' && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" title={t('New version available')} />
                )}
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Right content area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Content header with title */}
        <div className={`flex items-center px-8 py-5 border-b border-border/50 ${macTrafficLightPadding ? 'pt-12 drag-region' : ''}`}>
          <h2 className="text-xl font-semibold no-drag">
            {navItems.find(item => item.id === activeSection)?.label}
          </h2>
        </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-3xl">

          {/* SkillsFan Account Section */}
          {activeSection === 'account' && !api.isRemoteMode() && (
          <>
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-4">{t('SkillsFan Account')}</h2>
              <SkillsFanAccountSection />
            </section>

            {/* Reset to Default Section */}
            <ResetSection />
          </>
          )}

          {/* AI Model Section - Grid Layout */}
          {activeSection === 'ai-model' && (
          <section className="space-y-6">
            {/* Account Login - OAuth Providers */}
            {authProviders.filter(p => p.type !== 'custom' && p.enabled).length > 0 && (
              <div>
                <h3 className="text-sm text-muted-foreground mb-4">{t('Account Login')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {authProviders
                    .filter(p => p.type !== 'custom' && p.enabled)
                    .map(p => {
                      const providerConfig = config?.aiSources?.[p.type] as OAuthSourceConfig | undefined
                      const isLoggedIn = providerConfig?.loggedIn === true
                      const isLoggingIn = loginState?.provider === p.type
                      const isLoggingOut = loggingOutProvider === p.type
                      const displayName = typeof p.displayName === 'string'
                        ? p.displayName
                        : (p.displayName as Record<string, string>)[getCurrentLanguage()] || (p.displayName as Record<string, string>)['en'] || p.type
                      const description = typeof p.description === 'string'
                        ? p.description
                        : (p.description as Record<string, string>)[getCurrentLanguage()] || (p.description as Record<string, string>)['en'] || ''
                      const logo = getProviderLogoById(p.type)

                      return (
                        <div key={p.type}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border">
                          <div className="w-10 h-10 rounded-lg overflow-hidden">
                            {logo ? (
                              <img src={logo} alt={displayName}
                                className="w-full h-full object-cover rounded-lg" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center rounded-lg"
                                style={{ backgroundColor: p.iconBgColor }}>
                                <span className="text-white text-xs font-bold">
                                  {displayName.slice(0, 2)}
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium">{displayName}</span>
                          <span className="text-xs text-muted-foreground text-center">
                            {isLoggedIn && providerConfig?.userEmail
                              ? providerConfig.userEmail
                              : description}
                          </span>
                          {isLoggedIn ? (
                            <button onClick={() => handleOAuthLogout(p.type)} disabled={isLoggingOut}
                              className="mt-1 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
                              {isLoggingOut ? <Loader2 className="w-3 h-3 animate-spin" /> : t('Log Out')}
                            </button>
                          ) : (
                            <button onClick={() => handleOAuthLogin(p.type)} disabled={isLoggingIn}
                              className="mt-1 px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                              {isLoggingIn ? <Loader2 className="w-3 h-3 animate-spin" /> : t('Log In')}
                            </button>
                          )}
                        </div>
                      )
                    })}
                </div>
                {loginState && (
                  <div className={`mt-3 rounded-lg p-3 text-sm ${
                    loginState.error
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-secondary/50 text-muted-foreground'
                  }`}>
                    {loginState.error ? (
                      <div className="space-y-2">
                        <p>{loginState.status}</p>
                        <button
                          onClick={() => setLoginState(null)}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >{t('Dismiss')}</button>
                      </div>
                    ) : loginState.userCode ? (
                      <div className="space-y-1">
                        <p>{loginState.status}</p>
                        <code className="text-primary font-mono text-lg">{loginState.userCode}</code>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{loginState.status}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Provider Grid */}
            <div>
              <h3 className="text-sm text-muted-foreground mb-4">{t('Select AI Provider')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {PROVIDER_PRESETS.map((preset) => {
                  const isSelected = selectedProviderId === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedProviderId(preset.id)
                        const values = resolveProviderFormValues(config, preset.id)
                        setApiKey(values.apiKey)
                        setApiUrl(values.apiUrl)
                        setModel(values.model)
                        setProvider(values.provider)
                        setUseCustomModel(!AVAILABLE_MODELS.some(m => m.id === values.model))
                      }}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-primary/5'
                      }`}
                    >
                      {/* Logo or Icon */}
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                        {preset.logo ? (
                          <img src={preset.logo} alt={preset.name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <div className="w-full h-full bg-muted/50 flex items-center justify-center rounded-lg">
                            <SettingsIcon className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Name */}
                      <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                        {preset.isCustom ? t(preset.nameKey) : preset.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* API Configuration Form */}
            {(() => {
              const currentPreset = PROVIDER_PRESETS.find(p => p.id === selectedProviderId)
              if (!currentPreset) return null

              return (
                <div className="bg-card rounded-xl border border-border p-5 space-y-5">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                      {currentPreset.logo ? (
                        <img src={currentPreset.logo} alt={currentPreset.name} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-full bg-muted/50 flex items-center justify-center rounded-lg">
                          <SettingsIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium">{currentPreset.isCustom ? t('Custom') : currentPreset.name}</h3>
                      <p className="text-xs text-muted-foreground">{t('Configure API')}</p>
                    </div>
                  </div>

                  {/* API Key */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-muted-foreground">API Key</label>
                      {currentPreset.docsUrl && (
                        <a
                          href={currentPreset.docsUrl}
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
                        placeholder={currentPreset.apiType === 'openai' ? 'sk-xxxxxxxxxxxxx' : 'sk-ant-xxxxxxxxxxxxx'}
                        className="w-full px-3 py-2 pr-10 text-sm bg-input rounded-lg border border-border focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* API URL */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-muted-foreground">{t('API URL')}</label>
                      {currentPreset.apiDocsUrl && (
                        <a
                          href={currentPreset.apiDocsUrl}
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
                      placeholder={currentPreset.apiUrl || 'https://...'}
                      className="w-full px-3 py-2 text-sm bg-input rounded-lg border border-border focus:outline-none transition-colors"
                    />
                    {!currentPreset.isCustom && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('Default URL is pre-filled, you can modify it')}
                      </p>
                    )}
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">{t('Model')}</label>
                    {selectedProviderId === 'claude' ? (
                      <>
                        {useCustomModel ? (
                          <input
                            type="text"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="claude-sonnet-4-5-20250929"
                            className="w-full px-3 py-2 text-sm bg-input rounded-lg border border-border focus:outline-none transition-colors"
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
                            <span className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                              useCustomModel ? 'bg-primary border-primary' : 'border-border bg-input'
                            }`}>
                              {useCustomModel && <Check className="w-3 h-3 text-primary-foreground" />}
                            </span>
                            <input
                              type="checkbox"
                              checked={useCustomModel}
                              onChange={(e) => {
                                setUseCustomModel(e.target.checked)
                                if (!e.target.checked && !AVAILABLE_MODELS.some(m => m.id === model)) {
                                  setModel(DEFAULT_MODEL)
                                }
                              }}
                              className="sr-only"
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
                          placeholder={currentPreset.defaultModel || 'model-name'}
                          className="w-full px-3 py-2 text-sm bg-input rounded-lg border border-border focus:outline-none transition-colors"
                        />
                        {!currentPreset.isCustom && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('Default model is pre-filled, you can modify it')}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleSaveCustomApi}
                      disabled={isValidating || !apiKey}
                      className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isValidating ? t('Saving...') : t('Save')}
                    </button>
                    {validationResult && (
                      <span className={`text-xs flex items-center gap-1 ${validationResult.valid ? 'text-green-500' : 'text-red-500'}`}>
                        {validationResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {validationResult.message}
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}
          </section>
          )}

          {/* Display & Language Section */}
          {activeSection === 'display' && (
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-medium mb-4">{t('Display & Language')}</h2>

            <div className="space-y-6">
              {/* Theme */}
              <div>
                <label className="block text-sm text-muted-foreground mb-2">{t('Theme')}</label>
                <div className="flex gap-3">
                  {(['light', 'dark', 'system'] as ThemeMode[]).map((themeMode) => (
                    <button
                      key={themeMode}
                      onClick={() => handleThemeChange(themeMode)}
                      className={`px-4 py-2 rounded-lg transition-colors ${theme === themeMode
                        ? 'bg-primary/10 text-primary border border-primary'
                        : 'bg-secondary hover:bg-secondary/80'
                        }`}
                    >
                      {themeMode === 'light' ? t('Light') : themeMode === 'dark' ? t('Dark') : t('Follow System')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="pt-4 border-t border-border">
                <label className="block text-sm text-muted-foreground mb-2">{t('Language')}</label>
                <Select
                  value={getCurrentLanguage()}
                  onChange={(v) => setLanguage(v as LocaleCode)}
                  options={Object.entries(SUPPORTED_LOCALES).map(([code, name]) => ({
                    value: code,
                    label: name
                  }))}
                />
              </div>
            </div>
          </section>
          )}

          {/* System Section */}
          {activeSection === 'system' && !api.isRemoteMode() && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-4">{t('System')}</h2>

              <div className="space-y-4">
                {/* Auto Launch */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{t('Auto Launch on Startup')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('Automatically run Halo when system starts')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoLaunch}
                      onChange={(e) => handleAutoLaunchChange(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted-foreground/40 rounded-full peer peer-checked:bg-primary transition-colors">
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${autoLaunch ? 'translate-x-5' : 'translate-x-0.5'
                          } mt-0.5`}
                      />
                    </div>
                  </label>
                </div>

                {/* Minimize to Tray */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex-1">
                    <p className="font-medium">{t('Background Daemon')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('Minimize to {{trayType}} when closing window, instead of exiting the program', {
                        trayType: window.platform?.isMac ? t('menu bar') : t('system tray')
                      })}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={minimizeToTray}
                      onChange={(e) => handleMinimizeToTrayChange(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted-foreground/40 rounded-full peer peer-checked:bg-primary transition-colors">
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${minimizeToTray ? 'translate-x-5' : 'translate-x-0.5'
                          } mt-0.5`}
                      />
                    </div>
                  </label>
                </div>

                {/* Version Update */}
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{t('Version Update')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('Current version')}: <span className="font-mono">{appVersion}</span>
                        {(updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded') && latestVersion && (
                          <span className="ml-2 text-primary">
                            → {latestVersion} {updateStatus === 'downloaded' ? t('ready') : t('available')}
                          </span>
                        )}
                      </p>
                      {updateStatus === 'not-available' && (
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {t('Already latest version')}
                        </p>
                      )}
                      {updateStatus === 'downloading' && downloadProgress && (
                        <div className="mt-2 space-y-1">
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-primary h-full transition-all duration-300 ease-out"
                              style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {downloadProgress.percent.toFixed(0)}% - {(downloadProgress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s
                          </p>
                        </div>
                      )}
                      {updateStatus === 'downloaded' && (
                        <p className="text-xs text-green-600 mt-1">
                          {t('Update downloaded, restart to install')}
                        </p>
                      )}
                      {updateStatus === 'error' && (
                        <p className="text-xs text-red-500/70 mt-1">
                          {t('Update check failed')}
                        </p>
                      )}
                    </div>
                    {updateStatus === 'downloaded' ? (
                      <button
                        onClick={handleInstallUpdate}
                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                      >
                        {t('Restart to Install')}
                      </button>
                    ) : updateStatus === 'downloading' ? (
                      <button
                        disabled
                        className="px-4 py-2 bg-secondary text-secondary-foreground text-sm rounded-lg opacity-50 cursor-not-allowed"
                      >
                        {t('Downloading...')}
                      </button>
                    ) : updateStatus === 'available' ? (
                      <button
                        onClick={handleDownloadUpdate}
                        className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        {t('Download Update')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCheckForUpdates}
                          disabled={isCheckingUpdate}
                          className="px-4 py-2 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                        >
                          {isCheckingUpdate ? t('Checking...') : t('Check for Updates')}
                        </button>
                        {updateStatus === 'error' && (
                          <button
                            onClick={handleOpenDownloadPage}
                            className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
                          >
                            {t('Download from website')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Advanced Section */}
          {activeSection === 'advanced' && !api.isRemoteMode() && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-4">{t('Advanced')}</h2>

              <div className="space-y-4">
                {/* Cross-conversation Memory Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{t('Cross-conversation Memory')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('AI can remember content from previous conversations')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config?.memory?.enabled ?? true}
                      onChange={(e) => handleMemoryEnabledChange(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted-foreground/40 rounded-full peer peer-checked:bg-primary transition-colors">
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                          (config?.memory?.enabled ?? true) ? 'translate-x-5' : 'translate-x-0.5'
                        } mt-0.5`}
                      />
                    </div>
                  </label>
                </div>

                {/* Memory Retention Period */}
                <div className={`pt-4 border-t border-border transition-opacity ${(config?.memory?.enabled ?? true) ? '' : 'opacity-50 pointer-events-none'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{t('Memory Retention Period')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('How far back AI can recall conversations')}
                      </p>
                    </div>
                    <Select<number>
                      variant="compact"
                      value={config?.memory?.retentionDays ?? 0}
                      onChange={handleRetentionChange}
                      options={[
                        { value: 7, label: t('7 days') },
                        { value: 30, label: t('30 days') },
                        { value: 180, label: t('180 days') },
                        { value: 0, label: t('Forever') }
                      ]}
                    />
                  </div>
                </div>

                {/* Clear Memory Button */}
                <div className={`pt-4 border-t border-border transition-opacity ${(config?.memory?.enabled ?? true) ? '' : 'opacity-50 pointer-events-none'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{t('Clear Memory')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('Delete all conversation memory accumulated by AI')}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowClearMemoryDialog(true)}
                      className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/30"
                    >
                      {t('Clear Memory')}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Clear Memory Dialog */}
          {showClearMemoryDialog && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowClearMemoryDialog(false)
              }}
            >
              <div className="bg-background border border-border rounded-lg w-full max-w-sm shadow-lg">
                <div className="p-4 space-y-4">
                  <h3 className="font-medium text-foreground">{t('Clear Memory')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('This will delete all conversation memory accumulated by AI. This action cannot be undone.')}
                  </p>

                  {/* Scope selection */}
                  <div className="space-y-2">
                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50 transition-colors ${
                      clearMemoryScope === 'space' ? 'border-primary' : 'border-border'
                    }`}>
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 transition-colors ${
                        clearMemoryScope === 'space' ? 'border-primary' : 'border-muted-foreground/40'
                      }`}>
                        {clearMemoryScope === 'space' && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </span>
                      <input
                        type="radio"
                        name="clearScope"
                        value="space"
                        checked={clearMemoryScope === 'space'}
                        onChange={() => setClearMemoryScope('space')}
                        className="sr-only"
                      />
                      <div>
                        <p className="text-sm font-medium">{t('Current Space')}</p>
                        <p className="text-xs text-muted-foreground">
                          {currentSpace?.name || t('Default Space')}
                        </p>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50 transition-colors ${
                      clearMemoryScope === 'all' ? 'border-primary' : 'border-border'
                    }`}>
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 transition-colors ${
                        clearMemoryScope === 'all' ? 'border-primary' : 'border-muted-foreground/40'
                      }`}>
                        {clearMemoryScope === 'all' && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </span>
                      <input
                        type="radio"
                        name="clearScope"
                        value="all"
                        checked={clearMemoryScope === 'all'}
                        onChange={() => setClearMemoryScope('all')}
                        className="sr-only"
                      />
                      <div>
                        <p className="text-sm font-medium">{t('All Spaces')}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('Clear memory across all spaces')}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
                  <button
                    onClick={() => setShowClearMemoryDialog(false)}
                    className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    onClick={handleClearMemory}
                    disabled={isClearingMemory}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {isClearingMemory ? t('Clearing...') : t('Confirm Clear')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MCP Servers Section */}
          {activeSection === 'mcp' && (
          <section className="bg-card rounded-xl border border-border p-6">
            <McpServerList
              servers={config?.mcpServers || {}}
              onSave={handleMcpServersSave}
            />

            {/* Help text */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{t('Format compatible with Cursor / Claude Desktop')}</span>
                <a
                  href="https://modelcontextprotocol.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {t('Learn about MCP')} →
                </a>
              </div>
              <p className="text-xs text-amber-500/80">
                ⚠️ {t('Configuration changes will take effect after starting a new conversation')}
              </p>
            </div>
          </section>
          )}

          </div>{/* close max-w-2xl for full-width skills */}

          {/* Skills Section - full width */}
          {activeSection === 'skills' && (
          <section className="bg-card rounded-xl border border-border p-6">
            <SkillList />
          </section>
          )}

          <div className="max-w-2xl">{/* reopen max-w-2xl */}

          {/* Scheduled Tasks Section */}
          {activeSection === 'scheduled' && !api.isRemoteMode() && (
          <section className="bg-card rounded-xl border border-border p-6">
            <ScheduledTasksSection />
          </section>
          )}

          {/* Spaces Management Section */}
          {activeSection === 'spaces' && !api.isRemoteMode() && (
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-medium mb-4">{t('Space Management')}</h2>
            <SpaceManagementSection />
          </section>
          )}

          {/* Message Channels Section */}
          {activeSection === 'feishu' && !api.isRemoteMode() && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('Connect messaging platforms to control SkillsFan remotely via chat.')}
              </p>
              <FeishuSettings config={config as Record<string, unknown>} />
            </div>
          )}

          {/* Remote Access Section */}
          {activeSection === 'remote' && (
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-medium mb-4">{t('Remote Access')}</h2>

            {/* Security Warning */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-xl">⚠️</span>
                <div className="text-sm">
                  <p className="text-amber-500 font-medium mb-1">{t('Security Warning')}</p>
                  <p className="text-amber-500/80">
                    {t('After enabling remote access, anyone with the password can fully control your computer (read/write files, execute commands). Do not share the access password with untrusted people.')}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t('Enable Remote Access')}</p>
                    {!authState?.isLoggedIn && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        <Lock className="w-3 h-3" />
                        {t('Login Required')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('Allow access to Halo from other devices')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remoteStatus?.enabled || false}
                    onChange={handleToggleRemote}
                    disabled={isEnablingRemote}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors">
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${remoteStatus?.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        } mt-0.5`}
                    />
                  </div>
                </label>
              </div>

              {/* Remote Access Details */}
              {remoteStatus?.enabled && (
                <>
                  {/* Local Access */}
                  <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t('Local Address')}</span>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-background px-2 py-1 rounded">
                          {remoteStatus.server.localUrl}
                        </code>
                        <button
                          onClick={() => copyToClipboard(remoteStatus.server.localUrl || '')}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {t('Copy')}
                        </button>
                      </div>
                    </div>

                    {remoteStatus.server.lanUrl && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('LAN Address')}</span>
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-background px-2 py-1 rounded">
                            {remoteStatus.server.lanUrl}
                          </code>
                          <button
                            onClick={() => copyToClipboard(remoteStatus.server.lanUrl || '')}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {t('Copy')}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('Access Password')}</span>
                        {!isEditingPassword ? (
                          <div className="flex items-center gap-2">
                            <code className="text-sm bg-background px-2 py-1 rounded font-mono tracking-wider">
                              {showPassword ? remoteStatus.server.token : '••••••••'}
                            </code>
                            <button
                              onClick={() => setShowPassword(!showPassword)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {showPassword ? t('Hide') : t('Show')}
                            </button>
                            <button
                              onClick={() => copyToClipboard(remoteStatus.server.token || '')}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {t('Copy')}
                            </button>
                            <button
                              onClick={() => {
                                setIsEditingPassword(true)
                                setCustomPassword('')
                                setPasswordError(null)
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {t('Edit')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={customPassword}
                              onChange={(e) => {
                                setCustomPassword(e.target.value)
                                setPasswordError(null)
                              }}
                              placeholder={t('4-32 characters')}
                              maxLength={32}
                              className="w-32 px-2 py-1 text-sm bg-input rounded border border-border focus:outline-none"
                            />
                            <button
                              onClick={async () => {
                                if (customPassword.length < 4) {
                                  setPasswordError(t('Password too short'))
                                  return
                                }
                                setIsSavingPassword(true)
                                setPasswordError(null)
                                try {
                                  const res = await api.setRemotePassword(customPassword)
                                  if (res.success) {
                                    setIsEditingPassword(false)
                                    setCustomPassword('')
                                    loadRemoteStatus()
                                  } else {
                                    setPasswordError(res.error || t('Failed to set password'))
                                  }
                                } catch (error) {
                                  setPasswordError(t('Failed to set password'))
                                } finally {
                                  setIsSavingPassword(false)
                                }
                              }}
                              disabled={isSavingPassword || customPassword.length < 4}
                              className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                            >
                              {isSavingPassword ? t('Saving...') : t('Save')}
                            </button>
                            <button
                              onClick={() => {
                                setIsEditingPassword(false)
                                setCustomPassword('')
                                setPasswordError(null)
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {t('Cancel')}
                            </button>
                          </div>
                        )}
                      </div>
                      {passwordError && (
                        <p className="text-xs text-red-500">{passwordError}</p>
                      )}
                    </div>

                    {remoteStatus.clients > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('Connected Devices')}</span>
                        <span className="text-green-500">{t('{{count}} devices', { count: remoteStatus.clients })}</span>
                      </div>
                    )}
                  </div>

                  {/* Tunnel Section */}
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium">{t('Internet Access')}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('Get public address via Cloudflare (wait about 10 seconds for DNS resolution after startup)')}
                        </p>
                      </div>
                      <button
                        onClick={handleToggleTunnel}
                        disabled={isEnablingTunnel}
                        className={`px-4 py-2 rounded-lg text-sm transition-colors ${remoteStatus.tunnel.status === 'running'
                          ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                          : 'bg-primary/20 text-primary hover:bg-primary/30'
                          }`}
                      >
                        {isEnablingTunnel
                          ? t('Connecting...')
                          : remoteStatus.tunnel.status === 'running'
                            ? t('Stop Tunnel')
                            : remoteStatus.tunnel.status === 'starting'
                              ? t('Connecting...')
                              : t('Start Tunnel')}
                      </button>
                    </div>

                    {remoteStatus.tunnel.status === 'running' && remoteStatus.tunnel.url && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-500">{t('Public Address')}</span>
                          <div className="flex items-center gap-2">
                            <code className="text-sm bg-background px-2 py-1 rounded text-green-500">
                              {remoteStatus.tunnel.url}
                            </code>
                            <button
                              onClick={() => copyToClipboard(remoteStatus.tunnel.url || '')}
                              className="text-xs text-green-500/80 hover:text-green-500"
                            >
                              {t('Copy')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {remoteStatus.tunnel.status === 'error' && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="text-sm text-red-500">
                          {t('Tunnel connection failed')}: {remoteStatus.tunnel.error}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* QR Code */}
                  {qrCode && (
                    <div className="pt-4 border-t border-border">
                      <p className="font-medium mb-3">{t('Scan to Access')}</p>
                      <div className="flex flex-col items-center gap-3">
                        <div className="bg-white p-3 rounded-xl">
                          <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                        </div>
                        <div className="text-center text-sm">
                          <p className="text-muted-foreground">
                            {t('Scan the QR code with your phone and enter the password to access')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
          )}

            </div>
          </div>
        </main>
    </div>
  )
}
