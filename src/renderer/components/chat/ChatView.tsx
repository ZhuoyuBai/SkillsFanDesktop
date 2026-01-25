/**
 * Chat View - Main chat interface
 * Uses session-based state for multi-conversation support
 * Supports onboarding mode with mock AI response
 * Features smart auto-scroll (stops when user reads history)
 *
 * Layout modes:
 * - Full width (isCompact=false): Centered content with max-width
 * - Compact mode (isCompact=true): Sidebar-style when Canvas is open
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSpaceStore } from '../../stores/space.store'
import { useChatStore } from '../../stores/chat.store'
import { useOnboardingStore } from '../../stores/onboarding.store'
import { useAIBrowserStore } from '../../stores/ai-browser.store'
import { useSmartScroll } from '../../hooks/useSmartScroll'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { HaloLogo } from '../brand/HaloLogo'
import { PenLine, BarChart3, Palette, FolderSearch, Zap, Wrench, LucideIcon } from 'lucide-react'
import {
  ONBOARDING_ARTIFACT_NAME,
  getOnboardingAiResponse,
  getOnboardingHtmlArtifact,
  getOnboardingPrompt,
} from '../onboarding/onboardingData'
import { api } from '../../api'
import type { ImageAttachment } from '../../types'
import { useTranslation } from '../../i18n'

interface ChatViewProps {
  isCompact?: boolean
}

export function ChatView({ isCompact = false }: ChatViewProps) {
  const { t } = useTranslation()
  const { currentSpace } = useSpaceStore()
  const {
    getCurrentConversation,
    getCurrentSession,
    sendMessage,
    stopGeneration,
    addMockMessage
  } = useChatStore()

  // Onboarding state
  const {
    isActive: isOnboarding,
    currentStep,
    nextStep,
    setMockAnimating,
    setMockThinking,
    isMockAnimating,
    isMockThinking
  } = useOnboardingStore()

  // Mock onboarding state
  const [mockUserMessage, setMockUserMessage] = useState<string | null>(null)
  const [mockAiResponse, setMockAiResponse] = useState<string | null>(null)
  const [mockStreamingContent, setMockStreamingContent] = useState<string>('')

  // Clear mock state when onboarding completes
  useEffect(() => {
    if (!isOnboarding) {
      setMockUserMessage(null)
      setMockAiResponse(null)
      setMockStreamingContent('')
    }
  }, [isOnboarding])

  // Handle search result navigation - scroll to message and highlight search term
  useEffect(() => {
    const handleNavigateToMessage = (event: Event) => {
      const customEvent = event as CustomEvent<{ messageId: string; query: string }>
      const { messageId, query } = customEvent.detail

      console.log(`[ChatView] Attempting to navigate to message: ${messageId}`)

      // Remove previous highlights from all messages
      document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight')
      })
      // Replace each mark element with its text content (preserving surrounding content)
      document.querySelectorAll('.search-term-highlight').forEach(el => {
        const textNode = document.createTextNode(el.textContent || '')
        el.replaceWith(textNode)
      })

      // Find the message element
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
      if (!messageElement) {
        console.warn(`[ChatView] Message element not found for ID: ${messageId}`)
        return
      }

      console.log(`[ChatView] Found message element, scrolling and highlighting`)

      // Scroll into view smoothly
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Add highlight animation
      messageElement.classList.add('search-highlight')
      setTimeout(() => {
        messageElement.classList.remove('search-highlight')
      }, 2000)

      // Highlight search terms in the message (simple text highlight)
      const contentElement = messageElement.querySelector('[data-message-content]')
      if (contentElement && query) {
        try {
          // Create a regexp with word boundaries
          const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
          const originalHTML = contentElement.innerHTML

          // Only highlight if we have content and haven't already highlighted
          if (!originalHTML.includes('search-term-highlight')) {
            contentElement.innerHTML = originalHTML.replace(
              regex,
              '<mark class="search-term-highlight bg-yellow-400/30 font-semibold rounded px-0.5">$1</mark>'
            )
            console.log(`[ChatView] Highlighted search term: "${query}"`)
          }
        } catch (error) {
          console.error(`[ChatView] Error highlighting search term:`, error)
        }
      }
    }

    // Clear all search highlights when requested
    const handleClearHighlights = () => {
      console.log(`[ChatView] Clearing all search highlights`)
      document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight')
      })
      // Replace each mark element with its text content (preserving surrounding content)
      document.querySelectorAll('.search-term-highlight').forEach(el => {
        const textNode = document.createTextNode(el.textContent || '')
        el.replaceWith(textNode)
      })
    }

    window.addEventListener('search:navigate-to-message', handleNavigateToMessage)
    window.addEventListener('search:clear-highlights', handleClearHighlights)
    return () => {
      window.removeEventListener('search:navigate-to-message', handleNavigateToMessage)
      window.removeEventListener('search:clear-highlights', handleClearHighlights)
    }
  }, [])

  // Get current conversation and its session state
  const currentConversation = getCurrentConversation()
  const { isLoadingConversation } = useChatStore()
  const session = getCurrentSession()
  const { isGenerating, streamingContent, isStreaming, thoughts, isThinking, compactInfo, error, textBlockVersion } = session

  // Smart auto-scroll: only scrolls when user is at bottom
  const {
    containerRef,
    bottomRef,
    showScrollButton,
    scrollToBottom,
    handleScroll
  } = useSmartScroll({
    threshold: 100,
    deps: [currentConversation?.messages, streamingContent, thoughts, mockStreamingContent]
  })

  const onboardingPrompt = getOnboardingPrompt(t)
  const onboardingResponse = getOnboardingAiResponse(t)
  const onboardingHtml = getOnboardingHtmlArtifact(t)

  // Handle mock onboarding send
  const handleOnboardingSend = useCallback(async () => {
    if (!currentSpace) return

    // Step 1: Show user message immediately
    setMockUserMessage(onboardingPrompt)

    // Step 2: Start "thinking" phase (2.5 seconds) - no spotlight during this time
    setMockThinking(true)
    setMockAnimating(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setMockThinking(false)

    // Step 3: Stream mock AI response
    const response = onboardingResponse
    for (let i = 0; i <= response.length; i++) {
      setMockStreamingContent(response.slice(0, i))
      await new Promise(resolve => setTimeout(resolve, 15))
    }

    // Step 4: Complete response
    setMockAiResponse(response)
    setMockStreamingContent('')

    // Step 5: Write the actual HTML file to disk BEFORE stopping animation
    // This ensures the file exists when ArtifactRail tries to load it
    try {
      await api.writeOnboardingArtifact(
        currentSpace.id,
        ONBOARDING_ARTIFACT_NAME,
        onboardingHtml
      )

      // Also save the conversation to disk
      await api.saveOnboardingConversation(currentSpace.id, onboardingPrompt, onboardingResponse)
      
      // Small delay to ensure file system has synced
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (err) {
      console.error('Failed to write onboarding artifact:', err)
    }

    // Step 6: Animation done
    // Note: Don't call nextStep() here - it's already called by Spotlight's handleHoleClick
    // We just need to stop the animation so the Spotlight can show the artifact
    setMockAnimating(false)
  }, [currentSpace, onboardingHtml, onboardingPrompt, onboardingResponse, setMockAnimating, setMockThinking])

  // AI Browser state
  const { enabled: aiBrowserEnabled } = useAIBrowserStore()

  // Handle send (with optional images for multi-modal messages, optional thinking mode)
  const handleSend = async (content: string, images?: ImageAttachment[], thinkingEnabled?: boolean) => {
    // In onboarding mode, intercept and play mock response
    if (isOnboarding && currentStep === 'send-message') {
      handleOnboardingSend()
      return
    }

    // Can send if has text OR has images
    if ((!content.trim() && (!images || images.length === 0)) || isGenerating) return

    // Pass both AI Browser and thinking state to sendMessage
    await sendMessage(content, images, aiBrowserEnabled, thinkingEnabled)
  }

  // Handle stop - stops the current conversation's generation
  const handleStop = async () => {
    if (currentConversation) {
      await stopGeneration(currentConversation.id)
    }
  }

  // Combine real messages with mock onboarding messages
  const realMessages = currentConversation?.messages || []
  const displayMessages = mockUserMessage
    ? [
        ...realMessages,
        { id: 'onboarding-user', role: 'user' as const, content: mockUserMessage, timestamp: new Date().toISOString() },
        ...(mockAiResponse
          ? [{ id: 'onboarding-ai', role: 'assistant' as const, content: mockAiResponse, timestamp: new Date().toISOString() }]
          : [])
      ]
    : realMessages

  const displayStreamingContent = mockStreamingContent || streamingContent
  const displayIsGenerating = isMockAnimating || isGenerating
  const displayIsThinking = isMockThinking || isThinking
  const displayIsStreaming = isStreaming  // Only real streaming (not mock)
  const hasMessages = displayMessages.length > 0 || displayStreamingContent || displayIsThinking

  // Track previous compact state for smooth transitions
  const prevCompactRef = useRef(isCompact)
  const isTransitioningLayout = prevCompactRef.current !== isCompact

  useEffect(() => {
    prevCompactRef.current = isCompact
  }, [isCompact])

  // Input area for empty state (centered, no border)
  const emptyStateInputArea = (
    <InputArea
      onSend={handleSend}
      onStop={handleStop}
      isGenerating={isGenerating}
      placeholder={t('Say what you want to do...')}
      isCompact={isCompact}
      noBorder
    />
  )

  // Input area for message view (bottom, with border)
  const bottomInputArea = (
    <InputArea
      onSend={handleSend}
      onStop={handleStop}
      isGenerating={isGenerating}
      placeholder={isCompact ? t('Continue conversation...') : t('Continue conversation...')}
      isCompact={isCompact}
    />
  )

  return (
    <div
      className={`
        flex-1 flex flex-col h-full
        transition-[padding] duration-300 ease-out
        ${isCompact ? 'bg-background/50' : 'bg-background'}
      `}
    >
      {/* Messages area wrapper - relative for button positioning */}
      <div className="flex-1 relative overflow-hidden">
        {/* Scrollable messages container */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className={`
            h-full overflow-auto py-6
            transition-[padding] duration-300 ease-out
            ${isCompact ? 'px-3' : 'px-4'}
          `}
        >
          {isLoadingConversation ? (
            <LoadingState />
          ) : !hasMessages ? (
            <EmptyState
              isTemp={currentSpace?.isTemp || false}
              isCompact={isCompact}
              inputArea={emptyStateInputArea}
            />
          ) : (
            <>
              <MessageList
                messages={displayMessages}
                streamingContent={displayStreamingContent}
                isGenerating={displayIsGenerating}
                isStreaming={displayIsStreaming}
                thoughts={thoughts}
                isThinking={displayIsThinking}
                compactInfo={compactInfo}
                error={error}
                isCompact={isCompact}
                textBlockVersion={textBlockVersion}
              />
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Scroll to bottom button - positioned outside scroll container */}
        <ScrollToBottomButton
          visible={showScrollButton && hasMessages}
          onClick={() => scrollToBottom('smooth')}
        />
      </div>

      {/* Input area - only show at bottom when there are messages */}
      {hasMessages && bottomInputArea}
    </div>
  )
}

// Loading state component
function LoadingState() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="mt-3 text-sm text-muted-foreground">{t('Loading conversation...')}</p>
    </div>
  )
}

// Quick category definitions for MiniMax-style display
const QUICK_CATEGORIES: { key: string; icon: LucideIcon }[] = [
  { key: 'Writing & Documents', icon: PenLine },
  { key: 'Data Analysis', icon: BarChart3 },
  { key: 'Content Creation', icon: Palette },
  { key: 'Research & Organization', icon: FolderSearch },
  { key: 'Automation', icon: Zap },
  { key: 'Efficiency Tools', icon: Wrench },
]

// Empty state component - adapts to compact mode
function EmptyState({
  isTemp,
  isCompact = false,
  inputArea
}: {
  isTemp: boolean;
  isCompact?: boolean;
  inputArea?: React.ReactNode;
}) {
  const { t } = useTranslation()
  // Compact mode shows minimal UI
  if (isCompact) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <p className="text-sm text-muted-foreground">
          {t('Continue the conversation here')}
        </p>
        {inputArea && (
          <div className="mt-4 w-full max-w-2xl">
            {inputArea}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-start pt-[15vh] text-center px-8 pb-6">
      {/* Title */}
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        {t('Halo, not just chat, can help you get things done')}
      </h1>

      {/* Input area - shown in center when empty */}
      {inputArea && (
        <div className="mt-6 w-full max-w-2xl">
          {inputArea}
        </div>
      )}

      {/* Capabilities - MiniMax style pill buttons */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {QUICK_CATEGORIES.map((cat) => {
          const Icon = cat.icon
          return (
            <div
              key={cat.key}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                bg-secondary/60 text-sm text-muted-foreground"
            >
              <Icon size={14} />
              <span>{t(cat.key)}</span>
            </div>
          )
        })}
      </div>

      {/* Permission hint - pushed to bottom */}
      <p className="mt-auto text-xs text-muted-foreground/50">
        {t('Halo has full access to the current space')}
      </p>

    </div>
  )
}
