/**
 * Halo - Main App Component
 */

import { useEffect, useRef, Suspense, lazy } from 'react'
import { useAppStore } from './stores/app.store'
import { useChatStore } from './stores/chat.store'
import { useOnboardingStore } from './stores/onboarding.store'
import { initAIBrowserStoreListeners } from './stores/ai-browser.store'
import { initPerfStoreListeners } from './stores/perf.store'
import { useSpaceStore } from './stores/space.store'
import { useSearchStore } from './stores/search.store'
import { SplashScreen } from './components/splash/SplashScreen'
import { SetupFlow } from './components/setup/SetupFlow'
import { GitBashSetup } from './components/setup/GitBashSetup'
import { SearchPanel } from './components/search/SearchPanel'
import { SearchHighlightBar } from './components/search/SearchHighlightBar'
import { OnboardingOverlay, OnboardingFlow } from './components/onboarding'
import { UpdateNotification } from './components/updater/UpdateNotification'
import { Toaster } from './components/ui/Toaster'
import { api } from './api'
import { logger } from './lib/logger'
import type { AgentEventBase, Thought, ToolCall, HaloConfig } from './types'
import { hasAnyAISource } from './types'

// Lazy load heavy page components for better initial load performance
// These pages contain complex components (chat, markdown, code highlighting, etc.)
const SpacePage = lazy(() => import('./pages/SpacePage').then(m => ({ default: m.SpacePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))


// Page loading fallback - minimal spinner that matches app style
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

// Theme colors for titleBarOverlay
const THEME_COLORS = {
  light: { color: '#ffffff', symbolColor: '#1a1a1a' },
  dark: { color: '#0a0a0a', symbolColor: '#ffffff' }
}

// Apply theme to document and sync to localStorage (for anti-flash on reload)
function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement

  // Save to localStorage for anti-flash script
  try {
    localStorage.setItem('skillsfan-theme', theme)
  } catch (e) { /* ignore */ }

  let isDark: boolean
  if (theme === 'system') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('light', !isDark)
  } else {
    isDark = theme === 'dark'
    root.classList.toggle('light', theme === 'light')
  }

  // Update titleBarOverlay colors (Windows/Linux only)
  const colors = isDark ? THEME_COLORS.dark : THEME_COLORS.light
  api.setTitleBarOverlay(colors).catch(() => {
    // Ignore errors - may not be supported on current platform
  })
}

export default function App() {
  const { view, config, initialize, setMcpStatus, setView, setConfig } = useAppStore()
  const {
    handleAgentStart,
    handleAgentMessage,
    handleAgentToolCall,
    handleAgentToolResult,
    handleAgentError,
    handleAgentComplete,
    handleAgentThought,
    handleAgentCompact,
    handleAgentUserQuestion,
    handleAgentUserQuestionAnswered,
    currentSpaceId,
    setCurrentSpace: setChatCurrentSpace,
    loadConversations,
    selectConversation
  } = useChatStore()
  const { initialize: initializeOnboarding } = useOnboardingStore()
  const { isSearchOpen, closeSearch, isHighlightBarVisible, hideHighlightBar, goToPreviousResult, goToNextResult, openSearch } = useSearchStore()

  // For search result navigation
  const { spaces, haloSpace, setCurrentSpace: setSpaceStoreCurrentSpace } = useSpaceStore()

  // Initialize app on mount - wait for backend extended services to be ready
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
      // Initialize onboarding after app config is loaded
      await initializeOnboarding()
    }

    // Listen for extended services ready event from main process
    const unsubscribe = api.onBootstrapExtendedReady((data) => {
      logger.debug('[App] Received bootstrap:extended-ready', data)
      doInit('event')
    })

    // Fallback timeout - if event not received in 5 seconds, initialize anyway
    // This prevents the app from being stuck if something goes wrong
    const fallbackTimeout = setTimeout(() => {
      if (!initialized) {
        logger.warn('[App] Bootstrap timeout after 10000ms, force initializing...')
        doInit('timeout')
      }
    }, 10000)

    return () => {
      unsubscribe()
      clearTimeout(fallbackTimeout)
    }
  }, [initialize, initializeOnboarding])

  // Theme switching
  useEffect(() => {
    // Default to 'light' before config loads, then use config value
    const theme = config?.appearance?.theme || 'light'
    applyTheme(theme)

    // Listen for system theme changes when using 'system' mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [config?.appearance?.theme])

  // Connect WebSocket for remote mode
  useEffect(() => {
    if (api.isRemoteMode()) {
      logger.debug('[App] Remote mode detected, connecting WebSocket...')
      api.connectWebSocket()
    }
  }, [])

  // Initialize AI Browser IPC listeners for active view sync
  useEffect(() => {
    logger.debug('[App] Initializing AI Browser store listeners')
    initPerfStoreListeners()
    const cleanup = initAIBrowserStoreListeners()
    return cleanup
  }, [])

  // Register agent event listeners (global - handles events for all conversations)
  useEffect(() => {
    logger.debug('[App] Registering agent event listeners')

    // Agent start - message actually begins executing (after queue wait)
    const unsubStart = api.onAgentStart((data) => {
      handleAgentStart(data as AgentEventBase)
    })

    // Primary thought listener - handles all agent reasoning events
    const unsubThought = api.onAgentThought((data) => {
      logger.debug('[App] Received agent:thought event:', data)
      handleAgentThought(data as AgentEventBase & { thought: Thought })
    })

    // Message events (with session IDs)
    const unsubMessage = api.onAgentMessage((data) => {
      logger.debug('[App] Received agent:message event:', data)
      handleAgentMessage(data as AgentEventBase & { content: string; isComplete: boolean })
    })

    const unsubToolCall = api.onAgentToolCall((data) => {
      logger.debug('[App] Received agent:tool-call event:', data)
      handleAgentToolCall(data as AgentEventBase & ToolCall)
    })

    const unsubToolResult = api.onAgentToolResult((data) => {
      logger.debug('[App] Received agent:tool-result event:', data)
      handleAgentToolResult(data as AgentEventBase & { toolId: string; result: string; isError: boolean })
    })

    const unsubError = api.onAgentError((data) => {
      logger.debug('[App] Received agent:error event:', data)
      handleAgentError(data as AgentEventBase & { error: string; errorCode?: number })
    })

    const unsubComplete = api.onAgentComplete((data) => {
      logger.debug('[App] Received agent:complete event:', data)
      handleAgentComplete(data as AgentEventBase)
    })

    const unsubCompact = api.onAgentCompact((data) => {
      logger.debug('[App] Received agent:compact event:', data)
      handleAgentCompact(data as AgentEventBase & { trigger: 'manual' | 'auto'; preTokens: number })
    })

    const unsubUserQuestion = api.onAgentUserQuestion((data) => {
      logger.debug('[App] Received agent:user-question event:', data)
      handleAgentUserQuestion(data as AgentEventBase & { toolId: string; questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> })
    })

    const unsubUserQuestionAnswered = api.onAgentUserQuestionAnswered((data) => {
      logger.debug('[App] Received agent:user-question-answered event:', data)
      handleAgentUserQuestionAnswered(data as AgentEventBase)
    })

    // MCP status updates (global - not per-conversation)
    const unsubMcpStatus = api.onAgentMcpStatus((data) => {
      logger.debug('[App] Received agent:mcp-status event:', data)
      const event = data as { servers: Array<{ name: string; status: string }>; timestamp: number }
      if (event.servers) {
        setMcpStatus(event.servers as any, event.timestamp)
      }
    })

    // SkillsFan login success - complete model setup then go to chat
    // Only handles login from non-setup contexts (Settings, Onboarding).
    // SetupFlow handles its own login completion to avoid race conditions.
    const unsubSkillsFanLogin = api.onSkillsFanLoginSuccess(async () => {
      const currentView = useAppStore.getState().view
      if (currentView === 'setup') {
        logger.debug('[App] SkillsFan login success, but SetupFlow is handling it')
        return
      }

      logger.debug('[App] SkillsFan login success, completing model setup...')

      // Complete login via AISourceManager - fetches models, saves tokens + models to config
      const completeResult = await api.authCompleteLogin('skillsfan-credits', 'skillsfan-credits-login')
      if (completeResult.success) {
        logger.debug('[App] SkillsFan model setup complete')
      } else {
        logger.warn('[App] Failed to complete model setup:', completeResult.error)
      }

      // Reload config into store (now includes skillsfan-credits with models)
      const configResult = await api.getConfig()
      if (configResult.success && configResult.data) {
        setConfig(configResult.data as HaloConfig)
      }

      // Load spaces and navigate to chat
      await useSpaceStore.getState().loadSpaces()
      const { haloSpace } = useSpaceStore.getState()
      if (haloSpace) {
        useSpaceStore.getState().setCurrentSpace(haloSpace)
      }
      setView('space')
    })

    return () => {
      unsubThought()
      unsubMessage()
      unsubStart()
      unsubToolCall()
      unsubToolResult()
      unsubError()
      unsubComplete()
      unsubCompact()
      unsubUserQuestion()
      unsubUserQuestionAnswered()
      unsubMcpStatus()
      unsubSkillsFanLogin()
    }
  }, [
    handleAgentStart,
    handleAgentMessage,
    handleAgentToolCall,
    handleAgentToolResult,
    handleAgentError,
    handleAgentComplete,
    handleAgentThought,
    handleAgentCompact,
    handleAgentUserQuestion,
    handleAgentUserQuestionAnswered,
    setMcpStatus
  ])

  // Handle search keyboard shortcuts with debouncing for navigation
  // Use ref to maintain debounce timer across renders
  const navigationDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingNavigationRef = useRef<(() => void) | null>(null)

  const debouncedNavigate = (callback: () => void) => {
    // Clear previous timeout
    if (navigationDebounceTimerRef.current) {
      clearTimeout(navigationDebounceTimerRef.current)
    }

    // Store the pending navigation
    pendingNavigationRef.current = callback

    // Set new timeout - debounce for 300ms
    navigationDebounceTimerRef.current = setTimeout(() => {
      logger.debug('[App] Executing debounced keyboard navigation')
      pendingNavigationRef.current?.()
      pendingNavigationRef.current = null
      navigationDebounceTimerRef.current = null
    }, 300)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when highlight bar is visible
      if (!isHighlightBarVisible) return

      const isMac = typeof navigator !== 'undefined' &&
        navigator.platform.toUpperCase().indexOf('MAC') >= 0

      // Esc - Close highlight bar (no debounce needed)
      if (e.key === 'Escape') {
        e.preventDefault()
        hideHighlightBar()
        return
      }

      // Arrow up - Navigate to earlier result (with debounce)
      // Note: In time-sorted results (newest first), earlier = higher index
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        debouncedNavigate(() => {
          logger.debug('[App] Keyboard: navigating to earlier result')
          goToNextResult() // goToNextResult increases index = earlier in time
        })
        return
      }

      // Arrow down - Navigate to more recent result (with debounce)
      // Note: In time-sorted results (newest first), more recent = lower index
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        debouncedNavigate(() => {
          logger.debug('[App] Keyboard: navigating to more recent result')
          goToPreviousResult() // goToPreviousResult decreases index = more recent in time
        })
        return
      }

      // Ctrl+K / Cmd+K - Open search to edit (no debounce needed)
      const metaKey = isMac ? e.metaKey : e.ctrlKey
      if (metaKey && e.key === 'k' && !e.shiftKey) {
        e.preventDefault()
        openSearch()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isHighlightBarVisible, hideHighlightBar, goToPreviousResult, goToNextResult, openSearch])

  // Handle search result navigation from highlight bar
  // This handles the complete navigation flow when user clicks [↑][↓] or uses arrow keys
  useEffect(() => {
    const handleNavigateToResult = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        messageId: string
        spaceId: string
        conversationId: string
        query: string
        resultIndex: number
      }>

      const { messageId, spaceId, conversationId, query } = customEvent.detail

      logger.debug(`[App] search:navigate-to-result event - space=${spaceId}, conv=${conversationId}, msg=${messageId}`)

      try {
        // Step 1: If switching spaces, update both stores
        if (spaceId !== currentSpaceId) {
          logger.debug(`[App] Switching to space: ${spaceId}`)

          // Find the space object
          let targetSpace = null
          if (spaceId === 'halo-temp' && haloSpace) {
            targetSpace = haloSpace
          } else {
            targetSpace = spaces.find(s => s.id === spaceId)
          }

          if (!targetSpace) {
            logger.error(`[App] Space not found: ${spaceId}`)
            return
          }

          // Update spaceStore
          logger.debug(`[App] Updating space to: ${targetSpace.name}`)
          setSpaceStoreCurrentSpace(targetSpace)

          // Update chatStore
          setChatCurrentSpace(spaceId)

          // Give state time to update
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        // Step 2: Load conversations if needed
        logger.debug(`[App] Loading conversations for space: ${spaceId}`)
        await loadConversations(spaceId)

        // Step 3: Select conversation
        logger.debug(`[App] Selecting conversation: ${conversationId}`)
        await selectConversation(conversationId)

        // Step 4: Wait for message element to render and navigate
        logger.debug(`[App] Waiting for message element: ${messageId}`)

        const waitForMessageElement = (targetMessageId: string, timeoutMs: number): Promise<Element | null> => {
          return new Promise((resolve) => {
            const selector = `[data-message-id="${targetMessageId}"]`
            const existingElement = document.querySelector(selector)
            if (existingElement) {
              resolve(existingElement)
              return
            }

            let timeoutId: number | null = null
            const observer = new MutationObserver(() => {
              const target = document.querySelector(selector)
              if (target) {
                observer.disconnect()
                if (timeoutId !== null) {
                  window.clearTimeout(timeoutId)
                }
                resolve(target)
              }
            })

            observer.observe(document.body, { childList: true, subtree: true })

            timeoutId = window.setTimeout(() => {
              observer.disconnect()
              resolve(null)
            }, timeoutMs)
          })
        }

        const messageElement = await waitForMessageElement(messageId, 5000)
        if (!messageElement) {
          logger.warn(`[App] Message element not found before timeout`)
          return
        }

        logger.debug(`[App] Message element found, dispatching navigate event`)
        const navEvent = new CustomEvent('search:navigate-to-message', {
          detail: {
            messageId,
            query
          }
        })
        window.dispatchEvent(navEvent)
      } catch (error) {
        logger.error(`[App] Error navigating to result:`, error)
      }
    }

    window.addEventListener('search:navigate-to-result', handleNavigateToResult)
    return () => window.removeEventListener('search:navigate-to-result', handleNavigateToResult)
  }, [currentSpaceId, spaces, haloSpace, setSpaceStoreCurrentSpace, setChatCurrentSpace, loadConversations, selectConversation])

  // Handle Git Bash setup completion
  const handleGitBashSetupComplete = async (installed: boolean) => {
    logger.debug('[App] Git Bash setup completed, installed:', installed)

    // Save skip preference if not installed
    if (!installed) {
      await api.setConfig({ gitBash: { skipped: true, installed: false, path: null } })
    }

    // Continue with normal initialization - sync config to store
    const response = await api.getConfig()
    if (response.success && response.data) {
      const loadedConfig = response.data as HaloConfig
      setConfig(loadedConfig)  // Sync config to store (was missing, causing empty apiKey in settings)
      // Show setup if first launch or no AI source configured
      if (loadedConfig.isFirstLaunch || !hasAnyAISource(loadedConfig)) {
        setView('setup')
      } else {
        setView('space')
      }
    } else {
      setView('setup')
    }
  }

  // Handle onboarding login - open SkillsFan web login
  const handleOnboardingLogin = async () => {
    logger.debug('[App] Starting SkillsFan login from onboarding')
    try {
      const result = await api.skillsfanStartLogin()
      if (result.success) {
        // Login flow started, wait for callback
        // The auth flow will trigger initialize() after successful login
        logger.debug('[App] SkillsFan login started successfully')
      } else {
        logger.error('[App] Failed to start SkillsFan login:', result.error)
      }
    } catch (e) {
      logger.error('[App] Error starting SkillsFan login:', e)
    }
  }

  // Render based on current view
  // Heavy pages (HomePage, SpacePage, SettingsPage) are lazy-loaded for better initial performance
  const renderView = () => {
    switch (view) {
      case 'splash':
        return <SplashScreen />
      case 'gitBashSetup':
        return <GitBashSetup onComplete={handleGitBashSetupComplete} />
      case 'onboarding':
        return (
          <OnboardingFlow
            onComplete={() => setView('setup')}
            onLogin={handleOnboardingLogin}
            onStartNow={async () => {
              await api.setConfig({ isFirstLaunch: false })
              await useSpaceStore.getState().loadSpaces()
              const { haloSpace } = useSpaceStore.getState()
              if (haloSpace) {
                useSpaceStore.getState().setCurrentSpace(haloSpace)
              }
              setView('space')
            }}
          />
        )
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
      {/* Search panel - full screen edit mode */}
      <SearchPanel isOpen={isSearchOpen} onClose={closeSearch} />
      {/* Search highlight bar - floating navigation mode */}
      <SearchHighlightBar />
      {/* Onboarding overlay - renders on top of everything */}
      <OnboardingOverlay />
      {/* Update notification - shows when update is downloaded */}
      <UpdateNotification />
      {/* Global toast notifications */}
      <Toaster />
    </div>
  )
}
