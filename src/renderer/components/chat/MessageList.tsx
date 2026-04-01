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
import type { SubagentRunEntry } from '../../stores/chat.store'
import { useTranslation } from '../../i18n'
import {
  getLatestVisibleActiveToolUseIds,
  getMatchingToolResult
} from '../../../shared/utils/thought-dedupe'
import { stripLeadingSetModelStatus } from '../../../shared/utils/sdk-status'

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
  // Sub-agent task progress
  taskProgressMap?: Map<string, {
    taskId: string
    toolUseId?: string
    description: string
    summary?: string
    lastToolName?: string
    status: 'running' | 'completed' | 'failed' | 'stopped'
    usage?: { total_tokens: number; tool_uses: number; duration_ms: number }
  }>
  subagentRunMap?: Map<string, SubagentRunEntry>
  // Linear stream: text segments for timeline
  textSegments?: TextSegment[]
  lastSegmentIndex?: number
  // SDK status line
  sdkStatus?: string | null
  // Hosted subagent callbacks
  onViewSubagentDetails?: (runId: string) => void
  onKillSubagent?: (runId: string) => void
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
  taskProgressMap,
  subagentRunMap,
  textSegments = [],
  lastSegmentIndex = 0,
  sdkStatus,
  onViewSubagentDetails,
  onKillSubagent,
}: MessageListProps) {
  const { t } = useTranslation()

  // Filter out assistant placeholders with no visible text,
  // and SDK status messages that leaked into conversation history.
  const displayMessages = messages
    .map((msg) => {
      if (msg.role !== 'assistant') return msg
      const content = stripLeadingSetModelStatus(msg.content || '')
      const hasThoughts = Array.isArray(msg.thoughts) && msg.thoughts.length > 0
      if (!content.trim() && !hasThoughts) return null
      return content === msg.content ? msg : { ...msg, content }
    })
    .filter((msg): msg is Message => msg !== null)


  // Extract real-time browser tool calls from streaming thoughts
  // This enables BrowserTaskCard to show operations as they happen
  const streamingBrowserToolCalls = useMemo(() => {
    const visibleActiveToolUseIds = getLatestVisibleActiveToolUseIds(thoughts)
    return thoughts
      .filter(t =>
        t.type === 'tool_use' &&
        t.toolName &&
        isBrowserTool(t.toolName) &&
        (getMatchingToolResult(thoughts, t) || visibleActiveToolUseIds.has(t.id))
      )
      .map(t => ({
        id: t.id,
        name: t.toolName!,
        status: getMatchingToolResult(thoughts, t)
          ? 'success' as const
          : 'running' as const,
        input: t.toolInput || {},
      }))
  }, [thoughts])

  const hasSubagentActivity = (subagentRunMap?.size || 0) > 0

  return (
    <div className={`
      space-y-2 transition-[max-width] duration-300 ease-out
      ${isCompact ? 'max-w-full' : 'max-w-3xl mx-auto'}
    `}>
      {/* Render completed messages - thoughts shown above assistant messages */}
      {displayMessages.map((message) => {
        // Show collapsed thoughts ABOVE assistant messages
        if (message.role === 'assistant' && message.thoughts && message.thoughts.length > 0) {
          return (
            <div key={message.id}>
              <CollapsedThoughtProcess thoughts={message.thoughts} />
              <MessageItem message={message} hideThoughts isInContainer />
            </div>
          )
        }
        return <MessageItem key={message.id} message={message} />
      })}

      {/* Current generation block: Linear Stream (Claude Code style) */}
      {(isGenerating || hasSubagentActivity) && (
        <div className="animate-fade-in">
          {/* Real-time browser task card */}
          {isGenerating && streamingBrowserToolCalls.length > 0 && (
            <div className="mb-4">
              <BrowserTaskCard
                browserToolCalls={streamingBrowserToolCalls}
                isActive={isThinking}
              />
            </div>
          )}

          {/* Linear Stream */}
          <LinearStream
            thoughts={thoughts}
            streamingContent={streamingContent}
            textSegments={textSegments}
            lastSegmentIndex={lastSegmentIndex}
            isStreaming={isStreaming}
            isThinking={isThinking}
            sdkStatus={sdkStatus}
            taskProgressMap={taskProgressMap}
            subagentRunMap={subagentRunMap}
            onViewSubagentDetails={onViewSubagentDetails}
            onKillSubagent={onKillSubagent}
          />
        </div>
      )}

      {/* Error message */}
      {!isGenerating && error && (
        <div className="animate-fade-in py-1 flex items-start gap-2.5">
          <span className="text-destructive/70 text-base flex-shrink-0">✗</span>
          <div>
            <span className="text-sm font-medium text-destructive">{t('Something went wrong')}</span>
            <p className="mt-1 text-sm text-destructive/80">{error}</p>
          </div>
        </div>
      )}

      {/* Compact notice */}
      {compactInfo && (
        <CompactNotice trigger={compactInfo.trigger} preTokens={compactInfo.preTokens} />
      )}
    </div>
  )
}
