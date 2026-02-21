/**
 * Message List - Displays chat messages with streaming and thinking support
 * Layout: User message -> [Linear Stream (Claude Code style)] -> [Assistant Reply]
 *
 * Key Feature: LinearStream - Claude Code style timeline display
 * - All content shown chronologically from top to bottom
 * - Thinking blocks: single line summary, click to expand
 * - Tool calls: inline single-line items
 * - Text: prominent display (bright color)
 * - Skill: gradient label with child tools nested
 *
 * @see docs/streaming-scroll-animation.md for detailed implementation notes
 */

import { useMemo } from 'react'
import { MessageItem } from './MessageItem'
import { CollapsedThoughtProcess } from './CollapsedThoughtProcess'
import { LinearStream } from './LinearStream'
import { CompactNotice } from './CompactNotice'
import { BrowserTaskCard, isBrowserTool } from '../tool/BrowserTaskCard'
import type { Message, Thought, CompactInfo, TextSegment } from '../../types'
import { useTranslation } from '../../i18n'

interface MessageListProps {
  messages: Message[]
  streamingContent: string
  isGenerating: boolean
  isStreaming?: boolean  // True during token-level text streaming
  thoughts?: Thought[]
  isThinking?: boolean
  compactInfo?: CompactInfo | null
  error?: string | null  // Error message to display when generation fails
  isCompact?: boolean  // Compact mode when Canvas is open
  // Collapse states for thought process
  todoCollapsed?: boolean
  onToggleTodo?: () => void
  // Task status history
  taskStatusHistory?: Map<string, string[]>
  // Linear stream: text segments for timeline
  textSegments?: TextSegment[]
  lastSegmentIndex?: number
}

export function MessageList({
  messages,
  streamingContent,
  isGenerating,
  isStreaming = false,
  thoughts = [],
  isThinking = false,
  compactInfo = null,
  error = null,
  isCompact = false,
  todoCollapsed = false,
  onToggleTodo,
  taskStatusHistory,
  textSegments = [],
  lastSegmentIndex = 0,
}: MessageListProps) {
  const { t } = useTranslation()

  // Filter out assistant placeholders with no visible text.
  // Rapid interrupt/inject can leave empty assistant records in history.
  const displayMessages = messages.filter((msg) => {
    if (msg.role !== 'assistant') return true
    return Boolean(msg.content?.trim())
  })


  // Extract real-time browser tool calls from streaming thoughts
  // This enables BrowserTaskCard to show operations as they happen
  const streamingBrowserToolCalls = useMemo(() => {
    return thoughts
      .filter(t => t.type === 'tool_use' && t.toolName && isBrowserTool(t.toolName))
      .map(t => ({
        id: t.id,
        name: t.toolName!,
        // Determine status: if there's a subsequent tool_result for this tool, it's complete
        // Otherwise it's still running
        status: thoughts.some(
          r => r.type === 'tool_result' && r.id.startsWith(t.id.replace('_use', '_result'))
        ) ? 'success' as const : 'running' as const,
        input: t.toolInput || {},
      }))
  }, [thoughts])

  return (
    <div className={`
      space-y-4 transition-[max-width] duration-300 ease-out
      ${isCompact ? 'max-w-full' : 'max-w-3xl mx-auto'}
    `}>
      {/* Render completed messages - thoughts shown above assistant messages */}
      {displayMessages.map((message) => {
        // Show collapsed thoughts ABOVE assistant messages, in same container for consistent width
        if (message.role === 'assistant' && message.thoughts && message.thoughts.length > 0) {
          return (
            <div key={message.id} className="flex justify-start">
              {/* Fixed width container - prevents width jumping when content changes */}
              <div className="w-[85%]">
                {/* Collapsed thought process above the message */}
                <CollapsedThoughtProcess thoughts={message.thoughts} />
                {/* Then the message itself (without embedded thoughts) */}
                <MessageItem message={message} hideThoughts isInContainer />
              </div>
            </div>
          )
        }
        return <MessageItem key={message.id} message={message} />
      })}

      {/* Current generation block: Linear Stream (Claude Code style) */}
      {/* Use fixed width container to prevent jumping when content changes */}
      {isGenerating && (
        <div className="flex justify-start animate-fade-in">
          {/* Fixed width - same as completed messages */}
          <div className="w-[85%] relative">
            {/* Real-time browser task card - shows AI browser operations as they happen */}
            {streamingBrowserToolCalls.length > 0 && (
              <div className="mb-4">
                <BrowserTaskCard
                  browserToolCalls={streamingBrowserToolCalls}
                  isActive={isThinking}
                />
              </div>
            )}

            {/* Linear Stream - Claude Code style timeline display */}
            <LinearStream
              thoughts={thoughts}
              streamingContent={streamingContent}
              textSegments={textSegments}
              lastSegmentIndex={lastSegmentIndex}
              isStreaming={isStreaming}
              isThinking={isThinking}
              todoCollapsed={todoCollapsed}
              onToggleTodo={onToggleTodo}
              taskStatusHistory={taskStatusHistory}
            />
          </div>
        </div>
      )}

      {/* Error message - shown when generation fails (not during generation) */}
      {!isGenerating && error && (
        <div className="flex justify-start animate-fade-in">
          <div className="w-[85%]">
            <div className="rounded-2xl px-4 py-3 bg-destructive/10 border border-destructive/30">
              <div className="flex items-center gap-2 text-destructive">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-sm font-medium">{t('Something went wrong')}</span>
              </div>
              <p className="mt-2 text-sm text-destructive/80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Compact notice - shown when context was compressed (runtime notification) */}
      {compactInfo && (
        <CompactNotice trigger={compactInfo.trigger} preTokens={compactInfo.preTokens} />
      )}
    </div>
  )
}
