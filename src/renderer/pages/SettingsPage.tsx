/**
 * Settings Page - App configuration
 */

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { useUpdaterStore } from '../stores/updater.store'
import { api } from '../api'
import type { HaloConfig, ThemeMode, McpServersConfig, AISourceType, ApiProvider, CustomSourceConfig, ApiKeyConfig } from '../types'
import { AVAILABLE_MODELS, DEFAULT_CONFIG, DEFAULT_MODEL, syncTopLevelFromActive } from '../types'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import { CheckCircle2, XCircle } from '../components/icons/ToolIcons'
import { McpServerList } from '../components/settings/McpServerList'
import { SkillList } from '../components/settings/SkillList'
import { SpaceManagementSection } from '../components/settings/SpaceManagementSection'
import { ResetSection } from '../components/settings/ResetSection'
import { ApiConfigDialog } from '../components/settings/ApiConfigDialog'
import { useTranslation, setLanguage, getCurrentLanguage, SUPPORTED_LOCALES, type LocaleCode } from '../i18n'
import { Loader2, LogOut, Plus, Check, Globe, Key, MessageSquare, Bot, Palette, Server, Settings as SettingsIcon, Wifi, X, Package, User, Layers, SlidersHorizontal, ArrowLeft, Database, Pencil, Trash2, Terminal, BarChart3, type LucideIcon } from 'lucide-react'
import { usePlatform } from '../components/layout/Header'
import { isElectron } from '../api/transport'
import { useToastStore } from '../stores/toast.store'
import { getProviderLogoById } from '../components/layout/ModelSelector'
import { resolveBrowserAutomationConfig, type BrowserAutomationMode } from '@shared/types/browser-automation'
import { RealtimeMonitor } from '../components/usage/RealtimeMonitor'
import { HistoryStats } from '../components/usage/HistoryStats'

// Import provider logos
import zhipuLogo from '../assets/providers/zhipu.jpg'
import minimaxLogo from '../assets/providers/minimax.jpg'
import kimiLogo from '../assets/providers/kimi.jpg'
import deepseekLogo from '../assets/providers/deepseek.jpg'
import claudeLogo from '../assets/providers/claude.jpg'
import openaiLogo from '../assets/providers/openai.jpg'
import openrouterLogo from '../assets/providers/openrouter.jpg'
import xiaomiLogo from '../assets/providers/xiaomi.png'

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
  altNote?: {
    prefixKey: string
    linkLabelKey: string
    linkUrl: string
    suffixKey: string
    altApiUrl: string
  }
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
    apiUrl: 'https://api.kimi.com/coding/',
    defaultModel: 'kimi-k2.5',
    logo: kimiLogo,
    apiType: 'anthropic',
    docsUrl: 'https://www.kimi.com/code/console?from=kfc_overview_topbar',
    apiDocsUrl: 'https://platform.moonshot.cn/docs/guide/agent-support#%E4%BD%BF%E7%94%A8%E6%B3%A8%E6%84%8F%E4%BA%8B%E9%A1%B9',
    altNote: {
      prefixKey: 'You can also get API Key from',
      linkLabelKey: 'Kimi Official Open Platform',
      linkUrl: 'https://platform.moonshot.cn/console/api-keys',
      suffixKey: ', if so change API URL below to',
      altApiUrl: 'https://api.moonshot.cn/anthropic'
    }
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
    id: 'openrouter',
    name: 'OpenRouter',
    nameKey: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'xiaomi/mimo-v2-pro',
    logo: openrouterLogo,
    apiType: 'openai',
    docsUrl: 'https://openrouter.ai/settings/keys'
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi',
    nameKey: 'Xiaomi',
    apiUrl: 'https://api.xiaomimimo.com/anthropic',
    defaultModel: 'mimo-v2-pro',
    logo: xiaomiLogo,
    apiType: 'anthropic',
    docsUrl: 'https://mimo.xiaomi.com'
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
  const hasNamedProviderConfigs = Object.keys(config?.aiSources || {}).some((key) => {
    if (key === 'current' || key === 'custom' || key === 'oauth') return false
    const source = config?.aiSources?.[key]
    if (!source || typeof source !== 'object') return false
    if ('loggedIn' in source) return Boolean(source.loggedIn)
    if ('apiKey' in source) return Boolean(source.apiKey)
    return false
  })
  const shouldUseLegacyApiForCustom =
    !customConfig?.apiKey &&
    (!!config?.api?.apiKey) &&
    ((config?.aiSources?.current === 'custom') || !hasNamedProviderConfigs)
  const legacyApi = shouldUseLegacyApiForCustom ? config?.api : undefined
  return {
    provider: normalizeProviderType(customConfig?.provider || legacyApi?.provider, 'anthropic'),
    apiKey: customConfig?.apiKey || legacyApi?.apiKey || '',
    apiUrl: customConfig?.apiUrl || legacyApi?.apiUrl || '',
    model: customConfig?.model || legacyApi?.model || DEFAULT_MODEL
  }
}

// Settings section type
type SettingsSection = 'ai-model' | 'display' | 'skills' | 'system' | 'spaces' | 'usage'

const TERMINAL_SHELL_SETTINGS_SECTIONS: SettingsSection[] = [
  'ai-model',
  'skills',
  'usage',
  'spaces',
  'system',
  'display',
]

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

  useEffect(() => {
    if (!TERMINAL_SHELL_SETTINGS_SECTIONS.includes(activeSection)) {
      setActiveSection('ai-model')
    }
  }, [activeSection])

  // AI Source state
  const [currentSource, setCurrentSource] = useState<AISourceType>(config?.aiSources?.current || 'custom')
  const [showCustomApiForm, setShowCustomApiForm] = useState(false)

  // Multi-config editing state (via modal dialog)
  const [showApiConfigDialog, setShowApiConfigDialog] = useState(false)
  const [dialogEditingConfig, setDialogEditingConfig] = useState<ApiKeyConfig | null>(null)
  const [dialogEditingProviderId, setDialogEditingProviderId] = useState<string | null>(null)
  const [dialogEditingIndex, setDialogEditingIndex] = useState<number | null>(null)

  // Legacy state kept for backward compat with other code paths
  const [editingConfigIndex, setEditingConfigIndex] = useState<number | null>(null)
  const [showConfigForm, setShowConfigForm] = useState(false)
  const [showAddingFlow, setShowAddingFlow] = useState(false)
  const [configLabel, setConfigLabel] = useState('')

  // Selected provider in the grid - initialize from current source/config
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => resolveInitialSelectedProviderId(config))
  const initialProviderFormValues = resolveProviderFormValues(config, selectedProviderId)

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

  // System settings state
  const [autoLaunch, setAutoLaunch] = useState(config?.system?.autoLaunch || false)
  const [minimizeToTray, setMinimizeToTray] = useState(config?.system?.minimizeToTray || false)
  const [skipClaudeLogin, setSkipClaudeLogin] = useState(
    config?.terminal?.skipClaudeLogin ?? DEFAULT_CONFIG.terminal!.skipClaudeLogin
  )
  const [noFlicker, setNoFlicker] = useState(
    config?.terminal?.noFlicker ?? DEFAULT_CONFIG.terminal!.noFlicker
  )
  const [desktopPetEnabled, setDesktopPetEnabled] = useState(
    config?.desktopPet?.enabled ?? false
  )
  const [showTerminalModeDialog, setShowTerminalModeDialog] = useState(false)

  // Advanced settings state
  const [showClearMemoryDialog, setShowClearMemoryDialog] = useState(false)
  const [clearMemoryScope, setClearMemoryScope] = useState<'space' | 'all'>('space')
  const [isClearingMemory, setIsClearingMemory] = useState(false)
  const [showMemoryManager, setShowMemoryManager] = useState(false)
  const [memoryMdContent, setMemoryMdContent] = useState('')
  const [memoryMdOriginal, setMemoryMdOriginal] = useState('')
  const [memoryMdExists, setMemoryMdExists] = useState(false)
  const [memoryStats, setMemoryStats] = useState<{ fragmentCount: number; conversationCount: number } | null>(null)
  const [isSavingMemory, setIsSavingMemory] = useState(false)
  const [isLoadingMemory, setIsLoadingMemory] = useState(false)
  const [customInstructionsContent, setCustomInstructionsContent] = useState(config?.customInstructions?.content || '')

  // API Key visibility state
  const [showApiKey, setShowApiKey] = useState(false)

  // Version update state (from shared store)
  const { status: updateStatus, currentVersion: appVersion, latestVersion } = useUpdaterStore()
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)

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

  // Handler for opening download page
  const handleOpenDownloadPage = () => {
    api.openDownloadPage()
  }

  // Refresh AI sources config on mount
  useEffect(() => {
    api.refreshAISourcesConfig().then((result) => {
      if (result.success) {
        api.getConfig().then((configResult) => {
          if (configResult.success) {
            setConfig(configResult.data)
          }
        })
      }
    })
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

  // Handle terminal mode switch
  const handleTerminalModeSwitch = async (useClaudeLogin: boolean) => {
    const nextSkip = !useClaudeLogin
    const previousValue = skipClaudeLogin
    setSkipClaudeLogin(nextSkip)
    setShowTerminalModeDialog(false)
    try {
      const result = await api.setConfig({
        terminal: { skipClaudeLogin: nextSkip }
      })
      if (result.success && result.data) {
        setConfig(result.data as HaloConfig)
      } else {
        setSkipClaudeLogin(previousValue)
      }
    } catch (error) {
      console.error('[Settings] Failed to switch terminal mode:', error)
      setSkipClaudeLogin(previousValue)
    }
  }

  // Handle NO_FLICKER toggle
  const handleNoFlickerChange = async (enabled: boolean) => {
    const previousValue = noFlicker
    setNoFlicker(enabled)
    try {
      const result = await api.setConfig({
        terminal: { noFlicker: enabled }
      })
      if (result.success && result.data) {
        setConfig(result.data as HaloConfig)
      } else {
        setNoFlicker(previousValue)
      }
    } catch (error) {
      console.error('[Settings] Failed to toggle noFlicker:', error)
      setNoFlicker(previousValue)
    }
  }

  // Handle Desktop Pet toggle
  const handleDesktopPetToggle = async (enabled: boolean) => {
    const previousValue = desktopPetEnabled
    setDesktopPetEnabled(enabled)
    try {
      const result = await api.setConfig({ desktopPet: { enabled } })
      if (result.success && result.data) {
        setConfig(result.data as HaloConfig)
      } else {
        setDesktopPetEnabled(previousValue)
      }
    } catch (error) {
      console.error('[Settings] Failed to toggle desktopPet:', error)
      setDesktopPetEnabled(previousValue)
    }
  }

  const isFullAccessEnabled = (config?.permissions?.commandExecution === 'allow')
    || (config?.permissions?.trustMode ?? false)
  const browserAutomation = resolveBrowserAutomationConfig(config ?? DEFAULT_CONFIG)
  const isBrowserAutomationEnabled = browserAutomation.enabled
  const prefersNativeClaudeSkillTool = (
    config?.skillSettings?.preferNativeClaudeSkillTool
    ?? DEFAULT_CONFIG.skillSettings?.preferNativeClaudeSkillTool
    ?? false
  )

  const handlePermissionModeChange = async (enabled: boolean) => {
    const currentPermissions = config?.permissions ?? DEFAULT_CONFIG.permissions
    const permissions = {
      ...currentPermissions,
      commandExecution: enabled ? 'allow' as const : 'ask' as const,
      trustMode: enabled
    }

    try {
      await api.setConfig({ permissions })
      setConfig({ ...(config ?? DEFAULT_CONFIG), permissions } as HaloConfig)
      addToast(t('Saved'), 'success')
    } catch (error) {
      console.error('[Settings] Failed to update permission mode:', error)
      addToast(t('Save failed'), 'error')
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

  const handleBrowserAutomationToggle = async (enabled: boolean) => {
    const browserAutomation = {
      enabled,
      mode: resolveBrowserAutomationConfig(config ?? DEFAULT_CONFIG).mode
    }

    try {
      await api.setConfig({ browserAutomation })
      setConfig({ ...(config ?? DEFAULT_CONFIG), browserAutomation } as HaloConfig)
      addToast(t('Saved'), 'success')
    } catch (error) {
      console.error('[Settings] Failed to update browser automation toggle:', error)
      addToast(t('Save failed'), 'error')
    }
  }

  const handleBrowserAutomationModeChange = async (mode: BrowserAutomationMode) => {
    const browserAutomation = {
      enabled: true,
      mode
    }

    try {
      await api.setConfig({ browserAutomation })
      setConfig({ ...(config ?? DEFAULT_CONFIG), browserAutomation } as HaloConfig)
      addToast(t('Saved'), 'success')
    } catch (error) {
      console.error('[Settings] Failed to update browser automation mode:', error)
      addToast(t('Save failed'), 'error')
    }
  }

  const handleNativeClaudeSkillToolChange = async (enabled: boolean) => {
    const skillSettings = {
      preferNativeClaudeSkillTool: enabled
    }

    try {
      await api.setConfig({ skillSettings })
      setConfig({ ...(config ?? DEFAULT_CONFIG), skillSettings } as HaloConfig)
      addToast(t('Saved'), 'success')
    } catch (error) {
      console.error('[Settings] Failed to update skill settings:', error)
      addToast(t('Save failed'), 'error')
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

  // Memory management
  const loadMemoryData = useCallback(async () => {
    if (!currentSpace?.id) return
    setIsLoadingMemory(true)
    try {
      const [mdResult, statsResult] = await Promise.all([
        api.readMemoryMd(currentSpace.id),
        api.getMemoryStats(currentSpace.id)
      ])
      if (mdResult.success) {
        setMemoryMdContent(mdResult.data.content)
        setMemoryMdOriginal(mdResult.data.content)
        setMemoryMdExists(mdResult.data.exists)
      }
      if (statsResult.success) {
        setMemoryStats(statsResult.data)
      }
    } catch (error) {
      console.error('[Settings] Failed to load memory data:', error)
    } finally {
      setIsLoadingMemory(false)
    }
  }, [currentSpace?.id])

  useEffect(() => {
    if (showMemoryManager) {
      loadMemoryData()
    }
  }, [showMemoryManager, loadMemoryData])

  const handleSaveMemoryMd = async () => {
    if (!currentSpace?.id) return
    setIsSavingMemory(true)
    try {
      const result = await api.saveMemoryMd(currentSpace.id, memoryMdContent)
      if (result.success) {
        setMemoryMdOriginal(memoryMdContent)
        addToast(t('Memory saved successfully'), 'success')
      } else {
        addToast(result.error || t('Failed to save memory'), 'error')
      }
    } catch {
      addToast(t('Failed to save memory'), 'error')
    } finally {
      setIsSavingMemory(false)
    }
  }

  // Handle custom instructions change
  const handleCustomInstructionsToggle = async (enabled: boolean) => {
    const customInstructions = { enabled, content: config?.customInstructions?.content || '' }
    try {
      await api.setConfig({ customInstructions })
      setConfig({ ...config!, customInstructions } as HaloConfig)
    } catch (error) {
      console.error('[Settings] Failed to update custom instructions:', error)
    }
  }

  const handleCustomInstructionsSave = async (content: string) => {
    const customInstructions = { enabled: config?.customInstructions?.enabled ?? false, content }
    try {
      await api.setConfig({ customInstructions })
      setConfig({ ...config!, customInstructions } as HaloConfig)
    } catch (error) {
      console.error('[Settings] Failed to update custom instructions:', error)
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

  // Handle save Custom API - saves to configs[] array
  const handleSaveCustomApi = async () => {
    setIsValidating(true)
    setValidationResult(null)

    try {
      const storageKey = selectedProviderId
      const existingConfig = (config?.aiSources?.[storageKey] as CustomSourceConfig | undefined)
      const existingConfigs: ApiKeyConfig[] = existingConfig?.configs || []

      const newEntry: ApiKeyConfig = {
        provider,
        apiKey,
        apiUrl,
        model,
        label: configLabel || model || undefined
      }

      let updatedConfigs: ApiKeyConfig[]
      let newActiveIndex: number

      if (editingConfigIndex !== null && editingConfigIndex < existingConfigs.length) {
        // Editing existing config
        updatedConfigs = [...existingConfigs]
        updatedConfigs[editingConfigIndex] = newEntry
        newActiveIndex = editingConfigIndex
      } else {
        // Adding new config
        updatedConfigs = [...existingConfigs, newEntry]
        newActiveIndex = updatedConfigs.length - 1
      }

      const providerConfig: CustomSourceConfig = syncTopLevelFromActive({
        provider: newEntry.provider,
        apiKey: newEntry.apiKey,
        apiUrl: newEntry.apiUrl,
        model: newEntry.model,
        configs: updatedConfigs,
        activeConfigIndex: newActiveIndex
      })

      const updates = {
        ...(storageKey === 'custom' ? { api: { provider: providerConfig.provider, apiKey: providerConfig.apiKey, apiUrl: providerConfig.apiUrl, model: providerConfig.model } } : {}),
        aiSources: {
          ...config?.aiSources,
          current: storageKey as AISourceType,
          [storageKey]: providerConfig
        }
      }
      await api.setConfig(updates)
      setConfig({ ...config, ...updates } as HaloConfig)
      setCurrentSource(storageKey as AISourceType)
      setValidationResult({ valid: true, message: t('Saved') })
      setShowCustomApiForm(false)
      setShowConfigForm(false)
      setShowAddingFlow(false)
      setEditingConfigIndex(null)
      setConfigLabel('')
    } catch (error) {
      setValidationResult({ valid: false, message: t('Save failed') })
    } finally {
      setIsValidating(false)
    }
  }

  // Handle delete a config entry
  const handleDeleteConfig = async (providerId: string, index: number) => {
    const existingConfig = (config?.aiSources?.[providerId] as CustomSourceConfig | undefined)
    if (!existingConfig?.configs) return

    const updatedConfigs = existingConfig.configs.filter((_, i) => i !== index)

    if (updatedConfigs.length === 0) {
      // No configs left - remove the provider key entirely
      const newAiSources = { ...config?.aiSources }
      delete newAiSources[providerId]
      // If this was the current source, switch to another configured provider
      if (newAiSources.current === providerId) {
        const otherProvider = Object.keys(newAiSources).find(k => {
          if (k === 'current' || k === 'oauth') return false
          const s = newAiSources[k]
          return s && typeof s === 'object' && 'apiKey' in s && (s as any).apiKey
        })
        newAiSources.current = (otherProvider || 'custom') as AISourceType
      }
      const updates = { aiSources: newAiSources }
      await api.setConfig(updates)
      setConfig({ ...config, ...updates } as HaloConfig)
      setCurrentSource(newAiSources.current)
      return
    }

    // Adjust activeConfigIndex if needed
    let newActiveIndex = existingConfig.activeConfigIndex ?? 0
    if (index === newActiveIndex) {
      newActiveIndex = 0
    } else if (index < newActiveIndex) {
      newActiveIndex = newActiveIndex - 1
    }

    const providerConfig = syncTopLevelFromActive({
      ...existingConfig,
      configs: updatedConfigs,
      activeConfigIndex: newActiveIndex
    })

    const updates = {
      aiSources: {
        ...config?.aiSources,
        [providerId]: providerConfig
      }
    }
    await api.setConfig(updates)
    setConfig({ ...config, ...updates } as HaloConfig)
  }

  // Handle switching active config within a provider
  const handleSwitchConfig = async (providerId: string, index: number) => {
    const existingConfig = (config?.aiSources?.[providerId] as CustomSourceConfig | undefined)
    if (!existingConfig?.configs) return

    const providerConfig = syncTopLevelFromActive({
      ...existingConfig,
      activeConfigIndex: index
    })

    const updates = {
      aiSources: {
        ...config?.aiSources,
        current: providerId as AISourceType,
        [providerId]: providerConfig
      }
    }
    await api.setConfig(updates)
    setConfig({ ...config, ...updates } as HaloConfig)
    setCurrentSource(providerId as AISourceType)
  }

  // Start editing an existing config
  const handleStartEdit = (index: number, cfg: ApiKeyConfig) => {
    setEditingConfigIndex(index)
    setApiKey(cfg.apiKey)
    setApiUrl(cfg.apiUrl)
    setModel(cfg.model)
    setProvider(cfg.provider)
    setConfigLabel(cfg.label || '')
    setUseCustomModel(!AVAILABLE_MODELS.some(m => m.id === cfg.model))
    setShowConfigForm(true)
    setValidationResult(null)
  }

  // Start adding a new config
  const handleStartAdd = () => {
    const preset = PROVIDER_PRESETS.find(p => p.id === selectedProviderId)
    setEditingConfigIndex(null)
    setApiKey('')
    setApiUrl(preset?.apiUrl || '')
    setModel(preset?.defaultModel || '')
    setProvider(preset?.apiType === 'openai' ? 'openai' : 'anthropic')
    setConfigLabel('')
    setUseCustomModel(false)
    setShowConfigForm(true)
    setValidationResult(null)
  }

  // Handle save from ApiConfigDialog
  const handleDialogSave = async (providerId: string, newEntry: ApiKeyConfig, editIndex: number | null): Promise<{ valid: boolean; message?: string }> => {
    try {
      const storageKey = providerId
      const existingConfig = (config?.aiSources?.[storageKey] as CustomSourceConfig | undefined)
      const existingConfigs: ApiKeyConfig[] = existingConfig?.configs || []

      let updatedConfigs: ApiKeyConfig[]
      let newActiveIndex: number

      if (editIndex !== null && editIndex < existingConfigs.length) {
        updatedConfigs = [...existingConfigs]
        updatedConfigs[editIndex] = newEntry
        newActiveIndex = editIndex
      } else {
        updatedConfigs = [...existingConfigs, newEntry]
        newActiveIndex = updatedConfigs.length - 1
      }

      const providerConfig: CustomSourceConfig = syncTopLevelFromActive({
        provider: newEntry.provider,
        apiKey: newEntry.apiKey,
        apiUrl: newEntry.apiUrl,
        model: newEntry.model,
        configs: updatedConfigs,
        activeConfigIndex: newActiveIndex
      })

      const updates = {
        ...(storageKey === 'custom' ? { api: { provider: providerConfig.provider, apiKey: providerConfig.apiKey, apiUrl: providerConfig.apiUrl, model: providerConfig.model } } : {}),
        aiSources: {
          ...config?.aiSources,
          current: storageKey as AISourceType,
          [storageKey]: providerConfig
        }
      }
      await api.setConfig(updates)
      setConfig({ ...config, ...updates } as HaloConfig)
      setCurrentSource(storageKey as AISourceType)
      return { valid: true, message: t('Saved') }
    } catch {
      return { valid: false, message: t('Save failed') }
    }
  }

  // Handle back - return to previous view (not always home)
  const handleBack = () => {
    goBack()
  }

  // Navigation items configuration
  const navItems: { id: SettingsSection; icon: LucideIcon; label: string; desktopOnly?: boolean; hidden?: boolean }[] = [
    { id: 'ai-model', icon: Bot, label: t('AI Model') },
    { id: 'skills', icon: Package, label: t('Skills') },
    { id: 'usage', icon: BarChart3, label: t('Usage'), desktopOnly: true },
    { id: 'spaces', icon: Layers, label: t('Spaces'), desktopOnly: true },
    { id: 'display', icon: Palette, label: t('Display') },
    { id: 'system', icon: SettingsIcon, label: t('System'), desktopOnly: true },
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
            <div className={activeSection === 'usage' ? '' : 'max-w-3xl'}>

          {/* AI Model Section - Grid Layout */}
          {activeSection === 'ai-model' && (
          <section className="space-y-6">
            {/* Unified Model Config List (across all providers) */}
            {(() => {
              // Build a flat list of all configured models across all providers
              const allConfigs: Array<{
                providerId: string
                configIndex: number
                config: ApiKeyConfig
                preset: typeof PROVIDER_PRESETS[0]
                isActive: boolean
              }> = []

              for (const preset of PROVIDER_PRESETS) {
                const source = config?.aiSources?.[preset.id] as CustomSourceConfig | undefined
                if (!source?.configs?.length) continue
                const activeIdx = source.activeConfigIndex ?? 0
                const isCurrentProvider = currentSource === preset.id
                source.configs.forEach((cfg, idx) => {
                  allConfigs.push({
                    providerId: preset.id,
                    configIndex: idx,
                    config: cfg,
                    preset,
                    isActive: isCurrentProvider && idx === activeIdx
                  })
                })
              }

              return (
                <div className="space-y-4">
                  {/* Config list - no API key shown */}
                  {allConfigs.length > 0 && (
                    <div>
                      <h3 className="text-sm text-muted-foreground mb-3">{t('Configured Models')}</h3>
                      <div className="space-y-2">
                        {allConfigs.map((item) => (
                          <div
                            key={`${item.providerId}:${item.configIndex}`}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                              item.isActive
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => handleSwitchConfig(item.providerId, item.configIndex)}
                          >
                            {/* Provider logo */}
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                              {item.preset.logo ? (
                                <img src={item.preset.logo} alt={item.preset.name} className="w-full h-full object-contain rounded-lg" />
                              ) : (
                                <div className="w-full h-full bg-muted/50 flex items-center justify-center rounded-lg">
                                  <Key className="w-4 h-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>

                            {/* Active indicator */}
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              item.isActive ? 'bg-primary' : 'bg-border'
                            }`} />

                            {/* Config info - only label/model, no API key */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {item.config.label || `${item.preset.isCustom ? t('Custom') : item.preset.name} - ${item.config.model}` || t('Untitled')}
                              </div>
                              {item.config.label && item.config.model && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.config.model}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  setDialogEditingProviderId(item.providerId)
                                  setDialogEditingConfig(item.config)
                                  setDialogEditingIndex(item.configIndex)
                                  setShowApiConfigDialog(true)
                                }}
                                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
                                title={t('Edit')}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteConfig(item.providerId, item.configIndex)}
                                className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                                title={t('Delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add button */}
                  <button
                    onClick={() => {
                      setDialogEditingConfig(null)
                      setDialogEditingProviderId(null)
                      setDialogEditingIndex(null)
                      setShowApiConfigDialog(true)
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {t('Add Configuration')}
                  </button>
                </div>
              )
            })()}

            {/* Api Config Dialog (Modal) */}
            <ApiConfigDialog
              isOpen={showApiConfigDialog}
              onClose={() => setShowApiConfigDialog(false)}
              onSave={handleDialogSave}
              providerPresets={PROVIDER_PRESETS}
              editingConfig={dialogEditingConfig}
              editingProviderId={dialogEditingProviderId}
              editingIndex={dialogEditingIndex}
            />
          </section>
          )}

          {/* Display Section */}
          {activeSection === 'display' && (
          <section className="space-y-6">
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

              {/* Smooth Mode */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex-1">
                  <p className="font-medium">{t('Smooth Mode')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('Supports mouse clicks, smoother scrolling. Takes effect on new sessions')}
                  </p>
                </div>
                <Switch checked={noFlicker} onChange={handleNoFlickerChange} />
              </div>
            </div>
          </section>
          )}

          {/* System Section */}
          {activeSection === 'system' && !api.isRemoteMode() && (
            <section className="space-y-4">
              <div className="space-y-4">
                {/* Auto Launch */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{t('Auto Launch on Startup')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('Automatically run Halo when system starts')}
                    </p>
                  </div>
                  <Switch checked={autoLaunch} onChange={handleAutoLaunchChange} />
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
                  <Switch checked={minimizeToTray} onChange={handleMinimizeToTrayChange} />
                </div>

                {/* Terminal Mode */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex-1">
                    <p className="font-medium">{t('Terminal Mode')}</p>
                    <p className="text-sm text-muted-foreground">
                      {skipClaudeLogin
                        ? t('Currently using custom API model')
                        : t('Currently using Claude Code login')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTerminalModeDialog(true)}
                    className="px-4 py-2 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors"
                  >
                    {t('Switch')}
                  </button>
                </div>

                {/* Version Update */}
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{t('Version Update')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('Current version')}: <span className="font-mono">{appVersion}</span>
                        {updateStatus === 'available' && latestVersion && (
                          <span className="ml-2 text-primary">
                            → {latestVersion} {t('available')}
                          </span>
                        )}
                      </p>
                      {updateStatus === 'not-available' && (
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {t('Already latest version')}
                        </p>
                      )}
                      {updateStatus === 'error' && (
                        <p className="text-xs text-red-500/70 mt-1">
                          {t('Update check failed')}
                        </p>
                      )}
                    </div>
                    {updateStatus === 'available' ? (
                      <button
                        onClick={handleOpenDownloadPage}
                        className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        {t('Download from website')}
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
              <ResetSection />

              {/* Terminal Mode Switch Dialog */}
              {showTerminalModeDialog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowTerminalModeDialog(false)}
                  />
                  <div className="relative bg-background rounded-xl shadow-2xl border border-border max-w-lg w-full mx-4 p-6">
                    <h3 className="text-lg font-semibold text-center mb-2">
                      {t('Switch Terminal Mode')}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center mb-6">
                      {t('Choose how the terminal authenticates with AI')}
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => handleTerminalModeSwitch(true)}
                        className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                          !skipClaudeLogin
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Terminal className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">
                            {t('Use Claude Code Login')}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('Sign in with your Claude account. Claude Code will handle authentication in the terminal.')}
                          </p>
                        </div>
                        {!skipClaudeLogin && (
                          <span className="text-xs text-primary font-medium">{t('Current')}</span>
                        )}
                      </button>

                      <button
                        onClick={() => handleTerminalModeSwitch(false)}
                        className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                          skipClaudeLogin
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Key className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">
                            {t('Configure Model API')}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('Set up an API key for models like Zhipu GLM, DeepSeek, Kimi, etc.')}
                          </p>
                        </div>
                        {skipClaudeLogin && (
                          <span className="text-xs text-primary font-medium">{t('Current')}</span>
                        )}
                      </button>
                    </div>

                    <button
                      onClick={() => setShowTerminalModeDialog(false)}
                      className="mt-4 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('Cancel')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Advanced Section */}
          {activeSection === 'advanced' && !api.isRemoteMode() && (
            <section className="space-y-4">
              <div className="space-y-4">
                {/* Custom Instructions */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{t('Custom Instructions')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('Global instructions that AI will follow in every conversation')}
                      </p>
                    </div>
                    <Switch checked={config?.customInstructions?.enabled ?? false} onChange={handleCustomInstructionsToggle} />
                  </div>
                  <div className={`mt-3 transition-opacity ${(config?.customInstructions?.enabled ?? false) ? '' : 'opacity-50 pointer-events-none'}`}>
                    <textarea
                      value={customInstructionsContent}
                      onChange={(e) => setCustomInstructionsContent(e.target.value)}
                      onBlur={() => handleCustomInstructionsSave(customInstructionsContent)}
                      placeholder={t('e.g., Always respond in Chinese, Use concise language...')}
                      className="w-full h-32 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('Changes take effect in the next new conversation')}
                    </p>
                  </div>
                </div>

                {/* Permission Mode */}
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{t('Permission Mode')}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          isFullAccessEnabled
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                            : 'bg-secondary text-muted-foreground border border-border'
                        }`}>
                          {isFullAccessEnabled ? t('Full Access') : t('Ask Every Time')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isFullAccessEnabled
                          ? t('Run commands, code execution, and sub-agents without asking for confirmation.')
                          : t('Ask before running commands, code execution, or sub-agents.')}
                      </p>
                    </div>
                    <Switch checked={isFullAccessEnabled} onChange={handlePermissionModeChange} />
                  </div>

                  {isFullAccessEnabled && (
                    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                      {t('Full access allows AI to execute commands directly. Only enable this on a trusted machine.')}
                    </div>
                  )}
                </div>

                {/* Cross-conversation Memory Toggle */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex-1">
                    <p className="font-medium">{t('Cross-conversation Memory')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('AI can remember content from previous conversations')}
                    </p>
                  </div>
                  <Switch checked={config?.memory?.enabled ?? true} onChange={handleMemoryEnabledChange} />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex-1">
                    <p className="font-medium">{t('Use Browser')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('Allow AI to use browser tools when a task needs web pages.')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('Changes take effect on the next message')}
                    </p>
                  </div>
                  <Switch checked={isBrowserAutomationEnabled} onChange={handleBrowserAutomationToggle} />
                </div>

                {isBrowserAutomationEnabled && (
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div className="flex-1">
                      <p className="font-medium">{t('Browser mode')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('Choose whether browser tasks open in your system browser or the built-in browser.')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('Changes take effect on the next message')}
                      </p>
                    </div>
                    <Select<BrowserAutomationMode>
                      variant="compact"
                      value={browserAutomation.mode}
                      onChange={handleBrowserAutomationModeChange}
                      options={[
                        { value: 'system-browser', label: t('System Browser') },
                        { value: 'ai-browser', label: t('Built-in Browser') }
                      ]}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex-1">
                    <p className="font-medium">{t('Prefer Native Claude Skill Tool')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("When supported by the current provider, use Claude Code's built-in Skill tool instead of SkillsFan's MCP Skill tool.")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('Changes take effect on the next message')}
                    </p>
                  </div>
                  <Switch checked={prefersNativeClaudeSkillTool} onChange={handleNativeClaudeSkillToolChange} />
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

                {/* Memory Management */}
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{t('Memory Management')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('View and edit the memory file for current space')}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowMemoryManager(true)}
                      className="px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors border border-primary/30"
                    >
                      {t('Manage')}
                    </button>
                  </div>
                </div>

                {/* Clear Memory Button */}
                <div className="pt-4 border-t border-border">
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

          {/* Memory Manager Modal */}
          {showMemoryManager && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowMemoryManager(false)
              }}
            >
              <div className="bg-background border border-border rounded-lg w-full max-w-2xl shadow-lg max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-medium text-foreground">{t('Memory Management')}</h3>
                  <button
                    onClick={() => setShowMemoryManager(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Stats Bar */}
                <div className="px-4 py-3 bg-secondary/30 border-b border-border flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-4 h-4" />
                    <span>{t('Fragments')}: {memoryStats?.fragmentCount ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" />
                    <span>{t('Conversations')}: {memoryStats?.conversationCount ?? 0}</span>
                  </div>
                  {!memoryMdExists && !isLoadingMemory && (
                    <span className="text-amber-500 text-xs ml-auto">{t('No MEMORY.md file found')}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-4 overflow-hidden">
                  {isLoadingMemory ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      {t('Loading...')}
                    </div>
                  ) : (
                    <textarea
                      value={memoryMdContent}
                      onChange={(e) => setMemoryMdContent(e.target.value)}
                      placeholder={t('MEMORY.md content will appear here...')}
                      className="w-full h-80 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                    />
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
                  <button
                    onClick={() => setShowMemoryManager(false)}
                    className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    onClick={handleSaveMemoryMd}
                    disabled={isSavingMemory || memoryMdContent === memoryMdOriginal}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSavingMemory ? t('Saving...') : t('Save')}
                  </button>
                </div>
              </div>
            </div>
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
          <section className="space-y-6">
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
          <section className="space-y-6">
            <SkillList />
          </section>
          )}

          <div className={activeSection === 'usage' ? '' : 'max-w-2xl'}>{/* reopen max-w-2xl */}


          {/* Spaces Management Section */}
          {activeSection === 'spaces' && !api.isRemoteMode() && (
          <section className="space-y-6">
            <h2 className="text-lg font-medium mb-4">{t('Space Management')}</h2>
            <SpaceManagementSection />
          </section>
          )}

          {activeSection === 'usage' && !api.isRemoteMode() && (
          <section className="w-full min-w-0 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">{t('Desktop Pet')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('Show a pet in the terminal that reacts to your usage activity')}
                </p>
              </div>
              <Switch checked={desktopPetEnabled} onChange={handleDesktopPetToggle} />
            </div>
            <div className="border-t border-border/50" />
            <RealtimeMonitor isActive={activeSection === 'usage'} />
            <div className="border-t border-border/50" />
            <HistoryStats isActive={activeSection === 'usage'} />
          </section>
          )}

            </div>
          </div>
        </main>
    </div>
  )
}
