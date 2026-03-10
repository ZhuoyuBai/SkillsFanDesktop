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

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { parseTodoInput } from '../tool/TodoCard'
import { FloatingTodoIndicator } from '../tool/FloatingTodoIndicator'
import { useSpaceStore } from '../../stores/space.store'
import { useChatStore } from '../../stores/chat.store'
import { useOnboardingStore } from '../../stores/onboarding.store'
import { useAIBrowserStore } from '../../stores/ai-browser.store'
import { useSmartScroll } from '../../hooks/useSmartScroll'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { ToolCard } from '../tool/ToolCard'
import type { ThinkingEffort } from '../../../shared/utils/openai-models'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { UserQuestionCard } from './UserQuestionCard'
import { HaloLogo } from '../brand/HaloLogo'
import { PenLine, BarChart3, Palette, FolderSearch, ShoppingBag, LucideIcon } from 'lucide-react'
import {
  ONBOARDING_ARTIFACT_NAME,
  getOnboardingAiResponse,
  getOnboardingHtmlArtifact,
  getOnboardingPrompt,
} from '../onboarding/onboardingData'
import { api } from '../../api'
import { HostedSubagentDetailSheet } from '../tool/HostedSubagentDetailSheet'
import type { Attachment } from '../../types'
import { useTranslation } from '../../i18n'

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

interface ChatViewProps {
  isCompact?: boolean
}

export function ChatView({ isCompact = false }: ChatViewProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { currentSpace } = useSpaceStore()
  const {
    getCurrentConversation,
    getCurrentSession,
    sendMessage,
    stopGeneration,
    injectMessage,
    addMockMessage,
    answerUserQuestion,
    killSubagentRun,
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
  const { isLoadingConversation, toggleTodoCollapsed } = useChatStore()
  const session = getCurrentSession()
  const {
    isGenerating,
    streamingContent,
    isStreaming,
    thoughts,
    isThinking,
    compactInfo,
    error,
    todoCollapsed,
    taskStatusHistory,
    taskProgressMap,
    subagentRunMap,
    textSegments,
    lastSegmentIndex,
    pendingToolApproval,
    pendingUserQuestion,
    sdkStatus
  } = session

  // Create toggle callbacks for the current conversation
  const handleToggleTodo = useCallback(() => {
    if (currentConversation) {
      toggleTodoCollapsed(currentConversation.id)
    }
  }, [currentConversation, toggleTodoCollapsed])

  // Compute latest todos for floating indicator
  const latestTodos = useMemo(() => {
    const todoThoughts = thoughts.filter(
      t => t.type === 'tool_use' && t.toolName === 'TodoWrite' && t.toolInput
    )
    if (todoThoughts.length === 0) return null
    const latest = todoThoughts[todoThoughts.length - 1]
    return parseTodoInput(latest.toolInput!)
  }, [thoughts])

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

  // Handle send (with optional attachments for multi-modal messages, optional thinking effort)
  const handleSend = async (content: string, attachments?: Attachment[], thinkingEffort?: ThinkingEffort) => {
    // In onboarding mode, intercept and play mock response
    if (isOnboarding && currentStep === 'send-message') {
      handleOnboardingSend()
      return
    }

    // Can send if has text OR has attachments
    if ((!content.trim() && (!attachments || attachments.length === 0)) || isGenerating) return

    // Pass both AI Browser and thinking state to sendMessage
    await sendMessage(content, attachments, aiBrowserEnabled, thinkingEffort)
  }

  // Handle stop - stops the current conversation's generation
  const handleStop = async () => {
    if (currentConversation) {
      await stopGeneration(currentConversation.id)
    }
  }

  // Handle inject message during generation
  const handleInject = useCallback(async (content: string, attachments?: Attachment[]) => {
    if (!isGenerating) return
    await injectMessage(content, attachments)
  }, [isGenerating, injectMessage])

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

  // Hosted subagent detail sheet state
  const [detailSheetRunId, setDetailSheetRunId] = useState<string | null>(null)
  const detailSheetRun = detailSheetRunId
    ? subagentRunMap?.get(detailSheetRunId) ?? null
    : null

  const handleViewSubagentDetails = useCallback((runId: string) => {
    setDetailSheetRunId(runId)
  }, [])

  const handleKillSubagent = useCallback((runId: string) => {
    killSubagentRun(runId)
  }, [killSubagentRun])

  const handleCloseDetailSheet = useCallback(() => {
    setDetailSheetRunId(null)
  }, [])

  // Quick suggestion content state
  const [suggestedContent, setSuggestedContent] = useState<string>('')

  // Handle suggestion click from EmptyState
  const handleSuggestionClick = useCallback((prompt: string) => {
    setSuggestedContent(prompt)
    // Reset to allow clicking same suggestion again
    setTimeout(() => setSuggestedContent(''), 100)
  }, [])

  // Input area for empty state (centered, no border)
  const emptyStateInputArea = (
    <InputArea
      onSend={handleSend}
      onStop={handleStop}
      onInject={handleInject}
      isGenerating={isGenerating}
      isCompact={isCompact}
      noBorder
      suggestedContent={suggestedContent}
    />
  )

  // Input area for message view (bottom, with border)
  const bottomInputArea = (
    <InputArea
      onSend={handleSend}
      onStop={handleStop}
      onInject={handleInject}
      isGenerating={isGenerating}
      isCompact={isCompact}
      showTypewriterAnimation={false}
    />
  )

  return (
    <div
      className={`
        flex-1 min-h-0 flex flex-col
        transition-[padding] duration-300 ease-out
        ${isCompact ? 'bg-background/50' : 'bg-background'}
      `}
    >
      {/* Messages area wrapper - relative for button positioning */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* Scrollable messages container */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className={`
            h-full min-h-0 overflow-auto py-6
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
              isMobile={isMobile}
              onSuggestionClick={handleSuggestionClick}
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
                taskProgressMap={taskProgressMap}
                subagentRunMap={subagentRunMap}
                textSegments={textSegments}
                lastSegmentIndex={lastSegmentIndex}
                sdkStatus={sdkStatus}
                onViewSubagentDetails={handleViewSubagentDetails}
                onKillSubagent={handleKillSubagent}
              />
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Floating task progress indicator */}
        {latestTodos && latestTodos.length > 0 && (
          <FloatingTodoIndicator
            todos={latestTodos}
            isCollapsed={todoCollapsed}
            onToggleCollapse={handleToggleTodo}
            taskStatusHistory={taskStatusHistory}
            visible={isGenerating}
          />
        )}

        {/* Scroll to bottom button - positioned outside scroll container */}
        <ScrollToBottomButton
          visible={showScrollButton && hasMessages}
          onClick={() => scrollToBottom('smooth')}
        />
      </div>

      {/* Tool approval prompt - show when execution is waiting for confirmation */}
      {pendingToolApproval && currentConversation && (
        <div className={`shrink-0 px-4 pb-2 ${isCompact ? '' : 'max-w-3xl mx-auto w-full'}`}>
          <ToolCard
            toolCall={pendingToolApproval}
            conversationId={currentConversation.id}
          />
        </div>
      )}

      {/* UserQuestionCard - show when AI is asking a question */}
      {pendingUserQuestion && currentConversation && (
        <div className={`shrink-0 px-4 ${isCompact ? '' : 'max-w-3xl mx-auto w-full'}`}>
          <UserQuestionCard
            questions={pendingUserQuestion.questions}
            onAnswer={(answers) => answerUserQuestion(currentConversation.id, answers)}
            onSkip={() => answerUserQuestion(currentConversation.id, {})}
          />
        </div>
      )}

      {/* Input area - only show at bottom when there are messages */}
      {hasMessages && <div className="shrink-0">{bottomInputArea}</div>}

      {/* Hosted subagent detail sheet */}
      <HostedSubagentDetailSheet
        isOpen={detailSheetRunId !== null}
        run={detailSheetRun}
        onClose={handleCloseDetailSheet}
        onKill={handleKillSubagent}
      />
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
const QUICK_CATEGORIES: { key: string; icon: LucideIcon; color: string }[] = [
  { key: 'Writing & Documents', icon: PenLine, color: 'text-blue-500' },
  { key: 'Data Analysis', icon: BarChart3, color: 'text-emerald-500' },
  { key: 'Content Creation', icon: Palette, color: 'text-purple-500' },
  { key: 'Research & Organization', icon: FolderSearch, color: 'text-amber-500' },
  { key: 'E-commerce', icon: ShoppingBag, color: 'text-pink-500' },
]

// i18next-parser hint: These keys are used dynamically via t(cat.key)
// t('Writing & Documents')
// t('Data Analysis')
// t('Content Creation')
// t('Research & Organization')
// t('E-commerce')

// Quick prompt keys for each category - i18n keys resolved at render time
// i18next-parser hint:
// t('Create a "daily-plan.txt" file on desktop with today\'s date and a simple to-do template')
// t('Create a "sales.csv" sample file on desktop with product name, sales, and price columns, generate 5 rows of mock data')
// t('Create an "ideas.md" file on desktop with 3 fun short video ideas in Markdown format')
// t('Create a "project-notes" folder on desktop containing "meeting-notes.md" and "todo.md" files')
// t('Create a "product-copy.md" file on desktop, write a product title, 5 selling points, and detail page copy for wireless Bluetooth earbuds')
const QUICK_PROMPT_KEYS: Record<string, string> = {
  'Writing & Documents': 'Create a "daily-plan.txt" file on desktop with today\'s date and a simple to-do template',
  'Data Analysis': 'Create a "sales.csv" sample file on desktop with product name, sales, and price columns, generate 5 rows of mock data',
  'Content Creation': 'Create an "ideas.md" file on desktop with 3 fun short video ideas in Markdown format',
  'Research & Organization': 'Create a "project-notes" folder on desktop containing "meeting-notes.md" and "todo.md" files',
  'E-commerce': 'Create a "product-copy.md" file on desktop, write a product title, 5 selling points, and detail page copy for wireless Bluetooth earbuds',
}

// Empty state component - adapts to compact mode and mobile
function EmptyState({
  isTemp,
  isCompact = false,
  inputArea,
  isMobile = false,
  onSuggestionClick
}: {
  isTemp: boolean;
  isCompact?: boolean;
  inputArea?: React.ReactNode;
  isMobile?: boolean;
  onSuggestionClick?: (prompt: string) => void;
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

  // Show fewer categories on mobile
  const categoriesToShow = isMobile ? QUICK_CATEGORIES.slice(0, 4) : QUICK_CATEGORIES

  return (
    <div className={`h-full flex flex-col items-center justify-start text-center pb-2
      ${isMobile ? 'pt-[8vh] px-4' : 'pt-[15vh] px-8'}`}>
      {/* Title - smaller on mobile */}
      <h1 className={`mt-8 font-bold tracking-tight text-foreground/85
        ${isMobile ? 'text-xl' : 'text-3xl'}`}>
        {t('Halo, not just chat, can help you get things done')}
      </h1>

      {/* Input area - shown in center when empty */}
      {inputArea && (
        <div className={`mt-8 w-full ${isMobile ? 'max-w-full' : 'max-w-3xl'}`}>
          {inputArea}
        </div>
      )}

      {/* Capabilities - MiniMax style pill buttons */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {categoriesToShow.map((cat) => {
          const Icon = cat.icon
          return (
            <button
              key={cat.key}
              onClick={() => onSuggestionClick?.(t(QUICK_PROMPT_KEYS[cat.key]))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                bg-secondary/60 text-sm font-medium text-muted-foreground
                hover:bg-secondary hover:text-foreground
                transition-colors cursor-pointer"
            >
              <Icon size={14} className={cat.color} />
              <span>{t(cat.key)}</span>
            </button>
          )
        })}
      </div>

      {/* AI Safety Disclaimer - pushed to bottom */}
      <p className="mt-auto text-xs text-center text-muted-foreground/60 leading-relaxed px-4">
        {t('AI can read and write files in the current space. Please review generated content and back up regularly.')}
      </p>

    </div>
  )
}
