/**
 * Settings Page - App configuration
 */

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { useUpdaterStore } from '../stores/updater.store'
import { api } from '../api'
import type { HaloConfig, ThemeMode, McpServersConfig, AISourceType, OAuthSourceConfig, ApiProvider, CustomSourceConfig } from '../types'
import { AVAILABLE_MODELS, DEFAULT_CONFIG, DEFAULT_MODEL } from '../types'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'

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
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { FeishuSettings } from '../components/settings/FeishuSettings'
import { useTranslation, setLanguage, getCurrentLanguage, SUPPORTED_LOCALES, type LocaleCode } from '../i18n'
import { isNoVisionModel } from '../../shared/utils/vision-models'
import { Loader2, LogOut, Plus, Check, Globe, Key, MessageSquare, Bot, Palette, Server, Settings as SettingsIcon, Wifi, ExternalLink, X, Package, User, Layers, Lock, SlidersHorizontal, Clock, ArrowLeft, Database, RefreshCw, Copy, Monitor, Terminal, FolderOpen, Sparkles, Stethoscope, type LucideIcon } from 'lucide-react'
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
    name: 'Custom',
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

function resolveWebToolsFormValues(config: HaloConfig | undefined): {
  searchEnabled: boolean
  braveApiKey: string
  perplexityApiKey: string
} {
  const search = config?.tools?.web?.search

  return {
    searchEnabled: search?.enabled !== false,
    braveApiKey: search?.apiKey || '',
    perplexityApiKey: search?.perplexity?.apiKey || ''
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

type GatewayDoctorCheckState = 'ok' | 'warn' | 'fail'

interface GatewayDoctorCheck {
  key: string
  state: GatewayDoctorCheckState
  summary: string
}

interface GatewayDoctorReport {
  generatedAt: string
  overallState: GatewayDoctorCheckState
  checks: GatewayDoctorCheck[]
}

interface GatewayDaemonStatusView {
  supported: boolean
  manager: string
  state: string
  desiredMode: 'manual' | 'daemon'
  installable: boolean
  registered: boolean
  autoStartEnabled: boolean
  registeredAt: string | null
  updatedAt: string | null
  lockState: string
  lockOwner: string | null
  lockPid: number | null
  lockHeartbeatAgeMs: number | null
  note: string
  lastError: string | null
}

interface GatewayDaemonCommandSpec {
  command: string
  args: string[]
}

interface GatewayDaemonInstallFile {
  kind: string
  path: string
  content: string
}

interface GatewayDaemonInstallPlan {
  supported: boolean
  manager: string
  label: string
  taskName: string
  executablePath: string
  args: string[]
  workingDirectory: string | null
  files: GatewayDaemonInstallFile[]
  installCommands: GatewayDaemonCommandSpec[]
  uninstallCommands: GatewayDaemonCommandSpec[]
  notes: string[]
}

interface GatewayDaemonPreparedInstallFile {
  kind: string
  targetPath: string
  stagedPath: string
}

interface GatewayDaemonPreparedInstallBundle {
  supported: boolean
  manager: string
  generatedAt: string
  stagingRootDir: string
  bundleDir: string
  manifestPath: string
  readmePath: string
  installCommandsFilePath: string | null
  uninstallCommandsFilePath: string | null
  fileCount: number
  stagedFiles: GatewayDaemonPreparedInstallFile[]
}

interface GatewayDaemonExecutedCommand {
  command: string
  args: string[]
  startedAt: string
  finishedAt: string
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
}

interface GatewayDaemonExecutionResult {
  action: 'install' | 'uninstall'
  success: boolean
  manager: string
  bundleDir: string
  manifestPath: string
  preparedAt: string
  executedAt: string
  copiedFileCount: number
  copiedTargets: string[]
  commands: GatewayDaemonExecutedCommand[]
  rollbackHints: string[]
  cleanupHints: string[]
  error: string | null
  note: string | null
}

type GatewayDaemonConfirmAction = null | {
  type: 'install' | 'uninstall' | 'clear-lock'
  title: string
  message: string
  confirmLabel: string
  variant: 'warning' | 'danger' | 'info'
}

interface GatewayHealthStatusView {
  checkedAt: string
  gateway: {
    mode: string
    state?: string
  }
  runtime: {
    configuredMode: string
    activeKind: string
    fallbackActive: boolean
    registeredKinds?: string[]
    nativeRegistered?: boolean
    hybridTaskRouting?: boolean
    rollout?: {
      phase: 'first-batch'
      includedScopes: string[]
      excludedScopes: string[]
      simpleTasksCanUseNative: boolean
      note: string
      validation?: Array<{
        id: 'chat-simple' | 'browser-simple' | 'terminal-simple' | 'finder-simple' | 'skillsfan-simple'
        state: 'ready' | 'held' | 'blocked'
        blockerCodes: Array<
          'mode_locked'
          | 'policy_held'
          | 'native_not_ready'
          | 'compat_no_endpoint'
          | 'compat_requires_responses'
          | 'compat_adapter_unavailable'
          | 'shared_tools_missing'
          | 'permissions_missing'
          | 'workflow_missing'
          | 'smoke_failed'
        >
        relatedWorkflowIds: string[]
        relatedSmokeFlowIds: string[]
        latestSmokeState: 'passed' | 'failed' | 'running' | 'missing'
        lastTrial?: {
          state: 'running' | 'passed' | 'failed'
          startedAt: string
          finishedAt?: string
          durationMs?: number
          summary: string
          error?: string | null
        } | null
      }>
      previews: Array<{
        id: string
        selectedKind: 'claude-sdk' | 'native'
        fallbackFrom?: 'claude-sdk' | 'native'
        reason: string
      }>
    }
    native?: {
      scaffolded: boolean
      ready: boolean
      readinessReasonId?: string | null
      providerNativeExecution: boolean
      sharedToolRegistryReady: boolean
      taskRoutingReady: boolean
      supportedProviders: string[]
      supportedApiTypes: string[]
      interaction: {
        pendingToolApprovalCount: number
        pendingUserQuestionCount: number
        pendingUserQuestionPreview?: string | null
        pendingUserQuestionHeader?: string | null
        lastToolApprovalRequestedAt: string | null
        lastUserQuestionRequestedAt: string | null
      }
      note: string
    }
  }
  process: {
    state: string
    pid: number | null
    heartbeatAgeMs: number | null
  }
  launcher: {
    state: string
  }
  commands: {
    initialized: boolean
    processRole: string | null
    pendingCount: number
    processingCount: number
    processedCount: number
    failedCount: number
    lastCommandName: string | null
    lastCommandAt: string | null
    lastSuccessAt: string | null
    lastFailureAt: string | null
    lastError: string | null
  }
  sessionStore: {
    enabled: boolean
    hydrated: boolean
    sessionCount: number
    snapshotSavedAt: string | null
    lastLoadError: string | null
    lastSaveError: string | null
  }
  stepJournal: {
    enabled: boolean
    persistedTaskCount: number
    persistedStepCount: number
    lastPersistedAt: string | null
    lastLoadError: string | null
    lastPersistError: string | null
  }
  host: {
    platform: string
    desktop: {
      state: string
      backend?: string
      actions: Array<{
        id: string
        supported: boolean
        requiresAccessibilityPermission?: boolean
        blockedByPermission?: boolean
        notes?: string
      }>
      adapters: Array<{
        id: string
        displayName?: string
        supported: boolean
        stage?: 'active' | 'planned'
        applicationNames?: string[]
        actions?: string[]
        methods?: Array<{
          id: string
          displayName?: string
          action: string
          supported: boolean
          stage?: 'active' | 'scaffolded' | 'planned'
          notes?: string
        }>
        workflows?: Array<{
          id: string
          displayName?: string
          supported: boolean
          stage?: 'active' | 'planned'
          methodIds: string[]
          blockedByPermission?: boolean
          blockedMethodIds?: string[]
          recoveryHint?: string
          notes?: string
        }>
        smokeFlows?: Array<{
          id: string
          displayName?: string
          supported: boolean
          stage?: 'active' | 'planned'
          methodIds: string[]
          blockedByPermission?: boolean
          blockedMethodIds?: string[]
          verification?: string
          recoveryHint?: string
          lastRun?: {
            state: 'running' | 'passed' | 'failed'
            startedAt: string
            finishedAt?: string
            durationMs?: number
            summary: string
            error?: string | null
          }
          notes?: string
        }>
        notes?: string
      }>
      errorCodes: string[]
    }
    permissions: {
      accessibility: { state: string }
      screenRecording: { state: string }
    }
  }
}

function formatOptionalTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }

  return new Date(timestamp).toLocaleString()
}

function formatDurationMs(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`
  }

  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`
}

function formatGatewayManagerLabel(value: string | null | undefined): string {
  if (!value) {
    return 'manual'
  }

  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatGatewayCommand(spec: GatewayDaemonCommandSpec): string {
  return [spec.command, ...spec.args].join(' ')
}

const MACOS_ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
const MACOS_SCREEN_RECORDING_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

function getStatusBadgeClasses(state: string | null | undefined): string {
  switch (state) {
    case 'ok':
    case 'ready':
    case 'registered':
    case 'owned':
    case 'connected':
      return 'bg-green-500/10 text-green-600 border border-green-500/30'
    case 'warn':
    case 'degraded':
    case 'stale':
    case 'available':
      return 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
    case 'fail':
    case 'error':
      return 'bg-red-500/10 text-red-600 border border-red-500/30'
    case 'external':
    case 'observed':
      return 'bg-blue-500/10 text-blue-600 border border-blue-500/30'
    default:
      return 'bg-secondary text-muted-foreground border border-border'
  }
}

function buildDesktopWorkflowRecoveryGuide(health: GatewayHealthStatusView): string {
  const blockedWorkflows = health.host.desktop.adapters
    .flatMap((adapter) => (adapter.workflows || []).map((workflow) => ({
      adapterName: adapter.displayName || adapter.id,
      workflow
    })))
    .filter(({ workflow }) => workflow.blockedByPermission)

  if (blockedWorkflows.length === 0) {
    return 'No blocked desktop workflows.'
  }

  return blockedWorkflows.map(({ adapterName, workflow }) => {
    const lines = [
      `${adapterName} / ${workflow.displayName || workflow.id}`,
      `- Blocked methods: ${(workflow.blockedMethodIds || []).join(', ') || '—'}`
    ]

    if (workflow.recoveryHint) {
      lines.push(`- Recovery: ${workflow.recoveryHint}`)
    }

    return lines.join('\n')
  }).join('\n\n')
}

function buildDesktopSmokeFlowRecoveryGuide(health: GatewayHealthStatusView): string {
  const blockedSmokeFlows = health.host.desktop.adapters
    .flatMap((adapter) => (adapter.smokeFlows || []).map((smokeFlow) => ({
      adapterName: adapter.displayName || adapter.id,
      smokeFlow
    })))
    .filter(({ smokeFlow }) => smokeFlow.blockedByPermission)

  if (blockedSmokeFlows.length === 0) {
    return 'No blocked desktop smoke flows.'
  }

  return blockedSmokeFlows.map(({ adapterName, smokeFlow }) => {
    const lines = [
      `${adapterName} / ${smokeFlow.displayName || smokeFlow.id}`,
      `- Blocked methods: ${(smokeFlow.blockedMethodIds || []).join(', ') || '—'}`
    ]

    if (smokeFlow.verification) {
      lines.push(`- Verification: ${smokeFlow.verification}`)
    }

    if (smokeFlow.recoveryHint) {
      lines.push(`- Recovery: ${smokeFlow.recoveryHint}`)
    }

    return lines.join('\n')
  }).join('\n\n')
}

function buildDesktopAutomationRunbook(health: GatewayHealthStatusView): string {
  const activeAdapters = health.host.desktop.adapters.filter((adapter) => adapter.stage === 'active' && adapter.supported)

  if (activeAdapters.length === 0) {
    return 'No active computer automation adapters.'
  }

  const sections = activeAdapters.map((adapter) => {
    const lines = [
      `${adapter.displayName || adapter.id}`,
      `Applications: ${(adapter.applicationNames || []).join(', ') || '—'}`
    ]

    const workflows = (adapter.workflows || []).filter((workflow) => workflow.stage === 'active' && workflow.supported)
    if (workflows.length > 0) {
      lines.push('', 'Productized Workflows:')
      for (const workflow of workflows) {
        lines.push(`- ${workflow.displayName || workflow.id} [${workflow.blockedByPermission ? 'Blocked' : 'Ready'}]`)
        lines.push(`  Methods: ${workflow.methodIds.join(', ')}`)
        if (workflow.notes) {
          lines.push(`  Notes: ${workflow.notes}`)
        }
        if (workflow.blockedByPermission && workflow.recoveryHint) {
          lines.push(`  Recovery: ${workflow.recoveryHint}`)
        }
      }
    }

    const smokeFlows = (adapter.smokeFlows || []).filter((smokeFlow) => smokeFlow.stage === 'active' && smokeFlow.supported)
    if (smokeFlows.length > 0) {
      lines.push('', 'Smoke Flows:')
      for (const smokeFlow of smokeFlows) {
        lines.push(`- ${smokeFlow.displayName || smokeFlow.id} [${smokeFlow.blockedByPermission ? 'Blocked' : 'Ready'}]`)
        lines.push(`  Methods: ${smokeFlow.methodIds.join(', ')}`)
        if (smokeFlow.verification) {
          lines.push(`  Verification: ${smokeFlow.verification}`)
        }
        if (smokeFlow.notes) {
          lines.push(`  Notes: ${smokeFlow.notes}`)
        }
        if (smokeFlow.blockedByPermission && smokeFlow.recoveryHint) {
          lines.push(`  Recovery: ${smokeFlow.recoveryHint}`)
        }
      }
    }

    return lines.join('\n')
  })

  const blockedActions = health.host.desktop.actions
    .filter((action) => action.blockedByPermission)
    .map((action) => action.id)

  const footer = blockedActions.length > 0
    ? ['', `Blocked computer actions: ${blockedActions.join(', ')}`]
    : []

  return [
    'Computer Automation Runbook',
    `Platform: ${health.host.platform}`,
    `Backend: ${health.host.desktop.backend || '—'}`,
    '',
    ...sections,
    ...footer
  ].join('\n')
}

// Settings section type
type SettingsSection = 'ai-model' | 'display' | 'mcp' | 'skills' | 'system' | 'computer-automation' | 'remote' | 'feishu' | 'account' | 'spaces' | 'advanced' | 'scheduled'

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
  const [showMemoryManager, setShowMemoryManager] = useState(false)
  const [memoryMdContent, setMemoryMdContent] = useState('')
  const [memoryMdOriginal, setMemoryMdOriginal] = useState('')
  const [memoryMdExists, setMemoryMdExists] = useState(false)
  const [memoryStats, setMemoryStats] = useState<{ fragmentCount: number; conversationCount: number } | null>(null)
  const [isSavingMemory, setIsSavingMemory] = useState(false)
  const [isLoadingMemory, setIsLoadingMemory] = useState(false)
  const [customInstructionsContent, setCustomInstructionsContent] = useState(config?.customInstructions?.content || '')
  const initialWebToolsValues = resolveWebToolsFormValues(config)
  const [webSearchEnabled, setWebSearchEnabled] = useState(initialWebToolsValues.searchEnabled)
  const [webSearchBraveApiKey, setWebSearchBraveApiKey] = useState(initialWebToolsValues.braveApiKey)
  const [webSearchPerplexityApiKey, setWebSearchPerplexityApiKey] = useState(initialWebToolsValues.perplexityApiKey)
  const [showWebSearchKeys, setShowWebSearchKeys] = useState(false)
  const [isSavingWebTools, setIsSavingWebTools] = useState(false)
  const [gatewayHealth, setGatewayHealth] = useState<GatewayHealthStatusView | null>(null)
  const [gatewayDoctor, setGatewayDoctor] = useState<GatewayDoctorReport | null>(null)
  const [gatewayDaemonStatus, setGatewayDaemonStatus] = useState<GatewayDaemonStatusView | null>(null)
  const [gatewayDaemonInstallPlan, setGatewayDaemonInstallPlan] = useState<GatewayDaemonInstallPlan | null>(null)
  const [gatewayDaemonPreparedInstall, setGatewayDaemonPreparedInstall] = useState<GatewayDaemonPreparedInstallBundle | null>(null)
  const [gatewayDaemonExecutionResult, setGatewayDaemonExecutionResult] = useState<GatewayDaemonExecutionResult | null>(null)
  const [gatewayDaemonConfirmAction, setGatewayDaemonConfirmAction] = useState<GatewayDaemonConfirmAction>(null)
  const [activeDesktopSmokeFlowId, setActiveDesktopSmokeFlowId] = useState<string | null>(null)
  const [isLoadingGatewayDiagnostics, setIsLoadingGatewayDiagnostics] = useState(false)
  const [activeGatewayDaemonAction, setActiveGatewayDaemonAction] = useState<'register' | 'unregister' | null>(null)
  const [isPreparingGatewayDaemonInstall, setIsPreparingGatewayDaemonInstall] = useState(false)
  const [activeGatewayDaemonCommand, setActiveGatewayDaemonCommand] = useState<'install' | 'uninstall' | null>(null)
  const [isClearingGatewayDaemonLock, setIsClearingGatewayDaemonLock] = useState(false)
  const [isRecoveringGatewayLauncher, setIsRecoveringGatewayLauncher] = useState(false)
  const [isSavingAutomaticHandling, setIsSavingAutomaticHandling] = useState(false)
  const [showGatewayDiagnostics, setShowGatewayDiagnostics] = useState(false)

  // API Key visibility state
  const [showApiKey, setShowApiKey] = useState(false)

  // Version update state (from shared store)
  const { status: updateStatus, currentVersion: appVersion, latestVersion } = useUpdaterStore()
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

  // Handler for opening download page
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

  useEffect(() => {
    const values = resolveWebToolsFormValues(config)
    setWebSearchEnabled(values.searchEnabled)
    setWebSearchBraveApiKey(values.braveApiKey)
    setWebSearchPerplexityApiKey(values.perplexityApiKey)
  }, [config?.tools])

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

  const loadGatewayDiagnostics = useCallback(async (options?: { silent?: boolean }) => {
    if (api.isRemoteMode()) {
      return
    }

    setIsLoadingGatewayDiagnostics(true)

    try {
      const [healthResult, doctorResult, daemonResult, installPlanResult] = await Promise.all([
        api.getGatewayHealth(),
        api.getGatewayDoctor(),
        api.getGatewayDaemonStatus(),
        api.getGatewayDaemonInstallPlan()
      ])

      if (healthResult.success) {
        setGatewayHealth(healthResult.data as GatewayHealthStatusView)
      }
      if (doctorResult.success) {
        setGatewayDoctor(doctorResult.data as GatewayDoctorReport)
      }
      if (daemonResult.success) {
        setGatewayDaemonStatus(daemonResult.data as GatewayDaemonStatusView)
      }
      if (installPlanResult.success) {
        setGatewayDaemonInstallPlan(installPlanResult.data as GatewayDaemonInstallPlan)
      }

      const firstError = [
        healthResult.error,
        doctorResult.error,
        daemonResult.error,
        installPlanResult.error
      ].find((value) => typeof value === 'string' && value.length > 0)

      if (firstError && !options?.silent) {
        addToast(firstError, 'error')
      }
    } catch (error) {
      console.error('[Settings] Failed to load gateway diagnostics:', error)
      if (!options?.silent) {
        addToast(t('Failed to load gateway diagnostics'), 'error')
      }
    } finally {
      setIsLoadingGatewayDiagnostics(false)
    }
  }, [addToast, t])

  useEffect(() => {
    if (activeSection === 'computer-automation' && !api.isRemoteMode()) {
      void loadGatewayDiagnostics({ silent: true })
    }
  }, [activeSection, loadGatewayDiagnostics])

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

  const copyToClipboard = async (text: string) => {
    if (!text) {
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      addToast(t('Copied'), 'success')
    } catch (error) {
      console.error('[Settings] Failed to copy to clipboard:', error)
      addToast(t('Copy failed'), 'error')
    }
  }

  const handleOpenDesktopPermissionSettings = async (permission: 'accessibility' | 'screen-recording') => {
    const url = permission === 'accessibility'
      ? MACOS_ACCESSIBILITY_SETTINGS_URL
      : MACOS_SCREEN_RECORDING_SETTINGS_URL

    try {
      await api.openExternal(url)
    } catch (error) {
      console.error('[Settings] Failed to open macOS permission settings:', error)
      addToast(t('Failed to open System Settings'), 'error')
    }
  }

  const handleCopyDesktopWorkflowRecoveryGuide = async () => {
    if (!gatewayHealth) {
      return
    }

    await copyToClipboard(buildDesktopWorkflowRecoveryGuide(gatewayHealth))
  }

  const handleCopyDesktopSmokeFlowGuide = async () => {
    if (!gatewayHealth) {
      return
    }

    await copyToClipboard(buildDesktopSmokeFlowRecoveryGuide(gatewayHealth))
  }

  const handleCopyDesktopAutomationRunbook = async () => {
    if (!gatewayHealth) {
      return
    }

    await copyToClipboard(buildDesktopAutomationRunbook(gatewayHealth))
  }

  const handleRunDesktopSmokeFlow = async (flowId: string) => {
    setActiveDesktopSmokeFlowId(flowId)
    try {
      const result = await api.runGatewayDesktopSmokeFlow(flowId)
      if (!result.success) {
        addToast(result.error || t('Failed'), 'error')
        return
      }

      const execution = result.data as {
        state?: 'running' | 'passed' | 'failed'
        summary?: string
        error?: string | null
      }
      addToast(
        execution.summary || (
          execution.state === 'passed'
            ? t('Passed')
            : execution.error || t('Failed')
        ),
        execution.state === 'passed' ? 'success' : 'error'
      )
      await loadGatewayDiagnostics({ silent: true })
    } catch (error) {
      console.error('[Settings] Failed to run desktop smoke flow:', error)
      addToast(t('Failed'), 'error')
    } finally {
      setActiveDesktopSmokeFlowId(null)
    }
  }

  const handleAutomaticHandlingModeChange = async (mode: 'claude-sdk' | 'hybrid') => {
    const currentConfig = config ?? DEFAULT_CONFIG
    const nextMode: NonNullable<HaloConfig['runtime']>['mode'] = mode

    setIsSavingAutomaticHandling(true)
    try {
      await api.setConfig({ runtime: { mode: nextMode } })
      const nextConfig: HaloConfig = {
        ...currentConfig,
        runtime: {
          ...(currentConfig.runtime ?? DEFAULT_CONFIG.runtime),
          mode: nextMode
        }
      }
      setConfig(nextConfig)
      addToast(
        nextMode === 'claude-sdk' ? t('Switched to Claude Mode.') : t('Switched to Standard Mode.'),
        'success'
      )
      await loadGatewayDiagnostics({ silent: true })
    } catch (error) {
      console.error('[Settings] Failed to update automatic handling mode:', error)
      addToast(t('Save failed'), 'error')
    } finally {
      setIsSavingAutomaticHandling(false)
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

  const isFullAccessEnabled = (config?.permissions?.commandExecution === 'allow')
    || (config?.permissions?.trustMode ?? false)
  const isSystemBrowserMode = (config?.browserAutomation?.mode ?? DEFAULT_CONFIG.browserAutomation?.mode) === 'system-browser'

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

  const handleSystemBrowserModeChange = async (enabled: boolean) => {
    const browserAutomation = {
      mode: enabled ? 'system-browser' as const : 'ai-browser' as const
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

  const handleWebToolsEnabledChange = async (enabled: boolean) => {
    setWebSearchEnabled(enabled)

    const toolsConfig = {
      web: {
        search: {
          ...(config?.tools?.web?.search || {}),
          enabled,
          apiKey: webSearchBraveApiKey,
          perplexity: {
            ...(config?.tools?.web?.search?.perplexity || {}),
            apiKey: webSearchPerplexityApiKey
          }
        },
        fetch: {
          ...(config?.tools?.web?.fetch || {}),
          enabled
        }
      }
    }

    try {
      await api.setConfig({ tools: toolsConfig })
      setConfig({ ...(config ?? DEFAULT_CONFIG), tools: toolsConfig } as HaloConfig)
    } catch (error) {
      console.error('[Settings] Failed to update web tools config:', error)
    }
  }

  const handleSaveWebToolsConfig = async () => {
    setIsSavingWebTools(true)

    const toolsConfig = {
      web: {
        search: {
          ...(config?.tools?.web?.search || {}),
          enabled: webSearchEnabled,
          apiKey: webSearchBraveApiKey,
          perplexity: {
            ...(config?.tools?.web?.search?.perplexity || {}),
            apiKey: webSearchPerplexityApiKey
          }
        },
        fetch: {
          ...(config?.tools?.web?.fetch || {}),
          enabled: webSearchEnabled
        }
      }
    }

    try {
      await api.setConfig({ tools: toolsConfig })
      setConfig({ ...(config ?? DEFAULT_CONFIG), tools: toolsConfig } as HaloConfig)
      addToast(t('Saved'), 'success')
    } catch (error) {
      console.error('[Settings] Failed to save web tools config:', error)
      addToast(t('Save failed'), 'error')
    } finally {
      setIsSavingWebTools(false)
    }
  }

  const handleRegisterGatewayDaemon = async () => {
    setActiveGatewayDaemonAction('register')
    try {
      const result = await api.registerGatewayDaemon()
      if (!result.success) {
        addToast(result.error || t('Save failed'), 'error')
        return
      }

      addToast(t('Saved'), 'success')
      await loadGatewayDiagnostics({ silent: true })
    } catch (error) {
      console.error('[Settings] Failed to register gateway daemon:', error)
      addToast(t('Save failed'), 'error')
    } finally {
      setActiveGatewayDaemonAction(null)
    }
  }

  const handleUnregisterGatewayDaemon = async () => {
    setActiveGatewayDaemonAction('unregister')
    try {
      const result = await api.unregisterGatewayDaemon()
      if (!result.success) {
        addToast(result.error || t('Save failed'), 'error')
        return
      }

      addToast(t('Saved'), 'success')
      await loadGatewayDiagnostics({ silent: true })
    } catch (error) {
      console.error('[Settings] Failed to unregister gateway daemon:', error)
      addToast(t('Save failed'), 'error')
    } finally {
      setActiveGatewayDaemonAction(null)
    }
  }

  const handlePrepareGatewayDaemonInstall = async () => {
    setIsPreparingGatewayDaemonInstall(true)
    try {
      const result = await api.prepareGatewayDaemonInstall()
      if (!result.success) {
        addToast(result.error || t('Save failed'), 'error')
        return
      }

      setGatewayDaemonPreparedInstall(result.data as GatewayDaemonPreparedInstallBundle)
      setGatewayDaemonExecutionResult(null)
      addToast(t('Saved'), 'success')
    } catch (error) {
      console.error('[Settings] Failed to prepare gateway daemon install bundle:', error)
      addToast(t('Save failed'), 'error')
    } finally {
      setIsPreparingGatewayDaemonInstall(false)
    }
  }

  const handleRunGatewayDaemonCommand = async (action: 'install' | 'uninstall') => {
    const bundleDir = gatewayDaemonPreparedInstall?.bundleDir
    if (!bundleDir) {
      addToast(t('Prepare install files first'), 'info')
      return
    }

    setActiveGatewayDaemonCommand(action)
    try {
      const result = action === 'install'
        ? await api.runGatewayDaemonInstall(bundleDir)
        : await api.runGatewayDaemonUninstall(bundleDir)

      if (!result.success) {
        addToast(result.error || t('Save failed'), 'error')
        return
      }

      setGatewayDaemonExecutionResult(result.data as GatewayDaemonExecutionResult)
      addToast(t('Saved'), 'success')
      await loadGatewayDiagnostics({ silent: true })
    } catch (error) {
      console.error(`[Settings] Failed to run gateway daemon ${action}:`, error)
      addToast(t('Save failed'), 'error')
    } finally {
      setActiveGatewayDaemonCommand(null)
    }
  }

  const handleClearGatewayDaemonLock = async () => {
    setIsClearingGatewayDaemonLock(true)
    try {
      const result = await api.clearGatewayDaemonLock()
      if (!result.success) {
        addToast(result.error || t('Save failed'), 'error')
        return
      }

      addToast(t('Saved'), 'success')
      await loadGatewayDiagnostics({ silent: true })
    } catch (error) {
      console.error('[Settings] Failed to clear gateway daemon lock:', error)
      addToast(t('Save failed'), 'error')
    } finally {
      setIsClearingGatewayDaemonLock(false)
    }
  }

  const handleRecoverGatewayLauncher = async () => {
    setIsRecoveringGatewayLauncher(true)
    try {
      const result = await api.recoverGatewayLauncher()
      if (!result.success) {
        addToast(result.error || t('Save failed'), 'error')
        return
      }

      const status = result.data as { state?: string } | undefined
      addToast(
        status?.state === 'connected'
          ? t('External gateway is connected')
          : t('Recovery started'),
        'success'
      )
      await loadGatewayDiagnostics({ silent: true })
    } catch (error) {
      console.error('[Settings] Failed to recover gateway launcher:', error)
      addToast(t('Save failed'), 'error')
    } finally {
      setIsRecoveringGatewayLauncher(false)
    }
  }

  const requestGatewayDaemonActionConfirmation = (type: 'install' | 'uninstall' | 'clear-lock') => {
    if (type === 'install') {
      setGatewayDaemonConfirmAction({
        type,
        title: t('Run Install Commands'),
        message: t('This will copy the prepared daemon files into their target system locations and run the generated install commands. Continue?'),
        confirmLabel: t('Run Install'),
        variant: 'warning'
      })
      return
    }

    if (type === 'uninstall') {
      setGatewayDaemonConfirmAction({
        type,
        title: t('Run Uninstall Commands'),
        message: t('This will run the generated uninstall commands for the prepared daemon bundle. Generated target files may still require manual cleanup. Continue?'),
        confirmLabel: t('Run Uninstall'),
        variant: 'danger'
      })
      return
    }

    setGatewayDaemonConfirmAction({
      type,
      title: t('Clear Stale Lock'),
      message: t('This will remove the observed daemon lock file so the launcher can recover from a stale or unhealthy background state. Continue?'),
      confirmLabel: t('Clear Lock'),
      variant: 'warning'
    })
  }

  const handleConfirmGatewayDaemonAction = async () => {
    if (!gatewayDaemonConfirmAction) {
      return
    }

    const action = gatewayDaemonConfirmAction
    setGatewayDaemonConfirmAction(null)

    if (action.type === 'install' || action.type === 'uninstall') {
      await handleRunGatewayDaemonCommand(action.type)
      return
    }

    await handleClearGatewayDaemonLock()
  }

  const shouldShowGatewayLauncherRecovery = gatewayHealth?.gateway.mode === 'external' && (
    gatewayHealth.launcher.state !== 'connected'
    || gatewayHealth.process.state === 'awaiting-external'
    || gatewayHealth.process.state === 'inactive'
    || gatewayDaemonStatus?.lockState === 'stale'
    || gatewayDaemonStatus?.lockState === 'error'
  )

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

  // Handle imageModel change
  const handleImageModelChange = async (value: string) => {
    try {
      if (value === 'auto') {
        await api.setConfig({ imageModel: undefined } as any)
        setConfig({ ...config!, imageModel: undefined } as any)
      } else {
        const [source, ...modelParts] = value.split('/')
        const model = modelParts.join('/')
        const imageModel = { source, model }
        await api.setConfig({ imageModel } as any)
        setConfig({ ...config!, imageModel } as any)
      }
    } catch (error) {
      console.error('[Settings] Failed to update imageModel:', error)
    }
  }

  // Build imageModel options from configured AI sources
  const imageModelOptions = (() => {
    const options: Array<{ value: string; label: string }> = [
      { value: 'auto', label: t('Auto (detect from configured sources)') }
    ]
    const aiSources = config?.aiSources
    if (!aiSources) return options

    for (const key of Object.keys(aiSources)) {
      if (key === 'current') continue
      const src = aiSources[key]
      if (!src || typeof src !== 'object') continue

      // OAuth provider with available models
      if ('loggedIn' in src && (src as OAuthSourceConfig).loggedIn) {
        const oauthSrc = src as OAuthSourceConfig
        for (const modelId of (oauthSrc.availableModels || [])) {
          if (!isNoVisionModel(modelId)) {
            const displayName = oauthSrc.modelNames?.[modelId] || modelId
            options.push({ value: `${key}/${modelId}`, label: `${key}: ${displayName}` })
          }
        }
      }

      // Custom API provider
      if ('apiKey' in src && (src as CustomSourceConfig).apiKey) {
        const customSrc = src as CustomSourceConfig
        const modelId = customSrc.model || ''
        if (modelId && !isNoVisionModel(modelId)) {
          options.push({ value: `${key}/${modelId}`, label: `${key}: ${modelId}` })
        }
      }
    }
    return options
  })()

  const currentImageModelValue = config?.imageModel
    ? `${(config.imageModel as any).source}/${(config.imageModel as any).model}`
    : 'auto'

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
        ...(storageKey === 'custom' ? { api: providerConfig } : {}),
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

  const adapterIconMap: Record<string, LucideIcon> = {
    'terminal': Terminal,
    'chrome': Globe,
    'finder': FolderOpen,
    'skillsfan': Sparkles,
  }

  const adapterDisplayNames: Record<string, string> = {
    'terminal': t('Terminal'),
    'chrome': t('Browser (Chrome)'),
    'finder': t('Finder'),
    'skillsfan': 'SkillsFan',
  }

  const adapterDescriptions: Record<string, string> = {
    'terminal': t('terminal_description'),
    'chrome': t('chrome_description'),
    'finder': t('finder_description'),
    'skillsfan': t('skillsfan_description'),
  }

  const adapterBlockedDescriptions: Record<string, string> = {
    'terminal': t('terminal_blocked_description'),
    'chrome': t('chrome_blocked_description'),
    'finder': t('finder_blocked_description'),
    'skillsfan': t('skillsfan_blocked_description'),
  }

  const getBlockedCapabilityLabels = (): string[] => {
    if (!gatewayHealth) return []
    const blocked = gatewayHealth.host.desktop.actions.filter(a => a.blockedByPermission)
    const labels: string[] = []
    if (blocked.some(a => ['press_key', 'type_text'].includes(a.id))) labels.push(t('keyboard input'))
    if (blocked.some(a => ['click', 'move_mouse', 'scroll'].includes(a.id))) labels.push(t('mouse control'))
    if (blocked.some(a => ['list_windows', 'focus_window'].includes(a.id))) labels.push(t('window management'))
    return labels
  }

  const renderComputerAutomationContent = () => {
    if (!gatewayHealth) {
      return null
    }

    const currentRuntimeMode = config?.runtime?.mode ?? DEFAULT_CONFIG.runtime.mode
    const selectedTaskHandlingMode: 'claude-sdk' | 'hybrid' = currentRuntimeMode === 'claude-sdk' ? 'claude-sdk' : 'hybrid'
    const needsAccessibility = gatewayHealth.host.permissions.accessibility.state === 'needs_permission'
    const needsScreenRecording = gatewayHealth.host.permissions.screenRecording.state === 'needs_permission'
    const hasPermissionIssue = needsAccessibility || needsScreenRecording
    const allReady = gatewayHealth.host.desktop.state === 'ready' && !hasPermissionIssue
    const blockedLabels = getBlockedCapabilityLabels()
    const activeAdapters = gatewayHealth.host.desktop.adapters.filter(a => a.stage === 'active' && a.id !== 'generic-macos')

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="font-medium">{t('Task handling')}</p>
            <p className="text-sm text-muted-foreground">
              {selectedTaskHandlingMode === 'hybrid'
                ? t('Automation tasks are handled by SkillsFan; complex tasks like Agent are handled by Claude.')
                : t('All tasks are handled by Claude Code SDK.')}
            </p>
          </div>
          <div className="w-44 shrink-0">
            <Select<'claude-sdk' | 'hybrid'>
              value={selectedTaskHandlingMode}
              onChange={handleAutomaticHandlingModeChange}
              options={[
                { value: 'claude-sdk', label: t('Claude Mode') },
                { value: 'hybrid', label: t('Standard Mode') }
              ]}
              disabled={isSavingAutomaticHandling}
            />
          </div>
        </div>

        {/* Permission banner */}
        {hasPermissionIssue && (
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex-1">
              <p className="font-medium text-amber-700 dark:text-amber-400">{t('System permission required')}</p>
              <p className="text-sm text-muted-foreground">
                {t('Please enable permissions in System Settings for full functionality.')}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {needsAccessibility && (
                <button
                  onClick={() => handleOpenDesktopPermissionSettings('accessibility')}
                  className="px-3 py-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/30 font-medium"
                >
                  {t('Enable Accessibility')}
                </button>
              )}
              {needsScreenRecording && (
                <button
                  onClick={() => handleOpenDesktopPermissionSettings('screen-recording')}
                  className="px-3 py-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/30 font-medium"
                >
                  {t('Enable Screen Recording')}
                </button>
              )}
            </div>
          </div>
        )}

        {allReady && (
          <div className="flex items-center gap-2 pt-4 border-t border-border">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-600 font-medium">{t('Permissions ready')}</span>
          </div>
        )}

        {/* App list — same style as other settings items */}
        {activeAdapters.map((adapter, index) => {
          const AdapterIcon = adapterIconMap[adapter.id] || Monitor
          const description = adapterDescriptions[adapter.id] || ''

          return (
            <div
              key={adapter.id}
              className={index > 0 || (hasPermissionIssue || allReady) ? 'pt-4 border-t border-border' : ''}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AdapterIcon className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">
                    {adapterDisplayNames[adapter.id] || adapter.displayName || adapter.id}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {description}
              </p>
            </div>
          )
        })}

        <div className="pt-4 border-t border-border">
          <button
            onClick={() => {
              setShowGatewayDiagnostics(true)
              void loadGatewayDiagnostics()
            }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Stethoscope className="w-4 h-4" />
            {t('Troubleshoot')}
          </button>
        </div>
      </div>
    )
  }

  // Navigation items configuration
  const navItems: { id: SettingsSection; icon: LucideIcon; label: string; desktopOnly?: boolean; hidden?: boolean }[] = [
    { id: 'account', icon: User, label: t('Account'), desktopOnly: true },
    { id: 'ai-model', icon: Bot, label: t('AI Model') },
    { id: 'skills', icon: Package, label: t('Skills') },
    { id: 'spaces', icon: Layers, label: t('Spaces'), desktopOnly: true },
    { id: 'system', icon: SettingsIcon, label: t('System'), desktopOnly: true },
    { id: 'advanced', icon: SlidersHorizontal, label: t('Advanced'), desktopOnly: true },
    { id: 'computer-automation', icon: Monitor, label: t('Computer Automation'), desktopOnly: true },
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
            </section>
          )}

          {activeSection === 'computer-automation' && !api.isRemoteMode() && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-4">{t('Computer Automation')}</h2>

              {!gatewayHealth && isLoadingGatewayDiagnostics && (
                <div className="rounded-lg border border-border bg-secondary/20 px-4 py-5 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('Loading...')}
                </div>
              )}

              {gatewayHealth && renderComputerAutomationContent()}
            </section>
          )}

          {/* Advanced Section */}
          {activeSection === 'advanced' && !api.isRemoteMode() && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-4">{t('Advanced')}</h2>

              <div className="space-y-4">
                {/* Permission Mode */}
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{t('Permission Mode')}</p>
                      <p className="text-sm text-muted-foreground">
                        {isFullAccessEnabled
                          ? t('Run commands, code execution, and sub-agents without asking for confirmation.')
                          : t('Ask before running commands, code execution, or sub-agents.')}
                      </p>
                    </div>
                    <Select<string>
                      variant="compact"
                      showCheck={false}
                      value={isFullAccessEnabled ? 'full' : 'ask'}
                      onChange={(v) => handlePermissionModeChange(v === 'full')}
                      options={[
                        { value: 'ask', label: t('Ask Every Time') },
                        { value: 'full', label: t('Full Access') }
                      ]}
                    />
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

                {platform.isMac && (
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div className="flex-1">
                      <p className="font-medium">{t('Prefer System Browser')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('Use your normal Chrome or Safari for browser tasks and avoid opening the AI-controlled browser.')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('Changes take effect on the next message')}
                      </p>
                    </div>
                    <Switch checked={isSystemBrowserMode} onChange={handleSystemBrowserModeChange} />
                  </div>
                )}

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

                {/* Image Understanding Model */}
                <div className="pt-4 border-t border-border">
                  <div className="flex-1 mb-2">
                    <p className="font-medium">{t('Image Understanding Model')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('When the active model does not support vision, this model will be used to describe images as text')}
                    </p>
                  </div>
                  <Select<string>
                    value={currentImageModelValue}
                    onChange={handleImageModelChange}
                    options={imageModelOptions}
                  />
                </div>

                {/* Custom Instructions */}
                <div className="pt-4 border-t border-border">
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

                {/* Local Web Tools */}
                <div className="pt-4 border-t border-border space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{t('Web Tools')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('Enable web search and page fetching. Automatically uses your AI model\'s built-in search when available.')}
                      </p>
                    </div>
                    <Switch checked={webSearchEnabled} onChange={handleWebToolsEnabledChange} />
                  </div>

                  <div className={`space-y-4 transition-opacity ${webSearchEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                    <p className="text-xs text-muted-foreground">
                      {t('Supported models: Kimi, GLM, MiniMax, Claude, GPT. DeepSeek not supported. Falls back to DuckDuckGo otherwise.')}
                    </p>

                    <div className="rounded-lg border border-border bg-secondary/20">
                      <button
                        type="button"
                        onClick={() => setShowWebSearchKeys((value) => !value)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="text-sm font-medium">{t('Standalone Search API Keys (Advanced)')}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('Only needed when your model has no built-in search. Use Brave or Perplexity as an alternative.')}
                          </p>
                        </div>
                        {showWebSearchKeys ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                      </button>

                      <div className={`px-4 pb-4 space-y-3 ${showWebSearchKeys ? '' : 'hidden'}`}>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-muted-foreground">{t('Brave Search API Key')}</label>
                            <a
                              href="https://brave.com/search/api/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {t('Get API Key')}
                            </a>
                          </div>
                          <input
                            type={showWebSearchKeys ? 'text' : 'password'}
                            value={webSearchBraveApiKey}
                            onChange={(e) => setWebSearchBraveApiKey(e.target.value)}
                            placeholder="BSA..."
                            className="w-full px-3 py-2 text-sm bg-input rounded-lg border border-border focus:outline-none transition-colors"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-muted-foreground">{t('Perplexity Search API Key')}</label>
                            <a
                              href="https://www.perplexity.ai/settings/api"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {t('Get API Key')}
                            </a>
                          </div>
                          <input
                            type={showWebSearchKeys ? 'text' : 'password'}
                            value={webSearchPerplexityApiKey}
                            onChange={(e) => setWebSearchPerplexityApiKey(e.target.value)}
                            placeholder="pplx-..."
                            className="w-full px-3 py-2 text-sm bg-input rounded-lg border border-border focus:outline-none transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveWebToolsConfig}
                        disabled={isSavingWebTools}
                        className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isSavingWebTools ? t('Saving...') : t('Save')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Memory Management */}
                <div className={`pt-4 border-t border-border transition-opacity ${(config?.memory?.enabled ?? true) ? '' : 'opacity-50 pointer-events-none'}`}>
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

          {/* Gateway Diagnostics Modal */}
          {showGatewayDiagnostics && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowGatewayDiagnostics(false)
              }}
            >
              <div className="bg-background border border-border rounded-lg w-full max-w-4xl shadow-lg max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div>
                    <h3 className="font-medium text-foreground">{t('Gateway Diagnostics')}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('View the status of the automation system to help troubleshoot issues.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadGatewayDiagnostics()}
                      disabled={isLoadingGatewayDiagnostics}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingGatewayDiagnostics ? 'animate-spin' : ''}`} />
                      {t('Refresh')}
                    </button>
                    <button
                      onClick={() => setShowGatewayDiagnostics(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-5 overflow-y-auto space-y-5">
                  {!gatewayHealth && isLoadingGatewayDiagnostics && (
                    <div className="rounded-lg border border-border bg-secondary/20 px-4 py-5 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('Loading gateway diagnostics...')}
                    </div>
                  )}

                  {gatewayHealth && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{t('Background service')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t('The core service that runs automation tasks')}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(gatewayHealth.process.state)}`}>
                            {gatewayHealth.gateway.mode === 'external' ? t('External') : t('Embedded')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Running Mode')}</p>
                            <p className="mt-1 font-medium">{gatewayHealth.gateway.mode === 'external' ? t('Runs in the background') : t('Runs inside the app')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Status')}</p>
                            <p className="mt-1 font-medium">{gatewayHealth.process.state}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Auto-start')}</p>
                            <p className="mt-1 font-medium">{gatewayHealth.launcher.state}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{t('Process ID')}: {gatewayHealth.process.pid ?? '—'}</span>
                          <span>{t('Last Heartbeat')}: {formatDurationMs(gatewayHealth.process.heartbeatAgeMs)}</span>
                          <span>{t('Last Checked')}: {formatOptionalTimestamp(gatewayHealth.checkedAt)}</span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{t('Task Executor')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t('Processes and executes automation commands')}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(
                            gatewayHealth.gateway.mode !== 'external'
                              ? 'disabled'
                              : gatewayHealth.commands.lastError
                                ? 'error'
                                : gatewayHealth.commands.initialized
                                  ? 'ok'
                                  : 'warn'
                          )}`}>
                            {gatewayHealth.gateway.mode !== 'external'
                              ? t('Disabled')
                              : gatewayHealth.commands.initialized
                                ? t('Active')
                                : t('Pending')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Mode')}</p>
                            <p className="mt-1 font-medium">{gatewayHealth.commands.processRole || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Queued')}</p>
                            <p className="mt-1 font-medium">{gatewayHealth.commands.pendingCount}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Completed')}</p>
                            <p className="mt-1 font-medium">{gatewayHealth.commands.processedCount}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Errors')}</p>
                            <p className="mt-1 font-medium">{gatewayHealth.commands.failedCount}</p>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>{t('Last Task')}: {gatewayHealth.commands.lastCommandName || '—'}</p>
                          <p>{t('Last Active')}: {formatOptionalTimestamp(gatewayHealth.commands.lastCommandAt)}</p>
                          <p>{t('Last Success')}: {formatOptionalTimestamp(gatewayHealth.commands.lastSuccessAt)}</p>
                        </div>
                        {gatewayHealth.commands.lastError && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500 break-all">
                            {gatewayHealth.commands.lastError}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{t('Data Backup')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t('Auto-saves progress to prevent data loss')}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(
                            gatewayHealth.sessionStore.lastLoadError
                              || gatewayHealth.sessionStore.lastSaveError
                              || gatewayHealth.stepJournal.lastLoadError
                              || gatewayHealth.stepJournal.lastPersistError
                              ? 'warn'
                              : 'ok'
                          )}`}>
                            {gatewayHealth.sessionStore.enabled || gatewayHealth.stepJournal.enabled ? t('Active') : t('Disabled')}
                          </span>
                        </div>
                        <div className="space-y-3 text-sm">
                          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium">{t('Session Backup')}</p>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(
                                !gatewayHealth.sessionStore.enabled
                                  ? 'disabled'
                                  : gatewayHealth.sessionStore.lastLoadError || gatewayHealth.sessionStore.lastSaveError
                                    ? 'warn'
                                    : gatewayHealth.sessionStore.hydrated
                                      ? 'ok'
                                      : 'degraded'
                              )}`}>
                                {gatewayHealth.sessionStore.enabled
                                  ? gatewayHealth.sessionStore.hydrated ? t('Hydrated') : t('Pending')
                                  : t('Disabled')}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t('{{count}} sessions, last snapshot {{time}}', {
                                count: gatewayHealth.sessionStore.sessionCount,
                                time: formatOptionalTimestamp(gatewayHealth.sessionStore.snapshotSavedAt)
                              })}
                            </p>
                            {(gatewayHealth.sessionStore.lastLoadError || gatewayHealth.sessionStore.lastSaveError) && (
                              <p className="mt-2 text-xs text-red-500 break-all">
                                {gatewayHealth.sessionStore.lastLoadError || gatewayHealth.sessionStore.lastSaveError}
                              </p>
                            )}
                          </div>

                          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium">{t('Step Log')}</p>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(
                                !gatewayHealth.stepJournal.enabled
                                  ? 'disabled'
                                  : gatewayHealth.stepJournal.lastLoadError || gatewayHealth.stepJournal.lastPersistError
                                    ? 'warn'
                                    : 'ok'
                              )}`}>
                                {gatewayHealth.stepJournal.enabled ? t('Recording') : t('Disabled')}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t('{{taskCount}} tasks / {{stepCount}} steps, last persisted {{time}}', {
                                taskCount: gatewayHealth.stepJournal.persistedTaskCount,
                                stepCount: gatewayHealth.stepJournal.persistedStepCount,
                                time: formatOptionalTimestamp(gatewayHealth.stepJournal.lastPersistedAt)
                              })}
                            </p>
                            {(gatewayHealth.stepJournal.lastLoadError || gatewayHealth.stepJournal.lastPersistError) && (
                              <p className="mt-2 text-xs text-red-500 break-all">
                                {gatewayHealth.stepJournal.lastLoadError || gatewayHealth.stepJournal.lastPersistError}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                  )}

                  {gatewayDoctor && (
                    <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{t('Doctor Report')}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t('Checks if all components are working properly')}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('Generated at {{time}}', { time: formatOptionalTimestamp(gatewayDoctor.generatedAt) })}
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClasses(gatewayDoctor.overallState)}`}>
                          {gatewayDoctor.overallState.toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {gatewayDoctor.checks.map((check) => (
                          <div
                            key={check.key}
                            className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2.5"
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              check.state === 'ok' ? 'bg-green-500' : check.state === 'warn' ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{
                                ({
                                  'daemon': t('Background Service'),
                                  'gateway-launcher': t('Auto-start'),
                                  'gateway-process': t('Service Process'),
                                  'command-runtime': t('Task Executor'),
                                  'session-store': t('Session Backup'),
                                  'step-journal': t('Step Log'),
                                  'runtime': t('System Runtime'),
                                  'host-permissions': t('System Permissions'),
                                } as Record<string, string>)[check.key] || check.key
                              }</p>
                              <p className="text-xs text-muted-foreground mt-0.5 break-words">{check.summary}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {gatewayDaemonStatus && (
                    <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{t('Background Gateway')}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('Manage daemon intent and inspect auto-start integration for the external gateway process.')}
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(
                          gatewayDaemonStatus.lastError
                            ? 'error'
                            : gatewayDaemonStatus.registered
                              ? 'registered'
                              : gatewayDaemonStatus.state
                        )}`}>
                          {gatewayDaemonStatus.registered ? t('Registered') : t('Manual')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                          <p className="text-xs text-muted-foreground">{t('Manager')}</p>
                          <p className="mt-1 font-medium">{formatGatewayManagerLabel(gatewayDaemonStatus.manager)}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{t('Run mode')}: {gatewayDaemonStatus.desiredMode === 'daemon' ? t('Always Run in Background') : t('Only Run with App')}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t('Auto Start')}: {gatewayDaemonStatus.autoStartEnabled ? t('Enabled') : t('Disabled')}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                          <p className="text-xs text-muted-foreground">{t('Lock')}</p>
                          <p className="mt-1 font-medium">{gatewayDaemonStatus.lockState}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{t('Owner')}: {gatewayDaemonStatus.lockOwner || '—'}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t('Heartbeat Age')}: {formatDurationMs(gatewayDaemonStatus.lockHeartbeatAgeMs)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleRegisterGatewayDaemon}
                          disabled={activeGatewayDaemonAction !== null || !gatewayDaemonStatus.installable}
                          className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {activeGatewayDaemonAction === 'register' ? t('Saving...') : t('Always Run in Background')}
                        </button>
                        <button
                          onClick={handleUnregisterGatewayDaemon}
                          disabled={activeGatewayDaemonAction !== null}
                          className="px-4 py-2 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                        >
                          {activeGatewayDaemonAction === 'unregister' ? t('Saving...') : t('Only Run with App')}
                        </button>
                        {shouldShowGatewayLauncherRecovery && (
                          <button
                            onClick={handleRecoverGatewayLauncher}
                            disabled={isRecoveringGatewayLauncher}
                            className="px-4 py-2 bg-amber-500/10 text-amber-700 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/30 disabled:opacity-50 dark:text-amber-400"
                          >
                            {isRecoveringGatewayLauncher ? t('Recovering...') : t('Recover External Gateway')}
                          </button>
                        )}
                      </div>

                      <div className="border-t border-border/60 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <p>{t('Registered at')}: {formatOptionalTimestamp(gatewayDaemonStatus.registeredAt)}</p>
                        <p>{t('Updated at')}: {formatOptionalTimestamp(gatewayDaemonStatus.updatedAt)}</p>
                      </div>

                      {gatewayDaemonStatus.note && (
                        <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                          {gatewayDaemonStatus.note}
                        </div>
                      )}

                      {gatewayDaemonStatus.lastError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500 break-all">
                          {gatewayDaemonStatus.lastError}
                        </div>
                      )}

                      {gatewayDaemonInstallPlan && (
                        <div className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{t('Install Plan')}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {gatewayDaemonInstallPlan.supported
                                  ? t('Manual installer skeleton for {{manager}}.', {
                                      manager: formatGatewayManagerLabel(gatewayDaemonInstallPlan.manager)
                                    })
                                  : t('Daemon installation is not supported on this platform yet.')}
                              </p>
                            </div>
                            {gatewayDaemonInstallPlan.installCommands.length > 0 && (
                              <button
                                onClick={() => copyToClipboard(gatewayDaemonInstallPlan.installCommands.map(formatGatewayCommand).join('\n'))}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                {t('Copy install commands')}
                              </button>
                            )}
                          </div>

                          {gatewayDaemonInstallPlan.files.map((file) => (
                            <div key={file.path} className="rounded-lg border border-border/60 px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs text-muted-foreground">{file.kind}</p>
                                  <p className="mt-1 font-mono text-xs break-all">{file.path}</p>
                                </div>
                                <button
                                  onClick={() => copyToClipboard(file.content)}
                                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  {t('Copy file')}
                                </button>
                              </div>
                            </div>
                          ))}

                          {gatewayDaemonInstallPlan.installCommands.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-foreground">{t('Install Commands')}</p>
                              <div className="rounded-lg border border-border/60 bg-background px-3 py-2 space-y-2">
                                {gatewayDaemonInstallPlan.installCommands.map((command) => (
                                  <code key={formatGatewayCommand(command)} className="block text-xs break-all">
                                    {formatGatewayCommand(command)}
                                  </code>
                                ))}
                              </div>
                            </div>
                          )}

                          {gatewayDaemonInstallPlan.uninstallCommands.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-foreground">{t('Uninstall Commands')}</p>
                              <div className="rounded-lg border border-border/60 bg-background px-3 py-2 space-y-2">
                                {gatewayDaemonInstallPlan.uninstallCommands.map((command) => (
                                  <code key={formatGatewayCommand(command)} className="block text-xs break-all">
                                    {formatGatewayCommand(command)}
                                  </code>
                                ))}
                              </div>
                            </div>
                          )}

                          {gatewayDaemonInstallPlan.notes.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-foreground">{t('Notes')}</p>
                              <div className="space-y-1">
                                {gatewayDaemonInstallPlan.notes.map((note) => (
                                  <p key={note} className="text-xs text-muted-foreground">
                                    {note}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              onClick={handlePrepareGatewayDaemonInstall}
                              disabled={isPreparingGatewayDaemonInstall || !gatewayDaemonInstallPlan.supported}
                              className="px-4 py-2 bg-primary/10 text-primary text-sm rounded-lg hover:bg-primary/20 transition-colors border border-primary/30 disabled:opacity-50"
                            >
                              {isPreparingGatewayDaemonInstall ? t('Preparing...') : t('Prepare Install Files')}
                            </button>
                            <button
                              onClick={() => requestGatewayDaemonActionConfirmation('install')}
                              disabled={activeGatewayDaemonCommand !== null || !gatewayDaemonPreparedInstall}
                              className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                              {activeGatewayDaemonCommand === 'install' ? t('Running...') : t('Run Install Commands')}
                            </button>
                            <button
                              onClick={() => requestGatewayDaemonActionConfirmation('uninstall')}
                              disabled={activeGatewayDaemonCommand !== null || !gatewayDaemonPreparedInstall}
                              className="px-4 py-2 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                            >
                              {activeGatewayDaemonCommand === 'uninstall' ? t('Running...') : t('Run Uninstall Commands')}
                            </button>
                            {(gatewayDaemonStatus.lockState === 'stale' || gatewayDaemonStatus.lockState === 'error') && (
                              <button
                                onClick={() => requestGatewayDaemonActionConfirmation('clear-lock')}
                                disabled={isClearingGatewayDaemonLock}
                                className="px-4 py-2 bg-amber-500/10 text-amber-700 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/30 disabled:opacity-50 dark:text-amber-400"
                              >
                                {isClearingGatewayDaemonLock ? t('Clearing...') : t('Clear Stale Lock')}
                              </button>
                            )}
                          </div>

                          {gatewayDaemonPreparedInstall && (
                            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{t('Prepared Install Bundle')}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {t('Generated at {{time}}', { time: formatOptionalTimestamp(gatewayDaemonPreparedInstall.generatedAt) })}
                                  </p>
                                </div>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses('ready')}`}>
                                  {t('{{count}} files', { count: gatewayDaemonPreparedInstall.fileCount })}
                                </span>
                              </div>

                              <div className="space-y-2">
                                <div className="rounded-lg border border-border/60 px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-xs text-muted-foreground">{t('Bundle Directory')}</p>
                                      <p className="mt-1 font-mono text-xs break-all">{gatewayDaemonPreparedInstall.bundleDir}</p>
                                    </div>
                                    <button
                                      onClick={() => copyToClipboard(gatewayDaemonPreparedInstall.bundleDir)}
                                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                      {t('Copy')}
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <div className="rounded-lg border border-border/60 px-3 py-2">
                                    <p className="text-xs text-muted-foreground">{t('Manifest')}</p>
                                    <p className="mt-1 font-mono text-xs break-all">{gatewayDaemonPreparedInstall.manifestPath}</p>
                                  </div>
                                  <div className="rounded-lg border border-border/60 px-3 py-2">
                                    <p className="text-xs text-muted-foreground">{t('README')}</p>
                                    <p className="mt-1 font-mono text-xs break-all">{gatewayDaemonPreparedInstall.readmePath}</p>
                                  </div>
                                </div>

                                {gatewayDaemonPreparedInstall.stagedFiles.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-foreground">{t('Prepared Files')}</p>
                                    <div className="space-y-2">
                                      {gatewayDaemonPreparedInstall.stagedFiles.map((file) => (
                                        <div key={file.stagedPath} className="rounded-lg border border-border/60 px-3 py-2">
                                          <p className="text-xs text-muted-foreground">{file.kind}</p>
                                          <p className="mt-1 font-mono text-xs break-all">{file.stagedPath}</p>
                                          <p className="mt-1 text-xs text-muted-foreground break-all">
                                            {t('Target')}: {file.targetPath}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {gatewayDaemonExecutionResult && (
                            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{t('Execution Result')}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {t('{{action}} finished at {{time}}', {
                                      action: gatewayDaemonExecutionResult.action,
                                      time: formatOptionalTimestamp(gatewayDaemonExecutionResult.executedAt)
                                    })}
                                  </p>
                                </div>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(
                                  gatewayDaemonExecutionResult.success ? 'ok' : 'error'
                                )}`}>
                                  {gatewayDaemonExecutionResult.success ? t('Success') : t('Failed')}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                <p>{t('Bundle Directory')}: {gatewayDaemonExecutionResult.bundleDir}</p>
                                <p>{t('Copied Files')}: {gatewayDaemonExecutionResult.copiedFileCount}</p>
                              </div>

                              {gatewayDaemonExecutionResult.note && (
                                <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                                  {gatewayDaemonExecutionResult.note}
                                </div>
                              )}

                              {gatewayDaemonExecutionResult.error && (
                                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500 break-all">
                                  {gatewayDaemonExecutionResult.error}
                                </div>
                              )}

                              {gatewayDaemonExecutionResult.rollbackHints.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-foreground">{t('Rollback Hints')}</p>
                                  <div className="space-y-2">
                                    {gatewayDaemonExecutionResult.rollbackHints.map((hint) => (
                                      <div key={hint} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                        {hint}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {gatewayDaemonExecutionResult.cleanupHints.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-foreground">{t('Cleanup Hints')}</p>
                                  <div className="space-y-2">
                                    {gatewayDaemonExecutionResult.cleanupHints.map((hint) => (
                                      <div key={hint} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                                        {hint}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                {gatewayDaemonExecutionResult.commands.map((commandResult) => (
                                  <div key={`${commandResult.command}-${commandResult.startedAt}`} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                      <code className="text-xs break-all">
                                        {formatGatewayCommand({
                                          command: commandResult.command,
                                          args: commandResult.args
                                        })}
                                      </code>
                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeClasses(
                                        commandResult.success ? 'ok' : 'error'
                                      )}`}>
                                        {commandResult.success ? t('OK') : t('Error')}
                                      </span>
                                    </div>
                                    {commandResult.stdout && (
                                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{commandResult.stdout}</pre>
                                    )}
                                    {commandResult.stderr && (
                                      <pre className="text-xs text-red-500 whitespace-pre-wrap break-words">{commandResult.stderr}</pre>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
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

          <ConfirmDialog
            isOpen={Boolean(gatewayDaemonConfirmAction)}
            title={gatewayDaemonConfirmAction?.title || t('Confirm')}
            message={gatewayDaemonConfirmAction?.message || ''}
            confirmLabel={gatewayDaemonConfirmAction?.confirmLabel}
            variant={gatewayDaemonConfirmAction?.variant || 'warning'}
            onConfirm={() => {
              void handleConfirmGatewayDaemonAction()
            }}
            onCancel={() => setGatewayDaemonConfirmAction(null)}
          />

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
