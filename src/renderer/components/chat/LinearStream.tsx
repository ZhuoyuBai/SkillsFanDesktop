/**
 * LinearStream - Claude Code style linear timeline display
 * Shows all content chronologically: thinking → tool calls → text
 *
 * Design:
 * - All items displayed in chronological order from top to bottom
 * - Thinking blocks: single line summary, click to expand
 * - Tool calls: inline single-line items
 * - Text: prominent display (bright color)
 * - Skill: gradient label with child tools nested
 */

import { useState, useMemo, useRef, memo } from 'react'
import {
  ChevronRight,
  Loader2,
  XCircle,
} from 'lucide-react'
import { StreamdownRenderer } from './StreamdownRenderer'
import { parseTodoInput } from '../tool/TodoCard'
import { AgentTaskCard } from '../tool/AgentTaskCard'
import { HostedSubagentCard } from '../tool/HostedSubagentCard'
import { ToolItem } from '../tool/ToolItem'
import { groupToolsByTodoSteps } from '../../utils/todo-grouping'
import { HaloLogo } from '../brand/HaloLogo'
import type { Thought, TimelineItem, TextSegment } from '../../types'
import type { SubagentRunEntry } from '../../stores/chat.store'
import { useTranslation } from '../../i18n'
import {
  isCompactLinearStreamText,
  trimBoundaryBlankLines,
} from '../../utils/linear-stream-text'
import { shouldSuppressSetModelStatus } from '../../../shared/utils/sdk-status'
import { useTypewriter } from '../../hooks/useTypewriter'
import {
  getLatestVisibleActiveToolUseIds,
  getMatchingToolResult
} from '../../../shared/utils/thought-dedupe'

interface LinearStreamProps {
  thoughts: Thought[]
  streamingContent: string
  textSegments: TextSegment[]
  lastSegmentIndex: number
  isStreaming: boolean
  isThinking: boolean
  // SDK status line (ephemeral progress message)
  sdkStatus?: string | null
  // Sub-agent task progress map (taskId -> progress)
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
  // Hosted subagent callbacks
  onViewSubagentDetails?: (runId: string) => void
  onKillSubagent?: (runId: string) => void
}

// Utility functions and ToolItem component are in ../tool/ToolItem.tsx

// ============================================
// Sub-components
// ============================================

// Thinking block - CLI style with border-left, no italic
const ThinkingItem = memo(function ThinkingItem({
  content,
  isNew = false,
}: {
  content: string
  isNew?: boolean
}) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const { displayText, isAnimating } = useTypewriter(content, {
    enabled: isNew,
    charsPerFrame: 8,
  })

  return (
    <div className="py-0.5">
      {/* Clickable header - minimal CLI style */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 py-0.5 text-[13px] text-left w-full
          text-muted-foreground cursor-pointer hover:text-foreground/70 transition-colors"
      >
        <ChevronRight
          size={10}
          className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <span className="truncate">{t('Thinking')}</span>
      </button>

      {/* Expanded content - plain text, no markdown rendering */}
      {isExpanded && (
        <div className="ml-4 pl-3 py-1 border-l-2 border-muted-foreground/35 text-[13px] text-muted-foreground leading-relaxed max-h-48 overflow-y-auto bg-muted/20 rounded-r">
          <div className="whitespace-pre-wrap break-words">
            {displayText}
          </div>
          {isAnimating && (
            <span className="inline-block w-0.5 h-3 bg-muted-foreground/50 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}
    </div>
  )
})

// ToolItem is imported from ../tool/ToolItem.tsx

// Skill item - gradient label with child tools
const SkillItem = memo(function SkillItem({
  skillName,
  isComplete,
  isRunning,
  childItems,
}: {
  skillName: string
  isComplete: boolean
  isRunning: boolean
  childItems?: TimelineItem[]
}) {
  const { t } = useTranslation()

  return (
    <div className="py-1">
      {/* Skill label */}
      <div
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-full
          bg-[#E07B2F] shadow-[0_0_15px_rgba(224,123,47,0.35)]
          ${isRunning ? 'skill-breathing' : ''}
        `}
      >
        <span className="text-xs font-medium text-white">
          {isRunning
            ? t('Running {{skill}}...', { skill: skillName })
            : t('Ran {{skill}}', { skill: skillName })}
        </span>
        {isRunning && <Loader2 size={12} className="text-white/80 animate-spin" />}
      </div>

      {/* Child tools - CLI style border-left */}
      {childItems && childItems.length > 0 && (
        <div className="ml-3 mt-1 border-l-2 border-orange-500/30 pl-3">
          {childItems.map((child) => (
            <ToolItem
              key={child.id}
              toolName={child.toolName || ''}
              toolInput={child.toolInput}
              isComplete={child.isComplete || false}
              isError={child.isError || false}
              duration={child.duration}
              toolOutput={child.toolOutput}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// Text block - prominent display
// Uses Streamdown for incremental rendering (O(n) vs O(n²) with react-markdown)
const TextBlock = memo(function TextBlock({
  content,
  isStreaming,
  isLast,
}: {
  content: string
  isStreaming: boolean
  isLast: boolean
}) {
  const normalizedContent = trimBoundaryBlankLines(content)
  if (!normalizedContent.trim()) return null

  const isCurrentlyStreaming = isStreaming && isLast
  // Ignore boundary blank lines when deciding if a status line should stay compact.
  const isShortText = isCompactLinearStreamText(normalizedContent)

  return (
    <div className={`${isShortText ? 'py-0.5' : 'py-2'} text-foreground break-words leading-relaxed`}>
      <StreamdownRenderer
        content={normalizedContent}
        isStreaming={isCurrentlyStreaming}
        className={isShortText ? 'streamdown-compact' : undefined}
      />
      {isCurrentlyStreaming && (
        <span className="inline-flex items-center ml-1 align-middle">
          <HaloLogo size={16} animated={true} />
        </span>
      )}
    </div>
  )
})

// ============================================
// Main Component
// ============================================

export function LinearStream({
  thoughts,
  streamingContent,
  textSegments,
  lastSegmentIndex,
  isStreaming,
  isThinking,
  sdkStatus,
  taskProgressMap,
  subagentRunMap,
  onViewSubagentDetails,
  onKillSubagent,
}: LinearStreamProps) {
  const { t } = useTranslation()

  const isSkillToolName = (toolName?: string) => toolName === 'Skill' || toolName === 'mcp__skill__Skill'

  // Track which thinking IDs have been seen (for typewriter animation on new ones only)
  const seenThinkingIds = useRef<Set<string>>(new Set())

  // Build timeline items from thoughts
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = []
    const visibleActiveToolUseIds = getLatestVisibleActiveToolUseIds(thoughts)

    // Helper to check if a tool_use is complete
    const isToolComplete = (thought: Thought): boolean => !!getMatchingToolResult(thoughts, thought)

    const getToolResult = (thought: Thought) => {
      const resultThought = getMatchingToolResult(thoughts, thought)
      if (resultThought) {
        return { isError: resultThought.isError || false, duration: resultThought.duration, toolOutput: resultThought.toolOutput }
      }
      return null
    }

    // Track Skill tool uses for grouping child tools
    const skillToolIds = new Set<string>()
    const childToolMap = new Map<string, TimelineItem[]>()

    // First, identify all Skill tools and their children
    for (const thought of thoughts) {
      if (thought.type === 'tool_use' && isSkillToolName(thought.toolName)) {
        skillToolIds.add(thought.id)
        childToolMap.set(thought.id, [])
      }
    }

    // Second pass: build timeline items
    for (const thought of thoughts) {
      if (thought.type === 'thinking') {
        items.push({
          id: thought.id,
          timestamp: thought.timestamp,
          type: 'thinking',
          content: thought.content,
        })
      } else if (thought.type === 'tool_use') {
        // Skip TodoWrite - we'll render TodoCard separately
        if (thought.toolName === 'TodoWrite') continue

        const isComplete = isToolComplete(thought)
        if (!isComplete && !visibleActiveToolUseIds.has(thought.id)) {
          continue
        }

        // Check if this is a child of a Skill
        if (thought.parentToolId) {
          // Find the parent skill
          const parentId = thought.parentToolId
          if (childToolMap.has(parentId)) {
            const result = getToolResult(thought)
            const childItem: TimelineItem = {
              id: thought.id,
              timestamp: thought.timestamp,
              type: 'tool_use',
              toolName: thought.toolName,
              toolInput: thought.toolInput,
              toolOutput: result?.toolOutput,
              isComplete,
              isError: result?.isError || false,
              duration: result?.duration,
              parentToolId: parentId,
            }
            childToolMap.get(parentId)!.push(childItem)
            continue
          }
        }

        // Handle Skill tool specially
        if (isSkillToolName(thought.toolName)) {
          const result = getToolResult(thought)
          items.push({
            id: thought.id,
            timestamp: thought.timestamp,
            type: 'skill',
            skillName: String(thought.toolInput?.skill || thought.toolInput?.name || 'skill'),
            isComplete,
            isError: result?.isError || false,
            duration: result?.duration,
            childItems: childToolMap.get(thought.id) || [],
          })
        } else {
          // Regular tool
          const result = getToolResult(thought)
          items.push({
            id: thought.id,
            timestamp: thought.timestamp,
            type: 'tool_use',
            toolName: thought.toolName,
            toolInput: thought.toolInput,
            toolOutput: result?.toolOutput,
            isComplete,
            isError: result?.isError || false,
            duration: result?.duration,
          })
        }
      } else if (thought.type === 'error') {
        items.push({
          id: thought.id,
          timestamp: thought.timestamp,
          type: 'error',
          content: thought.content,
          isError: true,
        })
      }
    }

    // Add text segments
    for (const segment of textSegments) {
      if (segment.content.trim()) {
        items.push({
          id: `text-${segment.startIndex}`,
          timestamp: segment.timestamp,
          type: 'text',
          content: segment.content,
        })
      }
    }

    // Sort by timestamp
    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return items
  }, [thoughts, textSegments])

  // Get latest todos for TodoCard
  const latestTodos = useMemo(() => {
    const todoThoughts = thoughts.filter(
      t => t.type === 'tool_use' && t.toolName === 'TodoWrite' && t.toolInput
    )
    if (todoThoughts.length === 0) return null
    const latest = todoThoughts[todoThoughts.length - 1]
    return parseTodoInput(latest.toolInput!)
  }, [thoughts])

  // Group tool calls under todo steps (when TodoWrite exists)
  const todoGrouping = useMemo(() => {
    return groupToolsByTodoSteps(thoughts, timelineItems)
  }, [thoughts, timelineItems])

  // Items to render flat (either all items or only ungrouped ones)
  const flatItems = useMemo(() => {
    if (!todoGrouping.hasTodos) return timelineItems
    return [...todoGrouping.preStepItems, ...todoGrouping.ungroupedItems]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [todoGrouping, timelineItems])

  // Current text (content after last segment)
  const currentText = useMemo(() => {
    if (!streamingContent) return ''
    return streamingContent.slice(lastSegmentIndex)
  }, [streamingContent, lastSegmentIndex])

  const subagentRuns = useMemo(() => {
    return Array.from(subagentRunMap?.values() || []).sort(
      (a, b) => new Date(a.spawnedAt).getTime() - new Date(b.spawnedAt).getTime()
    )
  }, [subagentRunMap])

  // Check if there's anything to display
  const hasContent = timelineItems.length > 0 || latestTodos || currentText.trim() || isThinking || subagentRuns.length > 0

  if (!hasContent) return null

  // Helper to render a timeline item
  const renderTimelineItem = (item: TimelineItem, taskColorCounter: { value: number }) => {
    switch (item.type) {
      case 'thinking':
        const isNewThinking = !seenThinkingIds.current.has(item.id)
        if (isNewThinking) seenThinkingIds.current.add(item.id)
        return (
          <ThinkingItem
            key={item.id}
            content={item.content || ''}
            isNew={isNewThinking}
          />
        )
      case 'tool_use':
        // Task (sub-agent) gets its own distinctive card with unique color
        if (item.toolName === 'Task') {
          const colorIdx = taskColorCounter.value++
          // Find matching task progress by toolUseId
          let taskProgress: { summary?: string; lastToolName?: string; usage?: { tool_uses: number } } | undefined
          if (taskProgressMap) {
            taskProgressMap.forEach((tp) => {
              if (tp.toolUseId === item.id) {
                taskProgress = tp
              }
            })
          }
          return (
            <AgentTaskCard
              key={item.id}
              description={String(item.toolInput?.description || 'agent')}
              subagentType={String(item.toolInput?.subagent_type || '')}
              isRunning={!item.isComplete && !item.isError}
              isComplete={item.isComplete || false}
              isError={item.isError || false}
              duration={item.duration}
              colorIndex={colorIdx}
              summary={taskProgress?.summary}
              lastToolName={taskProgress?.lastToolName}
              toolUses={taskProgress?.usage?.tool_uses}
              stepHistory={(taskProgress as any)?.stepHistory}
              resultSummary={(taskProgress as any)?.resultSummary}
            />
          )
        }
        return (
          <ToolItem
            key={item.id}
            toolName={item.toolName || ''}
            toolInput={item.toolInput}
            isComplete={item.isComplete || false}
            isError={item.isError || false}
            duration={item.duration}
            toolOutput={item.toolOutput}
          />
        )
      case 'skill':
        return (
          <SkillItem
            key={item.id}
            skillName={item.skillName || ''}
            isComplete={item.isComplete || false}
            isRunning={!item.isComplete}
            childItems={item.childItems}
          />
        )
      case 'text':
        return (
          <TextBlock
            key={item.id}
            content={item.content || ''}
            isStreaming={false}
            isLast={false}
          />
        )
      case 'error': {
        // Translate known error patterns
        let errorContent = item.content || ''

        // Known API errors — keys must match backend ERROR_TYPE_MAP values
        const KNOWN_ERRORS: Record<string, string> = {
          'Insufficient account balance': t('Insufficient account balance'),
          'Invalid API key': t('Invalid API key'),
          'Rate limit exceeded': t('Rate limit exceeded'),
          'Model not found': t('Model not found'),
          'Service is temporarily overloaded': t('Service is temporarily overloaded'),
          'Server error, please try again later': t('Server error, please try again later'),
          'Billing error': t('Billing error'),
        }

        const usageLimitMatch = errorContent.match(/^Usage limit reached\. Resets in ~(\d+) minutes\.$/)
        if (usageLimitMatch) {
          errorContent = t('Usage limit reached. Resets in ~{{minutes}} minutes.', { minutes: usageLimitMatch[1] })
        } else if (errorContent === 'Usage limit reached.') {
          errorContent = t('Usage limit reached.')
        } else if (KNOWN_ERRORS[errorContent]) {
          errorContent = KNOWN_ERRORS[errorContent]
        } else if (errorContent.includes('ByteString')) {
          errorContent = t('API key contains invalid characters. Please check your API key in Settings.')
        } else if (errorContent.includes('"message"')) {
          // Fallback: try to extract from raw JSON if backend extraction was bypassed
          const jsonFallback = errorContent.match(/\{[\s\S]*\}/)
          if (jsonFallback) {
            try {
              const parsed = JSON.parse(jsonFallback[0])
              const msg = parsed?.error?.message || parsed?.message
              if (msg) errorContent = KNOWN_ERRORS[msg] || msg
            } catch { /* keep original */ }
          }
        }

        return (
          <div key={item.id} className="py-1 text-xs text-destructive/70">
            <XCircle size={14} className="inline mr-1" />
            {errorContent}
          </div>
        )
      }
      default:
        return null
    }
  }

  return (
    <div className="px-3 py-1 w-full overflow-y-hidden overflow-x-auto text-left text-[13px]">
      {/* Pre-step items (tools before first TodoWrite), skip skill badges */}
      {todoGrouping.hasTodos && todoGrouping.preStepItems.length > 0 && (() => {
        const counter = { value: 0 }
        return todoGrouping.preStepItems
          .filter(item => item.type !== 'skill')
          .map(item => renderTimelineItem(item, counter))
      })()}

      {/* TodoCard rendered as floating indicator in ChatView instead */}

      {/* Flat timeline items (all items when no todos, or ungrouped items when todos exist) */}
      {(() => {
        const counter = { value: 0 }
        return flatItems.map(item => renderTimelineItem(item, counter))
      })()}

      {subagentRuns.map((run, index) => (
        <HostedSubagentCard
          key={`hosted-${run.runId}`}
          run={run}
          colorIndex={index}
          onViewDetails={onViewSubagentDetails || (() => {})}
          onKill={onKillSubagent || (() => {})}
        />
      ))}

      {/* Current streaming text (content after last segment) */}
      {currentText.trim() && (
        <TextBlock
          content={currentText}
          isStreaming={isStreaming}
          isLast={true}
        />
      )}

      {/* Waiting indicator - CLI style */}
      {isThinking && !isStreaming && !currentText.trim() && (
        <div className="py-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="text-orange-400 animate-blink">⏺</span>
            <span>{t('chat.thinking').replace(/\.{3}$/, '')}<span className="thinking-dots"><span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></span></span>
          </div>
          {sdkStatus && !shouldSuppressSetModelStatus(sdkStatus) && (
            <div className="ml-6 text-xs text-muted-foreground/50 animate-pulse">
              {sdkStatus}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
