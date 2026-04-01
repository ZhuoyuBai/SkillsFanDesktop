/**
 * SkillsFan - Main App Component
 *
 * The desktop app is a terminal-first shell around Claude Code.
 * Renderer responsibilities stay focused on app bootstrap, settings,
 * and terminal workspace navigation.
 */

import { useEffect, Suspense, lazy } from 'react'
import { useAppStore } from './stores/app.store'
import { useOnboardingStore } from './stores/onboarding.store'
import { useUpdaterStore, simulateUpdater } from './stores/updater.store'
import { SplashScreen } from './components/splash/SplashScreen'
import { SetupFlow } from './components/setup/SetupFlow'
import { GitBashSetup } from './components/setup/GitBashSetup'
import { OnboardingOverlay } from './components/onboarding'
import { UpdateNotification } from './components/updater/UpdateNotification'
import { Toaster } from './components/ui/Toaster'
import { api } from './api'
import { logger } from './lib/logger'
import type { HaloConfig } from './types'
import { hasAnyAISource } from './types'

const SpacePage = lazy(() => import('./pages/SpacePage').then(m => ({ default: m.SpacePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))

function PageLoader() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </div>
  )
}

const THEME_COLORS = {
  light: { color: '#ffffff', symbolColor: '#1a1a1a' },
  dark: { color: '#0a0a0a', symbolColor: '#ffffff' }
}

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement

  try {
    localStorage.setItem('skillsfan-theme', theme)
  } catch {
    // Ignore storage failures in restricted environments.
  }

  let isDark: boolean
  if (theme === 'system') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('light', !isDark)
  } else {
    isDark = theme === 'dark'
    root.classList.toggle('light', theme === 'light')
  }

  const colors = isDark ? THEME_COLORS.dark : THEME_COLORS.light
  api.setTitleBarOverlay(colors).catch(() => {
    // Ignore unsupported platforms.
  })
}

export default function App() {
  const { view, config, initialize, setView, setConfig } = useAppStore()
  const { initialize: initializeOnboarding } = useOnboardingStore()

  useEffect(() => {
    let initialized = false
    const startTime = Date.now()
    logger.debug('[App] Mounted, waiting for bootstrap:extended-ready...')

    const doInit = async (trigger: 'event' | 'timeout') => {
      if (initialized) return
      initialized = true

      const waitTime = Date.now() - startTime
      logger.debug(`[App] Starting initialization (trigger: ${trigger}, waited: ${waitTime}ms)`)

      await initialize()
      await initializeOnboarding()
    }

    const unsubscribe = api.onBootstrapExtendedReady((data) => {
      logger.debug('[App] Received bootstrap:extended-ready', data)
      void doInit('event')
    })

    const fallbackTimeout = setTimeout(() => {
      if (!initialized) {
        logger.warn('[App] Bootstrap timeout after 10000ms, force initializing...')
        void doInit('timeout')
      }
    }, 10000)

    return () => {
      unsubscribe()
      clearTimeout(fallbackTimeout)
    }
  }, [initialize, initializeOnboarding])

  useEffect(() => {
    const theme = config?.appearance?.theme || 'light'
    applyTheme(theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [config?.appearance?.theme])

  useEffect(() => {
    if (api.isRemoteMode()) {
      logger.debug('[App] Remote mode detected, connecting WebSocket...')
      api.connectWebSocket()
    }
  }, [])

  useEffect(() => {
    const cleanup = useUpdaterStore.getState().init()

    if (import.meta.env.DEV) {
      ;(window as typeof window & { __updaterSimulate?: typeof simulateUpdater }).__updaterSimulate = simulateUpdater
    }

    return cleanup
  }, [])


  const handleGitBashSetupComplete = async (installed: boolean) => {
    logger.debug('[App] Git Bash setup completed, installed:', installed)

    if (!installed) {
      await api.setConfig({ gitBash: { skipped: true, installed: false, path: null } })
    }

    const response = await api.getConfig()
    if (response.success && response.data) {
      const loadedConfig = response.data as HaloConfig
      setConfig(loadedConfig)
      if (loadedConfig.isFirstLaunch || !hasAnyAISource(loadedConfig)) {
        setView('setup')
      } else {
        setView('space')
      }
      return
    }

    setView('setup')
  }

  const renderView = () => {
    switch (view) {
      case 'splash':
        return <SplashScreen />
      case 'gitBashSetup':
        return <GitBashSetup onComplete={handleGitBashSetupComplete} />
      case 'onboarding':
      case 'setup':
        return <SetupFlow />
      case 'space':
        return (
          <Suspense fallback={<PageLoader />}>
            <SpacePage />
          </Suspense>
        )
      case 'settings':
        return (
          <Suspense fallback={<PageLoader />}>
            <SettingsPage />
          </Suspense>
        )
      default:
        return <SplashScreen />
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      {renderView()}
      <OnboardingOverlay />
      <UpdateNotification />
      <Toaster />
    </div>
  )
}
