/**
 * App Store - Global application state
 */

import { create } from 'zustand'
import { api } from '../api'
import i18n from '../i18n'
import type { HaloConfig, AppView, McpServerStatus } from '../types'
import { hasAnyAISource } from '../types'
import { useSpaceStore } from './space.store'
import { syncAIBrowserStoreWithConfig } from './ai-browser.store'
import { createLogger } from '../lib/logger'

// Settings section type (must match SettingsPage)
export type SettingsSection = 'ai-model' | 'display' | 'mcp' | 'skills' | 'system' | 'computer-automation' | 'remote' | 'account' | 'spaces' | 'advanced'

// Git Bash installation progress
interface GitBashInstallProgress {
  phase: 'idle' | 'downloading' | 'extracting' | 'configuring' | 'done' | 'error'
  progress: number
  message: string
  error?: string
}

interface AppState {
  // View state
  view: AppView
  previousView: AppView | null  // Track previous view for back navigation
  isLoading: boolean
  error: string | null

  // Config
  config: HaloConfig | null

  // MCP Status (cached from last conversation)
  mcpStatus: McpServerStatus[]
  mcpStatusTimestamp: number | null  // When status was last updated

  // Git Bash mock mode (Windows only)
  mockBashMode: boolean
  gitBashInstallProgress: GitBashInstallProgress

  // Settings page initial section
  settingsSection: SettingsSection | null

  // SkillsFan account login state (single source of truth for UI)
  skillsfanLoggedIn: boolean

  // Model selector (pre-loaded once during init, cached in store)
  publicModels: Array<{ id: string; name: string; owned_by: string }>
  authProviders: Array<{ type: string; displayName: string | Record<string, string>; enabled: boolean; recommended?: boolean }>

  // Actions
  setView: (view: AppView) => void
  goBack: () => void  // Navigate back to previous view
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setConfig: (config: HaloConfig) => void
  updateConfig: (updates: Partial<HaloConfig>) => void
  setMcpStatus: (status: McpServerStatus[], timestamp: number) => void
  setSkillsfanLoggedIn: (loggedIn: boolean) => void
  setPublicModels: (models: Array<{ id: string; name: string; owned_by: string }>) => void
  setAuthProviders: (providers: Array<{ type: string; displayName: string | Record<string, string>; enabled: boolean; recommended?: boolean }>) => void

  // Git Bash actions
  setMockBashMode: (mode: boolean) => void
  startGitBashInstall: () => Promise<void>
  refreshGitBashStatus: () => Promise<void>

  // Settings actions
  setSettingsSection: (section: SettingsSection | null) => void
  openSettingsWithSection: (section: SettingsSection) => void

  // Initialization
  initialize: () => Promise<void>
}

const appLogger = createLogger('AppStore')

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  view: 'splash',
  previousView: null,
  isLoading: true,
  error: null,
  config: null,
  mcpStatus: [],
  mcpStatusTimestamp: null,
  mockBashMode: false,
  gitBashInstallProgress: { phase: 'idle', progress: 0, message: '' },
  settingsSection: null,
  skillsfanLoggedIn: false,
  publicModels: [],
  authProviders: [],

  // Actions
  setView: (view) => {
    const currentView = get().view
    // Save current view as previous (except for splash and setup screens)
    if (currentView !== 'splash' && currentView !== 'setup') {
      set({ previousView: currentView, view })
    } else {
      set({ view })
    }
  },

  goBack: () => {
    const previousView = get().previousView
    // Go back to previous view, or default to space
    set({ view: previousView || 'space', previousView: null })
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setConfig: (config) => {
    syncAIBrowserStoreWithConfig(config)
    set({ config })
  },

  updateConfig: (updates) => {
    const currentConfig = get().config
    if (currentConfig) {
      const nextConfig = { ...currentConfig, ...updates }
      syncAIBrowserStoreWithConfig(nextConfig)
      set({ config: nextConfig })
    }
  },

  setMcpStatus: (status, timestamp) => {
    set({ mcpStatus: status, mcpStatusTimestamp: timestamp })
  },
  setSkillsfanLoggedIn: (loggedIn) => set({ skillsfanLoggedIn: loggedIn }),
  setPublicModels: (models) => set({ publicModels: models }),
  setAuthProviders: (providers) => set({ authProviders: providers }),

  // Settings actions
  setSettingsSection: (section) => set({ settingsSection: section }),

  openSettingsWithSection: (section) => {
    set({ settingsSection: section })
    get().setView('settings')
  },

  // Git Bash actions
  setMockBashMode: (mode) => set({ mockBashMode: mode }),

  startGitBashInstall: async () => {
    set({
      gitBashInstallProgress: { phase: 'downloading', progress: 0, message: i18n.t('Preparing download...') }
    })

    try {
      const result = await api.installGitBash((progressData) => {
        set({
          gitBashInstallProgress: {
            phase: progressData.phase as GitBashInstallProgress['phase'],
            progress: progressData.progress,
            message: progressData.message,
            error: progressData.error
          }
        })
      })

      if (result.success) {
        set({
          gitBashInstallProgress: { phase: 'done', progress: 100, message: i18n.t('Installation complete') }
        })
        // Refresh status after successful install
        await get().refreshGitBashStatus()
      } else {
        set({
          gitBashInstallProgress: {
            phase: 'error',
            progress: 0,
            message: i18n.t('Installation failed'),
            error: result.error || 'Unknown error'
          }
        })
      }
    } catch (e) {
      set({
        gitBashInstallProgress: {
          phase: 'error',
          progress: 0,
          message: i18n.t('Installation failed'),
          error: e instanceof Error ? e.message : String(e)
        }
      })
    }
  },

  refreshGitBashStatus: async () => {
    if (!window.platform?.isWindows) return

    try {
      const status = await api.getGitBashStatus()
      if (status.success && status.data) {
        const { mockMode } = status.data
        set({ mockBashMode: !!mockMode })

        // Reset install progress if no longer in mock mode
        if (!mockMode) {
          set({
            gitBashInstallProgress: { phase: 'idle', progress: 0, message: '' }
          })
        }
      }
    } catch (e) {
      appLogger.error('[App] Failed to refresh Git Bash status:', e)
    }
  },

  // Initialize app
  initialize: async () => {
    appLogger.debug('[Store] initialize() called')
    try {
      set({ isLoading: true, error: null })

      // Windows: Check Git Bash availability first
      if (window.platform?.isWindows) {
        appLogger.debug('[Store] Windows detected, checking Git Bash status...')
        const gitBashStatus = await api.getGitBashStatus()
        appLogger.debug('[Store] Git Bash status response:', gitBashStatus)
        if (gitBashStatus.success && gitBashStatus.data) {
          const { found, source, mockMode } = gitBashStatus.data

          // Track mock mode for showing warning banner later
          if (mockMode) {
            appLogger.debug('[Store] Git Bash in mock mode, will show warning banner')
            set({ mockBashMode: true })
          }

          // If Git Bash not found and not previously configured, show setup
          if (!found && !mockMode) {
            appLogger.debug('[Store] Git Bash not found, showing setup')
            set({ view: 'gitBashSetup', isLoading: false })
            return
          }

          appLogger.debug('[Store] Git Bash found:', source, mockMode ? '(mock mode)' : '')
        }
      }

      // Load config from main process
      appLogger.debug('[Store] Loading config...')
      const response = await api.getConfig()
      appLogger.debug('[Store] Config response:', response.success ? 'success' : 'failed')

      if (response.success && response.data) {
        const config = response.data as HaloConfig

        get().setConfig(config)

        // Determine initial view based on config
        // Skip onboarding - go directly to setup or space
        // No AI source configured: show setup directly
        if (!hasAnyAISource(config)) {
          appLogger.debug('[Store] No AI source configured, showing setup')
          set({ view: 'setup' })
        } else {
          // Go to space directly (skip home page)
          // Load all spaces (including Halo) and set default space
          appLogger.debug('[Store] Loading spaces before showing space view...')
          await useSpaceStore.getState().loadSpaces()

          // Get loaded spaces and configured default
          const { haloSpace, spaces } = useSpaceStore.getState()
          const defaultSpaceId = config.spaces?.defaultSpaceId

          // Determine target space: configured default or Halo
          let targetSpace = haloSpace
          if (defaultSpaceId) {
            const customSpace = spaces.find(s => s.id === defaultSpaceId)
            if (customSpace) {
              targetSpace = customSpace
              appLogger.debug('[Store] Using configured default space:', customSpace.name)
            } else {
              appLogger.warn('[Store] Configured default space not found, falling back to Halo')
            }
          }

          if (targetSpace) {
            useSpaceStore.getState().setCurrentSpace(targetSpace)
            appLogger.debug('[Store] Default space loaded and set:', targetSpace.name)
          } else {
            appLogger.warn('[Store] No space found, but continuing to space view')
          }
          appLogger.debug('[Store] Config loaded, showing space')
          set({ view: 'space' })

          // Refresh AI sources in background (fetch latest models from backend)
          api.refreshAISourcesConfig().then((refreshResult) => {
            if (refreshResult.success) {
              appLogger.debug('[Store] AI sources refreshed on startup')
              api.getConfig().then((configResult) => {
                if (configResult.success && configResult.data) {
                  get().setConfig(configResult.data as HaloConfig)
                }
              })
            }
          }).catch(() => {
            // Non-critical, ignore errors
          })

          // Pre-load SkillsFan login state, public models, and auth providers (for model selector)
          api.skillsfanGetAuthState().then((result) => {
            if (result.success && result.data) {
              set({ skillsfanLoggedIn: !!(result.data as any).isLoggedIn })
            }
          }).catch(() => {})

          api.getPublicModels().then((result) => {
            if (result.success && result.data) {
              set({ publicModels: result.data as Array<{ id: string; name: string; owned_by: string }> })
              appLogger.debug('[Store] Public models pre-loaded:', (result.data as any[]).length)
            }
          }).catch(() => {})

          api.authGetProviders().then((result) => {
            if (result.success && result.data) {
              set({ authProviders: result.data as any[] })
              appLogger.debug('[Store] Auth providers pre-loaded:', (result.data as any[]).length)
            }
          }).catch(() => {})
        }
      } else {
        appLogger.error('[Store] Failed to load config:', response.error)
        set({ error: response.error || i18n.t('Failed to load configuration') })
        set({ view: 'setup' })
      }
    } catch (error) {
      appLogger.error('[Store] Failed to initialize:', error)
      set({ error: i18n.t('Failed to initialize application') })
      set({ view: 'setup' })
    } finally {
      set({ isLoading: false })
      appLogger.debug('[Store] initialize() completed')
    }
  }
}))
