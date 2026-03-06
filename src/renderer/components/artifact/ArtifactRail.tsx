/**
 * Artifact Rail - Side panel showing created files
 *
 * Desktop (>=640px): Inline panel with drag-to-resize
 * Mobile (<640px): Floating button + Overlay panel
 *
 * Supports view mode toggle: Card (default) vs Tree (developer mode)
 * Supports external control for Canvas integration (smart collapse)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ArtifactCard } from './ArtifactCard'
import { ArtifactTree } from './ArtifactTree'
import { api } from '../../api'
import type { Artifact, ArtifactViewMode } from '../../types'
import { useIsGenerating } from '../../stores/chat.store'
import { useOnboardingStore } from '../../stores/onboarding.store'
import { useCanvasStore } from '../../stores/canvas.store'
import { ChevronRight, FolderOpen, Monitor, LayoutGrid, FolderTree, X } from 'lucide-react'
import logoImage from '../../assets/logo.png'
import { ONBOARDING_ARTIFACT_NAME } from '../onboarding/onboardingData'
import { useTranslation } from '../../i18n'

// Check if running in web mode
const isWebMode = api.isRemoteMode()

// Storage keys
const VIEW_MODE_STORAGE_KEY = 'halo:artifact-view-mode'

// Width constraints (in pixels) - Desktop only
const MIN_WIDTH = 180 // Allow smaller width
const MAX_WIDTH = 480
const MAX_WIDTH_RATIO = 0.4 // Never exceed 40% of window width
const COLLAPSED_WIDTH = 48
const WIDTH_RATIO = 0.18 // 18% of window width

// Get effective max width (capped by both absolute max and window ratio)
function getEffectiveMaxWidth(): number {
  if (typeof window === 'undefined') return MAX_WIDTH
  return Math.min(MAX_WIDTH, Math.round(window.innerWidth * MAX_WIDTH_RATIO))
}

// Calculate width based on window width (clamped to constraints)
function calculateWidth(windowWidth: number): number {
  const effectiveMax = Math.min(MAX_WIDTH, Math.round(windowWidth * MAX_WIDTH_RATIO))
  const targetWidth = Math.round(windowWidth * WIDTH_RATIO)
  return Math.max(MIN_WIDTH, Math.min(effectiveMax, targetWidth))
}

function getDefaultWidth(): number {
  if (typeof window === 'undefined') return 280
  return calculateWidth(window.innerWidth)
}

// Mobile breakpoint (matches Tailwind sm)
const MOBILE_BREAKPOINT = 640

interface ArtifactRailProps {
  spaceId: string
  isTemp: boolean
  onOpenFolder: () => void
  // External control props for Canvas integration
  externalExpanded?: boolean        // Controlled expanded state from parent
  onExpandedChange?: (expanded: boolean) => void  // Callback when user toggles
}

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

// Load initial view mode from storage
function getInitialViewMode(): ArtifactViewMode {
  if (typeof window === 'undefined') return 'card'
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  return (stored === 'tree' || stored === 'card') ? stored : 'card'
}

export function ArtifactRail({
  spaceId,
  isTemp,
  onOpenFolder,
  externalExpanded,
  onExpandedChange
}: ArtifactRailProps) {
  const { t } = useTranslation()
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  // Use external control if provided, otherwise internal state
  const isControlled = externalExpanded !== undefined
  const [internalExpanded, setInternalExpanded] = useState(true)
  const isExpanded = isControlled ? externalExpanded : internalExpanded

  const [isLoading, setIsLoading] = useState(false)
  const [width, setWidth] = useState(getDefaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const [hasUserResized, setHasUserResized] = useState(false) // Track if user manually resized
  const [viewMode, setViewMode] = useState<ArtifactViewMode>(getInitialViewMode)
  const [mobileOverlayOpen, setMobileOverlayOpen] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)
  const isGenerating = useIsGenerating()
  const { isActive: isOnboarding, currentStep, completeOnboarding } = useOnboardingStore()
  const isMobile = useIsMobile()

  // Update width when window resizes (only if user hasn't manually resized)
  useEffect(() => {
    if (hasUserResized || isMobile) return

    const handleResize = () => {
      setWidth(calculateWidth(window.innerWidth))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [hasUserResized, isMobile])

  // Check if any browser tab is open (native BrowserView)
  // When browser tabs exist, disable CSS transition to sync with native view resize
  // Use precise selector to avoid subscribing to full tabs array
  const hasBrowserTab = useCanvasStore(state => state.tabs.some(tab => tab.type === 'browser'))

  // Handle expand/collapse toggle
  const handleToggleExpanded = useCallback(() => {
    console.log('[ArtifactRail] 🔴 Click! isExpanded:', isExpanded, 'time:', Date.now())
    const newExpanded = !isExpanded

    // UI-first optimization: When browser tab exists, directly update DOM
    // before React state update to ensure BrowserView resizes immediately
    if (hasBrowserTab && railRef.current) {
      const targetWidth = newExpanded ? width : COLLAPSED_WIDTH
      railRef.current.style.width = `${targetWidth}px`
      console.log('[ArtifactRail] 🚀 Direct DOM update:', targetWidth, 'time:', Date.now())
    }

    // Then update React state (will re-render but width is already correct)
    if (isControlled) {
      onExpandedChange?.(newExpanded)
    } else {
      setInternalExpanded(newExpanded)
    }
  }, [isExpanded, isControlled, onExpandedChange, hasBrowserTab, width])

  // Debug: log when isExpanded changes
  useEffect(() => {
    console.log('[ArtifactRail] 🟢 isExpanded changed to:', isExpanded, 'time:', Date.now())
  }, [isExpanded])

  // Check if we're in onboarding view-artifact step
  const isOnboardingViewStep = isOnboarding && currentStep === 'view-artifact'

  // Handle artifact click during onboarding
  // Delay completion so user can see the file open first
  const handleOnboardingArtifactClick = useCallback(() => {
    if (isOnboardingViewStep) {
      // Let the ArtifactCard's click handler open the file first
      // Then complete onboarding after a short delay
      setTimeout(() => {
        completeOnboarding()
      }, 500)
    }
  }, [isOnboardingViewStep, completeOnboarding])

  // Toggle view mode and persist
  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'card' ? 'tree' : 'card'
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, next)
      return next
    })
  }, [])

  // Handle drag resize (desktop only)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile) return
    e.preventDefault()
    setIsDragging(true)
  }, [isMobile])

  useEffect(() => {
    if (!isDragging || isMobile) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!railRef.current) return
      const newWidth = window.innerWidth - e.clientX
      const clampedWidth = Math.min(getEffectiveMaxWidth(), Math.max(MIN_WIDTH, newWidth))
      setWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setHasUserResized(true) // User manually resized, stop auto-resize
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isMobile])

  // Close mobile overlay when switching to desktop
  useEffect(() => {
    if (!isMobile && mobileOverlayOpen) {
      setMobileOverlayOpen(false)
    }
  }, [isMobile, mobileOverlayOpen])

  // Load artifacts from the main process
  const loadArtifacts = useCallback(async () => {
    if (!spaceId) return

    try {
      setIsLoading(true)
      const response = await api.listArtifacts(spaceId)
      if (response.success && response.data) {
        setArtifacts(response.data as Artifact[])
      }
    } catch (error) {
      console.error('[ArtifactRail] Failed to load artifacts:', error)
    } finally {
      setIsLoading(false)
    }
  }, [spaceId])

  // Load artifacts on mount and when space changes
  useEffect(() => {
    loadArtifacts()
  }, [loadArtifacts])

  // Refresh artifacts when generation completes
  useEffect(() => {
    if (!isGenerating) {
      const timer = setTimeout(loadArtifacts, 500)
      return () => clearTimeout(timer)
    }
  }, [isGenerating, loadArtifacts])

  // Refresh artifacts when entering view-artifact onboarding step
  useEffect(() => {
    if (isOnboardingViewStep) {
      // Delay slightly to ensure file is written
      const timer = setTimeout(loadArtifacts, 300)
      return () => clearTimeout(timer)
    }
  }, [isOnboardingViewStep, loadArtifacts])


  // Shared content renderer
  const renderContent = () => (
    <div className="flex-1 overflow-hidden">
      {viewMode === 'tree' ? (
        <ArtifactTree spaceId={spaceId} />
      ) : (
        <div className="h-full overflow-auto p-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2">
              <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-3" />
              <p className="text-xs text-muted-foreground">{t('Loading...')}</p>
            </div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2">
              <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-3 halo-breathe">
                <img src={logoImage} alt="SkillsFan" className="w-8 h-8 rounded-full object-cover" />
              </div>
              <p className="text-xs text-muted-foreground">
                {isTemp ? t('Ideas will crystallize here') : t('Files will appear here')}
              </p>
              {isGenerating && (
                <p className="text-xs text-primary/60 mt-2 animate-pulse">
                  {t('AI is working...')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {artifacts.map((artifact, index) => {
                // Check if this is the onboarding artifact
                const isOnboardingArtifact = artifact.name === ONBOARDING_ARTIFACT_NAME

                return (
                  <div
                    key={artifact.id}
                    className="animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                    data-onboarding={isOnboardingArtifact && isOnboardingViewStep ? 'artifact-card' : undefined}
                    onClick={isOnboardingArtifact && isOnboardingViewStep ? handleOnboardingArtifactClick : undefined}
                  >
                    <ArtifactCard artifact={artifact} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Shared footer renderer with folder and browser buttons
  // flex-shrink-0 ensures footer doesn't compress, allowing content to take remaining space
  const renderFooter = () => (
    <div className="flex-shrink-0 p-2 border-t border-border">
      {viewMode === 'card' && artifacts.length > 0 && (
        <p className="text-xs text-muted-foreground text-center mb-2">
          {artifacts.length} {t('artifacts')}
        </p>
      )}
      {isWebMode ? (
        <div className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-muted-foreground/50 rounded-lg cursor-not-allowed">
          <Monitor className="w-4 h-4" />
          <span>{t('Please open folder in client')}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {/* Open folder button */}
          <button
            onClick={onOpenFolder}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg transition-colors"
            title={t('Open folder (⌘⇧F)')}
            aria-label={t('Open folder')}
          >
            <FolderOpen className="w-4 h-4 text-slate-400" />
            <span>{t('Folder')}</span>
          </button>
        </div>
      )}
    </div>
  )

  // ==================== Mobile Overlay Mode ====================
  if (isMobile) {
    return (
      <>
        {/* Floating trigger button */}
        <button
          onClick={() => setMobileOverlayOpen(true)}
          className="
            fixed right-0 top-1/3 z-40
            w-10 h-14
            bg-card/90 backdrop-blur-sm
            border-l border-y border-border
            rounded-l-xl
            shadow-lg
            flex flex-col items-center justify-center gap-1
            hover:bg-card
            active:scale-95
            transition-all duration-200
          "
          aria-label={t('Open artifacts panel')}
        >
          <FolderOpen className="w-4 h-4 text-slate-400" />
          {artifacts.length > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {artifacts.length}
            </span>
          )}
        </button>

        {/* Overlay backdrop + panel */}
        {mobileOverlayOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in"
              onClick={() => setMobileOverlayOpen(false)}
            />

            {/* Slide-in panel */}
            <div
              className="
                relative w-[min(280px,75vw)] h-full
                bg-card border-l border-border
                flex flex-col
                animate-slide-in-right-full
                shadow-2xl
              "
            >
              {/* Header */}
              <div className="p-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-muted-foreground">{t('Artifacts')}</span>
                  <button
                    onClick={toggleViewMode}
                    className={`
                      p-1 rounded transition-all duration-200
                      hover:bg-secondary/80
                      ${viewMode === 'tree' ? 'bg-secondary text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}
                    `}
                    title={viewMode === 'card' ? t('Switch to tree view') : t('Switch to card view')}
                  >
                    {viewMode === 'card' ? (
                      <FolderTree className="w-3.5 h-3.5" />
                    ) : (
                      <LayoutGrid className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setMobileOverlayOpen(false)}
                  className="p-1 hover:bg-secondary rounded transition-colors"
                  aria-label={t('Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              {renderContent()}

              {/* Footer */}
              {renderFooter()}
            </div>
          </div>
        )}
      </>
    )
  }

  // ==================== Desktop Inline Mode ====================
  const displayWidth = isExpanded ? width : COLLAPSED_WIDTH

  return (
    <div
      ref={railRef}
      className="h-full border-l border-border bg-card flex flex-col relative flex-shrink-0"
      style={{
        width: displayWidth,
        // Disable transition when: dragging OR browser tab exists (to sync with native BrowserView)
        transition: (isDragging || hasBrowserTab) ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: isDragging ? 'width' : 'auto'
      }}
    >
      {/* Drag handle - only show when expanded */}
      {isExpanded && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-20 group/handle
            transition-all duration-200
            ${isDragging ? 'bg-muted-foreground/30' : 'hover:bg-muted-foreground/20'}`}
          onMouseDown={handleMouseDown}
          title={t('Drag to resize')}
        >
          {/* Visual hint line */}
          <div className="absolute inset-y-1/3 left-1/2 -translate-x-1/2 w-0.5 bg-border/60 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity" />
        </div>
      )}

      {/* Header - height matches CanvasTabs (py-1.5 + h-7 content = ~40px) */}
      <div className="flex-shrink-0 px-3 h-10 border-b border-border flex items-center justify-between">
        {isExpanded && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">{t('Artifacts')}</span>
            <button
              onClick={toggleViewMode}
              className={`
                p-1 rounded transition-all duration-200
                hover:bg-secondary/80
                ${viewMode === 'tree' ? 'bg-secondary text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}
              `}
              title={viewMode === 'card' ? t('Switch to tree view (developer)') : t('Switch to card view')}
            >
              {viewMode === 'card' ? (
                <FolderTree className="w-3.5 h-3.5" />
              ) : (
                <LayoutGrid className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
        <button
          onClick={handleToggleExpanded}
          className="p-1 hover:bg-secondary rounded transition-colors"
          aria-label={isExpanded ? t('Collapse sidebar') : t('Expand sidebar')}
          aria-expanded={isExpanded}
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Content */}
      {isExpanded && renderContent()}

      {/* Footer */}
      {isExpanded && renderFooter()}

      {/* Collapsed state - show both folder and browser icons */}
      {!isExpanded && (
        <div className="flex-1 flex flex-col items-center py-4 gap-2">
          {isWebMode ? (
            <div
              className="p-2 rounded-lg cursor-not-allowed opacity-50"
              title={t('Please open folder in client')}
            >
              <Monitor className="w-5 h-5 text-muted-foreground" />
            </div>
          ) : (
            <button
              onClick={onOpenFolder}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
              title={t('Open folder')}
            >
              <FolderOpen className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
