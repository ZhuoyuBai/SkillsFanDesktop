/**
 * Space Page - Chat interface with artifact rail and content canvas
 * Supports multi-conversation with isolated session states per space
 *
 * Layout modes:
 * - Chat mode: Full-width chat view (when no canvas tabs open)
 * - Canvas mode: Split view with narrower chat + content canvas
 * - Mobile mode: Full-screen panels with overlay canvas
 *
 * Layout preferences:
 * - Artifact Rail expansion state (persisted per space)
 * - Chat width when canvas is open (persisted per space)
 * - Maximized mode overrides (temporary)
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { useChatStore } from '../stores/chat.store'
import { useCanvasStore, useCanvasIsOpen, useCanvasIsMaximized } from '../stores/canvas.store'
import { canvasLifecycle } from '../services/canvas-lifecycle'
import { useSearchStore } from '../stores/search.store'
import { ChatView } from '../components/chat/ChatView'
import { ArtifactRail } from '../components/artifact/ArtifactRail'
import { ConversationList } from '../components/chat/ConversationList'
import { SpaceIcon } from '../components/icons/ToolIcons'
import { Header, usePlatform } from '../components/layout/Header'
import { HaloLogo } from '../components/brand/HaloLogo'
import { ContentCanvas, CanvasToggleButton } from '../components/canvas'
import { GitBashWarningBanner } from '../components/setup/GitBashWarningBanner'
import { api } from '../api'
import { useLayoutPreferences, LAYOUT_DEFAULTS } from '../hooks/useLayoutPreferences'
import { useWindowMaximize } from '../components/canvas/viewers/useWindowMaximize'
import { PanelLeftClose, PanelLeft, X, MessageSquare, Menu, SquarePen, Settings, FolderOpen } from 'lucide-react'
import { useSearchShortcuts } from '../hooks/useSearchShortcuts'
import { useTranslation } from '../i18n'
// Mobile breakpoint (matches Tailwind sm: 640px)
const MOBILE_BREAKPOINT = 640

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}

export function SpacePage() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const { setView, mockBashMode, gitBashInstallProgress, startGitBashInstall } = useAppStore()
  const { currentSpace, refreshCurrentSpace, openSpaceFolder } = useSpaceStore()
  const {
    currentSpaceId,
    setCurrentSpace,
    getConversations,
    getCurrentConversation,
    getCurrentConversationId,
    isLoading,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    clearAllConversations,
    renameConversation
  } = useChatStore()

  // Get current data from store
  const conversations = getConversations()
  const currentConversation = getCurrentConversation()
  const currentConversationId = getCurrentConversationId()

  // Conversation list collapse state (default: expanded = not collapsed)
  const [isConversationListCollapsed, setIsConversationListCollapsed] = useState(false)

  // Mobile sidebar overlay state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Clear all conversations dialog state
  const [showClearAllDialog, setShowClearAllDialog] = useState(false)

  // Canvas state - use precise selectors to minimize re-renders
  const isCanvasOpen = useCanvasIsOpen()
  const isCanvasMaximized = useCanvasIsMaximized()
  // Only subscribe to tab count, not entire tabs array (avoid re-render on tab content changes)
  const canvasTabCount = useCanvasStore(state => state.tabs.length)
  const isCanvasTransitioning = useCanvasStore(state => state.isTransitioning)
  const setCanvasOpen = useCanvasStore(state => state.setOpen)
  const setCanvasMaximized = useCanvasStore(state => state.setMaximized)
  // Detect if any browser tab is open (native BrowserView)
  // When browser tabs exist, disable CSS transitions to sync with native view resize
  // Use selector to compute this inside store subscription (avoids subscribing to full tabs array)
  const hasBrowserTab = useCanvasStore(state => state.tabs.some(tab => tab.type === 'browser'))

  // Mobile detection
  const isMobile = useIsMobile()

  // Window maximize state
  const { isMaximized } = useWindowMaximize()

  // Layout preferences (persisted per space)
  const {
    effectiveRailExpanded,
    effectiveChatWidth,
    setRailExpanded,
    setChatWidth,
    chatWidthMin,
    chatWidthMax,
  } = useLayoutPreferences(currentSpace?.id, isMaximized)

  // Chat width drag state
  const [isDraggingChat, setIsDraggingChat] = useState(false)
  const [dragChatWidth, setDragChatWidth] = useState(effectiveChatWidth)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Search UI state
  const { openSearch } = useSearchStore()

  // Sync drag width with effective width when not dragging
  useEffect(() => {
    if (!isDraggingChat) {
      setDragChatWidth(effectiveChatWidth)
    }
  }, [effectiveChatWidth, isDraggingChat])

  // Handle chat width drag
  const handleChatDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingChat(true)
  }, [])

  // Chat drag move/end handlers
  useEffect(() => {
    if (!isDraggingChat) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!chatContainerRef.current) return

      // Calculate width from left edge of chat container to mouse position
      const containerRect = chatContainerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - containerRect.left

      // Clamp to constraints
      const clampedWidth = Math.max(chatWidthMin, Math.min(chatWidthMax, newWidth))
      setDragChatWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDraggingChat(false)
      // Persist the final width
      setChatWidth(dragChatWidth)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingChat, dragChatWidth, chatWidthMin, chatWidthMax, setChatWidth])

  // Close canvas when switching to mobile with canvas open
  useEffect(() => {
    if (isMobile && isCanvasOpen) {
      // Keep canvas open on mobile but we'll show it as overlay
    }
  }, [isMobile, isCanvasOpen])

  // Space isolation: clear canvas tabs when switching to a different space
  useEffect(() => {
    if (currentSpace) {
      canvasLifecycle.enterSpace(currentSpace.id)
    }
  }, [currentSpace?.id])

  // BrowserView visibility: hide when leaving SpacePage, show when returning
  useEffect(() => {
    if (!currentSpace) return

    if (isCanvasOpen) {
      canvasLifecycle.showActiveBrowserView()
    }

    return () => {
      canvasLifecycle.hideAllBrowserViews()
    }
  }, [currentSpace?.id, isCanvasOpen])

  // Initialize space when entering
  useEffect(() => {
    if (!currentSpace) return

    // Set current space in chat store
    setCurrentSpace(currentSpace.id)

    // Load conversations if not already loaded for this space
    const initSpace = async () => {
      await loadConversations(currentSpace.id)

      // After loading, check if we need to select or create a conversation
      const store = useChatStore.getState()
      const spaceState = store.getSpaceState(currentSpace.id)

      // Decision tree based on actual conversation state (不再依赖 freshStart)
      if (spaceState.conversations.length === 0) {
        // Case 1: No conversations exist at all
        // This handles first-time users - create a new conversation
        console.log('[SpacePage] No conversations found, creating first conversation')
        await createConversation(currentSpace.id)

        // Clear freshStart flag for backward compatibility
        if (store.freshStart) {
          store.setFreshStart(false)
        }
        return
      }

      // Case 2: Conversations exist - find and reuse an empty one
      const emptyConversation = spaceState.conversations.find((c) => c.messageCount === 0)

      if (emptyConversation) {
        // Reuse the latest empty conversation (already sorted by backend)
        console.log('[SpacePage] Reusing empty conversation:', emptyConversation.id)

        // Touch it to update timestamp and move to top
        await api.touchConversation(currentSpace.id, emptyConversation.id)

        // Reload to get updated sort order
        await loadConversations(currentSpace.id)

        // Select the touched conversation
        selectConversation(emptyConversation.id)
      } else if (!spaceState.currentConversationId) {
        // No empty conversation and nothing selected - select the first one
        console.log('[SpacePage] No empty conversation, selecting most recent')
        selectConversation(spaceState.conversations[0].id)
      }
      // else: A conversation is already selected, do nothing

      // Clear freshStart flag for backward compatibility
      if (store.freshStart) {
        store.setFreshStart(false)
      }
    }

    initSpace()
  }, [currentSpace?.id]) // Only re-run when space ID changes

  // Handle new conversation
  const handleNewConversation = async () => {
    if (!currentSpace) return

    // Don't create a new conversation if the current one is already empty
    if (currentConversation && currentConversation.messages.length === 0) {
      return
    }

    await createConversation(currentSpace.id)
  }

  // Handle open folder
  const handleOpenFolder = () => {
    if (currentSpace) {
      openSpaceFolder(currentSpace.id)
    }
  }

  // Fallback if no space is selected (should not happen normally)
  if (!currentSpace) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-muted-foreground">{t('No space selected')}</p>
      </div>
    )
  }

  // Handle delete conversation
  const handleDeleteConversation = async (conversationId: string) => {
    if (currentSpace) {
      await deleteConversation(currentSpace.id, conversationId)
    }
  }

  // Handle rename conversation
  const handleRenameConversation = async (conversationId: string, newTitle: string) => {
    if (currentSpace) {
      await renameConversation(currentSpace.id, conversationId, newTitle)
    }
  }

  // Handle clear all conversations
  const handleClearAllClick = () => {
    setShowClearAllDialog(true)
  }

  const handleClearAllConfirm = async () => {
    if (currentSpace) {
      await clearAllConversations(currentSpace.id)
      setShowClearAllDialog(false)
    }
  }

  const handleClearAllCancel = () => {
    setShowClearAllDialog(false)
  }

  // Exit maximized mode when canvas closes
  useEffect(() => {
    if (!isCanvasOpen && isCanvasMaximized) {
      setCanvasMaximized(false)
    }
  }, [isCanvasOpen, isCanvasMaximized, setCanvasMaximized])

  // Auto-collapse rail when entering maximized mode, restore when exiting
  const prevMaximizedRef = useRef(isCanvasMaximized)
  const railExpandedBeforeMaximize = useRef(effectiveRailExpanded)

  useEffect(() => {
    if (isCanvasMaximized && !prevMaximizedRef.current) {
      // Entering maximized mode - save current state and collapse
      railExpandedBeforeMaximize.current = effectiveRailExpanded
      if (effectiveRailExpanded) {
        setRailExpanded(false)
      }
      // Show overlay chat capsule (renders above BrowserView)
      if (!isMobile) {
        api.showChatCapsuleOverlay()
      }
    } else if (!isCanvasMaximized && prevMaximizedRef.current) {
      // Exiting maximized mode - restore previous state
      if (railExpandedBeforeMaximize.current) {
        setRailExpanded(true)
      }
      // Hide overlay chat capsule
      if (!isMobile) {
        api.hideChatCapsuleOverlay()
      }
    }
    prevMaximizedRef.current = isCanvasMaximized
  }, [isCanvasMaximized, effectiveRailExpanded, setRailExpanded, isMobile])

  // Listen for exit-maximized event from overlay
  useEffect(() => {
    const cleanup = api.onCanvasExitMaximized(() => {
      console.log('[SpacePage] Received exit-maximized from overlay')
      setCanvasMaximized(false)
    })
    return cleanup
  }, [setCanvasMaximized])

  // Setup search shortcuts
  useSearchShortcuts({
    enabled: true,
    onSearch: (scope) => openSearch(scope)
  })

  return (
    <div className="h-full w-full flex flex-col bg-card">
      {/*
        ChatCapsule overlay is now managed via IPC to render above BrowserView.
        The overlay SPA is a separate WebContentsView that appears above all views.
        Show/hide is controlled by api.showChatCapsuleOverlay() / api.hideChatCapsuleOverlay()
      */}

      {/* Header - replaced with drag region spacer when maximized (for Windows/Linux) */}
      {isCanvasMaximized ? (
        platform.isMac ? null : (
          <div
            className="h-11 flex-shrink-0 bg-background"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        )
      ) : (
      <Header
        className="bg-card backdrop-blur-sm border-b border-border/40"
        left={
          isMobile ? (
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
              aria-label={t('Open menu')}
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : undefined
        }
        right={
          isMobile ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleOpenFolder}
                className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
                aria-label={t('Open folder')}
              >
                <FolderOpen className="w-4 h-4 text-amber-500" />
              </button>
              <button
                onClick={() => setView('settings')}
                className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
                aria-label={t('Settings')}
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleNewConversation}
                className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                aria-label={t('New conversation')}
              >
                <SquarePen className="w-4 h-4" />
              </button>
            </div>
          ) : undefined
        }
      />
      )}

      {/* Git Bash Warning Banner - Windows only, when in mock mode */}
      {mockBashMode && !isCanvasMaximized && (
        <GitBashWarningBanner
          installProgress={gitBashInstallProgress}
          onInstall={startGitBashInstall}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list sidebar - hidden when maximized or on mobile */}
        {!isCanvasMaximized && !isMobile && (
          <ConversationList
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelect={(id) => selectConversation(id)}
            onNew={handleNewConversation}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            onClearAll={handleClearAllClick}
            isCollapsed={isConversationListCollapsed}
            onToggleCollapse={() => setIsConversationListCollapsed(!isConversationListCollapsed)}
          />
        )}

        {/* Desktop Layout */}
        {!isMobile && (
          <>
            {/* Chat view - hidden when maximized, adjusts width based on canvas state */}
            {!isCanvasMaximized && (
              <div
                ref={chatContainerRef}
                className={`
                  flex flex-col min-w-0 relative
                  ${hasBrowserTab ? '' : 'transition-[border-color] duration-300 ease-out'}
                  ${isCanvasOpen ? 'border-r border-border/60' : 'flex-1 border-r border-transparent'}
                  ${isCanvasTransitioning ? 'pointer-events-none' : ''}
                `}
                style={{
                  width: isCanvasOpen ? dragChatWidth : undefined,
                  flex: isCanvasOpen ? 'none' : '1',
                  minWidth: isCanvasOpen ? chatWidthMin : undefined,
                  maxWidth: isCanvasOpen ? chatWidthMax : undefined,
                  // Disable transition when browser tab exists (sync with native BrowserView)
                  transition: (isDraggingChat || hasBrowserTab)
                    ? 'none'
                    : 'width 0.3s, flex 0.3s, border-color 0.3s',
                  willChange: isCanvasTransitioning ? 'width, flex' : 'auto',
                }}
              >
                <ChatView isCompact={isCanvasOpen} />

                {/* Drag handle for chat width - only when canvas is open */}
                {isCanvasOpen && (
                  <div
                    className={`
                      absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20
                      hover:bg-primary/50 transition-colors
                      ${isDraggingChat ? 'bg-primary/50' : ''}
                    `}
                    onMouseDown={handleChatDragStart}
                    title={t('Drag to resize')}
                  />
                )}
              </div>
            )}

            {/* Content Canvas - main viewing area when open, full width when maximized */}
            <div
              className={`
                min-w-0 overflow-hidden
                ${hasBrowserTab ? '' : 'transition-all duration-300 ease-out'}
                ${isCanvasOpen || isCanvasMaximized
                  ? 'flex-1 opacity-100'
                  : 'w-0 flex-none opacity-0'}
                ${isCanvasTransitioning ? 'pointer-events-none' : ''}
              `}
              style={{
                willChange: isCanvasTransitioning ? 'width, opacity, transform' : 'auto',
                transform: isCanvasOpen || isCanvasMaximized ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.98)',
                // Disable transition when browser tab exists (sync with native BrowserView)
                transition: hasBrowserTab ? 'none' : undefined,
              }}
            >
              {(isCanvasOpen || isCanvasMaximized || isCanvasTransitioning) && <ContentCanvas />}
            </div>
          </>
        )}

        {/* Mobile Layout */}
        {isMobile && (
          <div className="flex-1 flex flex-col min-w-0">
            <ChatView isCompact={false} />
          </div>
        )}

        {/* Artifact rail - auto-collapses when maximized via useEffect above */}
        {/* Smart collapse: collapses when canvas is open, respects user preference */}
        {!isMobile && (
          <ArtifactRail
            spaceId={currentSpace.id}
            isTemp={currentSpace.isTemp}
            onOpenFolder={handleOpenFolder}
            externalExpanded={effectiveRailExpanded}
            onExpandedChange={setRailExpanded}
          />
        )}
      </div>

      {/* Mobile Canvas Overlay */}
      {isMobile && isCanvasOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background animate-slide-in-right-full">
          {/* Mobile Canvas Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/80 backdrop-blur-sm">
            <button
              onClick={() => setCanvasOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t('Return to conversation')}</span>
            </button>
            <button
              onClick={() => setCanvasOpen(false)}
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Canvas Content */}
          <div className="flex-1 overflow-hidden">
            <ContentCanvas />
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background animate-slide-in-left-full safe-area-top">
          {/* Mobile Sidebar Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <HaloLogo size={22} hoverOnly={true} />
              <span className="text-sm font-medium text-foreground/80">技能范</span>
            </div>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Sidebar Content - reuse ConversationList in overlay mode */}
          <ConversationList
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelect={(id) => {
              selectConversation(id)
              setMobileSidebarOpen(false)
            }}
            onNew={() => {
              handleNewConversation()
              setMobileSidebarOpen(false)
            }}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            onClearAll={handleClearAllClick}
            isCollapsed={false}
            isMobileOverlay={true}
          />
        </div>
      )}

      {/* Mobile Artifact Rail (shown as bottom sheet / overlay) */}
      {isMobile && (
        <ArtifactRail
          spaceId={currentSpace.id}
          isTemp={currentSpace.isTemp}
          onOpenFolder={handleOpenFolder}
        />
      )}

      {/* Clear All Conversations Confirmation Dialog */}
      {showClearAllDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
          {/* Backdrop - click to close */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClearAllCancel}
          />
          {/* Dialog content */}
          <div className="relative bg-card border border-border/80 rounded-2xl p-7 w-full max-w-sm animate-fade-in shadow-2xl">
            <h2 className="text-lg font-semibold mb-4 text-foreground/95 tracking-tight">
              {t('Clear Task History')}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t('Are you sure you want to clear all task history? This will not delete any files created by your tasks.')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleClearAllCancel}
                className="px-5 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-all"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleClearAllConfirm}
                className="px-5 py-2.5 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                {t('Clear All')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
