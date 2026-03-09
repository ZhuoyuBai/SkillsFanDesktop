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

import { useState, useMemo, memo } from 'react'
import {
  ChevronRight,
  Lightbulb,
  Loader2,
  XCircle,
} from 'lucide-react'
import { StreamdownRenderer } from './StreamdownRenderer'
import { TodoCard, parseTodoInput } from '../tool/TodoCard'
import { AgentTaskCard } from '../tool/AgentTaskCard'
import { ToolItem } from '../tool/ToolItem'
import { groupToolsByTodoSteps } from '../../utils/todo-grouping'
import { HaloLogo } from '../brand/HaloLogo'
import type { Thought, TimelineItem, TextSegment, TodoItem } from '../../types'
import { useTranslation } from '../../i18n'
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
  // TodoCard collapse state
  todoCollapsed?: boolean
  onToggleTodo?: () => void
  taskStatusHistory?: Map<string, string[]>
}

// Utility functions and ToolItem component are in ../tool/ToolItem.tsx

// ============================================
// Sub-components
// ============================================

// Process Tag - unified tag-style display for different processes
// Types: thinking, tool, skill (each with different colors)
const ProcessTag = memo(function ProcessTag({
  type,
  label,
  icon: Icon,
  content,
  isRunning = false,
  duration,
  className = '',
}: {
  type: 'thinking' | 'tool' | 'skill' | 'error'
  label: string
  icon: React.ElementType
  content?: string
  isRunning?: boolean
  duration?: number
  className?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasContent = content && content.trim().length > 0

  // Tag styles based on type
  const tagStyles = {
    thinking: 'bg-muted/30 text-muted-foreground/70 border-muted-foreground/20',
    tool: 'bg-muted/20 text-muted-foreground/60 border-muted-foreground/15',
    skill: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30 font-semibold',
    error: 'bg-destructive/10 text-destructive/80 border-destructive/30',
  }

  // Icon styles based on type
  const iconStyles = {
    thinking: 'text-blue-400/70',
    tool: 'text-muted-foreground/60',
    skill: 'text-violet-500',
    error: 'text-destructive/70',
  }

  return (
    <div className={`py-0.5 ${className}`}>
      {/* Tag header - clickable if has content */}
      <button
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        disabled={!hasContent}
        className={`
          inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs text-left
          border transition-all
          ${tagStyles[type]}
          ${hasContent ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'}
        `}
      >
        {/* Expand arrow (only if has content) */}
        {hasContent && (
          <ChevronRight
            size={10}
            className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        )}

        {/* Icon */}
        <Icon size={12} className={`flex-shrink-0 ${iconStyles[type]} ${isRunning ? 'animate-pulse' : ''}`} />

        {/* Label */}
        <span className={type === 'skill' ? 'font-semibold' : ''}>{label}</span>

        {/* Running indicator */}
        {isRunning && (
          <Loader2 size={10} className="animate-spin flex-shrink-0 ml-0.5" />
        )}

        {/* Duration */}
        {!isRunning && duration && (
          <span className="text-muted-foreground/50 ml-0.5">
            ({(duration / 1000).toFixed(1)}s)
          </span>
        )}
      </button>

      {/* Expanded content - code block style */}
      {isExpanded && hasContent && (
        <div className="mt-1 ml-4 p-2 rounded bg-muted/20 border border-border/20 text-xs text-muted-foreground/70 font-mono whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
})

// Thinking block - using ProcessTag
const ThinkingItem = memo(function ThinkingItem({
  content,
  timestamp,
}: {
  content: string
  timestamp: string
}) {
  const { t } = useTranslation()
  const summary = content.length > 50 ? content.slice(0, 50) + '...' : content

  return (
    <ProcessTag
      type="thinking"
      label={`${t('Thinking')}: ${summary}`}
      icon={Lightbulb}
      content={content}
    />
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

      {/* Child tools */}
      {childItems && childItems.length > 0 && (
        <div className="ml-4 mt-1 border-l-2 border-orange-500/30 pl-3">
          {childItems.map((child) => (
            <ToolItem
              key={child.id}
              toolName={child.toolName || ''}
              toolInput={child.toolInput}
              isComplete={child.isComplete || false}
              isError={child.isError || false}
              duration={child.duration}
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
  if (!content.trim()) return null

  const isCurrentlyStreaming = isStreaming && isLast

  return (
    <div className="py-2 text-foreground break-words leading-relaxed">
      <StreamdownRenderer
        content={content}
        isStreaming={isCurrentlyStreaming}
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
  todoCollapsed = false,
  onToggleTodo,
  taskStatusHistory,
}: LinearStreamProps) {
  const { t } = useTranslation()

  // Build timeline items from thoughts
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = []
    const visibleActiveToolUseIds = getLatestVisibleActiveToolUseIds(thoughts)

    // Helper to check if a tool_use is complete
    const isToolComplete = (thought: Thought): boolean => !!getMatchingToolResult(thoughts, thought)

    const getToolResult = (thought: Thought) => {
      const resultThought = getMatchingToolResult(thoughts, thought)
      if (resultThought) {
        return { isError: resultThought.isError || false, duration: resultThought.duration }
      }
      return null
    }

    // Track Skill tool uses for grouping child tools
    const skillToolIds = new Set<string>()
    const childToolMap = new Map<string, TimelineItem[]>()

    // First, identify all Skill tools and their children
    for (const thought of thoughts) {
      if (thought.type === 'tool_use' && thought.toolName === 'Skill') {
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
        if (thought.toolName === 'Skill') {
          const result = getToolResult(thought)
          items.push({
            id: thought.id,
            timestamp: thought.timestamp,
            type: 'skill',
            skillName: String(thought.toolInput?.skill || 'skill'),
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

  // Build stepToolItems map for TodoCard
  const stepToolItems = useMemo(() => {
    if (!todoGrouping.hasTodos) return undefined
    const map = new Map<string, TimelineItem[]>()
    for (const step of todoGrouping.steps) {
      if (step.toolItems.length > 0) {
        map.set(step.content, step.toolItems)
      }
    }
    return map
  }, [todoGrouping])

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

  // Check if there's anything to display
  const hasContent = timelineItems.length > 0 || latestTodos || currentText.trim() || isThinking

  if (!hasContent) return null

  // Helper to render a timeline item
  const renderTimelineItem = (item: TimelineItem, taskColorCounter: { value: number }) => {
    switch (item.type) {
      case 'thinking':
        return (
          <ThinkingItem
            key={item.id}
            content={item.content || ''}
            timestamp={item.timestamp}
          />
        )
      case 'tool_use':
        // Task (sub-agent) gets its own distinctive card with unique color
        if (item.toolName === 'Task') {
          const colorIdx = taskColorCounter.value++
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
        const usageLimitMatch = errorContent.match(/^Usage limit reached\. Resets in ~(\d+) minutes\.$/)
        if (usageLimitMatch) {
          errorContent = t('Usage limit reached. Resets in ~{{minutes}} minutes.', { minutes: usageLimitMatch[1] })
        } else if (errorContent === 'Usage limit reached.') {
          errorContent = t('Usage limit reached.')
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
    <div className="rounded-2xl px-4 py-3 message-assistant w-full overflow-y-hidden overflow-x-auto text-left">
      {/* Pre-step items (tools before first TodoWrite), skip skill badges */}
      {todoGrouping.hasTodos && todoGrouping.preStepItems.length > 0 && (() => {
        const counter = { value: 0 }
        return todoGrouping.preStepItems
          .filter(item => item.type !== 'skill')
          .map(item => renderTimelineItem(item, counter))
      })()}

      {/* TodoCard with grouped tool items */}
      {latestTodos && latestTodos.length > 0 && (
        <div className="mb-3">
          <TodoCard
            todos={latestTodos}
            isCollapsed={todoCollapsed}
            onToggleCollapse={onToggleTodo}
            taskStatusHistory={taskStatusHistory}
            stepToolItems={stepToolItems}
          />
        </div>
      )}

      {/* Flat timeline items (all items when no todos, or ungrouped items when todos exist) */}
      {(() => {
        const counter = { value: 0 }
        return flatItems.map(item => renderTimelineItem(item, counter))
      })()}

      {/* Current streaming text (content after last segment) */}
      {currentText.trim() && (
        <TextBlock
          content={currentText}
          isStreaming={isStreaming}
          isLast={true}
        />
      )}

      {/* Waiting indicator when thinking but no streaming */}
      {isThinking && !isStreaming && !currentText.trim() && (
        <div className="py-2 flex items-center gap-2">
          <HaloLogo size={16} animated={true} />
          <span className="text-sm text-muted-foreground">{t('chat.thinking').replace(/\.{3}$/, '')}<span className="thinking-dots"><span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></span></span>
        </div>
      )}
    </div>
  )
}
