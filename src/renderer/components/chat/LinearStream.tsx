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

import { useState, useMemo, memo, useCallback } from 'react'
import {
  ChevronRight,
  Lightbulb,
  Loader2,
  Check,
  XCircle,
  Sparkles,
} from 'lucide-react'
import { getToolIcon } from '../icons/ToolIcons'
import { StreamdownRenderer } from './StreamdownRenderer'
import { TodoCard, parseTodoInput } from '../tool/TodoCard'
import { HaloLogo } from '../brand/HaloLogo'
import type { Thought, TimelineItem, TextSegment, TodoItem } from '../../types'
import { useTranslation } from '../../i18n'

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

// ============================================
// Utility Functions
// ============================================

// Get human-friendly activity text for a tool call
function getActivityText(
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined,
  isComplete: boolean,
  t: (key: string, params?: Record<string, unknown>) => string
): string {
  const input = toolInput || {}

  const getText = (running: string, done: string) => isComplete ? done : running

  switch (toolName) {
    case 'Read':
      return getText(
        t('Reading {{file}}...', { file: extractFileName(input.file_path) }),
        t('Read {{file}}', { file: extractFileName(input.file_path) })
      )
    case 'Write':
      return getText(
        t('Writing {{file}}...', { file: extractFileName(input.file_path) }),
        t('Wrote {{file}}', { file: extractFileName(input.file_path) })
      )
    case 'Edit':
      return getText(
        t('Editing {{file}}...', { file: extractFileName(input.file_path) }),
        t('Edited {{file}}', { file: extractFileName(input.file_path) })
      )
    case 'Grep':
      return getText(
        t('Searching {{pattern}}...', { pattern: truncate(String(input.pattern || ''), 20) }),
        t('Searched {{pattern}}', { pattern: truncate(String(input.pattern || ''), 20) })
      )
    case 'Glob':
      return getText(
        t('Matching {{pattern}}...', { pattern: truncate(String(input.pattern || ''), 20) }),
        t('Matched {{pattern}}', { pattern: truncate(String(input.pattern || ''), 20) })
      )
    case 'Bash':
      return getText(
        t('Running {{command}}...', { command: extractCommand(input.command) }),
        t('Ran {{command}}', { command: extractCommand(input.command) })
      )
    case 'WebFetch':
      return getText(
        t('Fetching {{url}}...', { url: extractDomain(input.url) }),
        t('Fetched {{url}}', { url: extractDomain(input.url) })
      )
    case 'WebSearch':
      return getText(
        t('Searching {{query}}...', { query: truncate(String(input.query || ''), 20) }),
        t('Searched {{query}}', { query: truncate(String(input.query || ''), 20) })
      )
    case 'TodoWrite':
      return getText(t('Updating tasks...'), t('Updated tasks'))
    case 'Task':
      return getText(
        t('Running {{task}}...', { task: truncate(String(input.description || 'agent'), 25) }),
        t('Completed {{task}}', { task: truncate(String(input.description || 'agent'), 25) })
      )
    case 'NotebookEdit':
      return getText(t('Editing notebook...'), t('Edited notebook'))
    case 'AskUserQuestion':
      return getText(t('Waiting for response...'), t('Got response'))
    case 'Skill':
      return getText(
        t('Running {{skill}}...', { skill: String(input.skill || 'skill') }),
        t('Ran {{skill}}', { skill: String(input.skill || 'skill') })
      )
    default:
      return toolName ? (isComplete ? toolName : `${toolName}...`) : (isComplete ? t('Done') : t('Processing...'))
  }
}

function extractFileName(path: unknown): string {
  if (typeof path !== 'string' || !path) return 'file'
  const name = path.split('/').pop() || path.split('\\').pop() || path
  return truncate(name, 25)
}

function extractCommand(cmd: unknown): string {
  if (typeof cmd !== 'string' || !cmd) return 'command'
  const firstPart = cmd.split(' ').slice(0, 2).join(' ')
  return truncate(firstPart, 20)
}

function extractDomain(url: unknown): string {
  if (typeof url !== 'string' || !url) return 'page'
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    return truncate(domain, 20)
  } catch {
    return truncate(url, 20)
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 1) + '…'
}

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
          inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs
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

// Tool call - single line with status
const ToolItem = memo(function ToolItem({
  toolName,
  toolInput,
  isComplete,
  isError,
  duration,
}: {
  toolName: string
  toolInput?: Record<string, unknown>
  isComplete: boolean
  isError: boolean
  duration?: number
}) {
  const { t } = useTranslation()
  const Icon = getToolIcon(toolName)
  const isRunning = !isComplete && !isError

  const activityText = getActivityText(toolName, toolInput, isComplete, t)

  return (
    <div
      className={`flex items-center gap-2 py-0.5 text-xs ${
        isError ? 'text-destructive/70' : isRunning ? 'text-muted-foreground/80' : 'text-muted-foreground/60'
      }`}
    >
      {/* Status icon */}
      {isError ? (
        <XCircle size={14} className="text-destructive/70 flex-shrink-0" />
      ) : isRunning ? (
        <Loader2 size={14} className="animate-spin flex-shrink-0" />
      ) : (
        <Check size={14} className="flex-shrink-0" />
      )}

      {/* Tool icon */}
      <Icon size={14} className="flex-shrink-0" />

      {/* Activity text */}
      <span className="truncate">{activityText}</span>

      {/* Duration */}
      {isComplete && duration && (
        <span className="text-muted-foreground/50 flex-shrink-0">
          ({(duration / 1000).toFixed(1)}s)
        </span>
      )}
    </div>
  )
})

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
      {/* Gradient label */}
      <div
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-full
          ${isRunning ? 'skill-gradient-animated skill-breathing' : 'skill-gradient'}
          shadow-[0_0_20px_rgba(139,92,246,0.4)]
        `}
      >
        <Sparkles size={14} className="text-white" />
        <span className="text-xs font-medium text-white">
          {isRunning
            ? t('Running {{skill}}...', { skill: skillName })
            : t('Ran {{skill}}', { skill: skillName })}
        </span>
        {isRunning && <Loader2 size={12} className="text-white/80 animate-spin" />}
      </div>

      {/* Child tools */}
      {childItems && childItems.length > 0 && (
        <div className="ml-4 mt-1 border-l-2 border-violet-500/30 pl-3">
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
    const toolResultMap = new Map<string, { isError: boolean; duration?: number }>()

    // First pass: collect all tool results
    for (const thought of thoughts) {
      if (thought.type === 'tool_result') {
        // Extract tool_use id from tool_result id (e.g., 'tool_result_abc' -> 'abc')
        const baseId = thought.id.replace('tool_result_', '').replace('_result', '')
        toolResultMap.set(baseId, {
          isError: thought.isError || false,
          duration: thought.duration,
        })
      }
    }

    // Helper to check if a tool_use is complete
    const isToolComplete = (thought: Thought): boolean => {
      const baseId = thought.id.replace('tool_use_', '')
      return toolResultMap.has(baseId) || thoughts.some(
        t => t.type === 'tool_result' && t.id.includes(baseId)
      )
    }

    const getToolResult = (thought: Thought) => {
      const baseId = thought.id.replace('tool_use_', '')
      const result = toolResultMap.get(baseId)
      if (result) return result

      // Fallback: search in thoughts
      const resultThought = thoughts.find(
        t => t.type === 'tool_result' && t.id.includes(baseId)
      )
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
              isComplete: isToolComplete(thought),
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
            isComplete: isToolComplete(thought),
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
            isComplete: isToolComplete(thought),
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

  // Current text (content after last segment)
  const currentText = useMemo(() => {
    if (!streamingContent) return ''
    return streamingContent.slice(lastSegmentIndex)
  }, [streamingContent, lastSegmentIndex])

  // Check if there's anything to display
  const hasContent = timelineItems.length > 0 || latestTodos || currentText.trim() || isThinking

  if (!hasContent) return null

  return (
    <div className="rounded-2xl px-4 py-3 message-assistant w-full overflow-y-hidden overflow-x-auto">
      {/* TodoCard at top - if present */}
      {latestTodos && latestTodos.length > 0 && (
        <div className="mb-3">
          <TodoCard
            todos={latestTodos}
            isCollapsed={todoCollapsed}
            onToggleCollapse={onToggleTodo}
            taskStatusHistory={taskStatusHistory}
          />
        </div>
      )}

      {/* Timeline items */}
      {timelineItems.map((item, index) => {
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
          case 'error':
            return (
              <div key={item.id} className="py-1 text-xs text-destructive/70">
                <XCircle size={14} className="inline mr-1" />
                {item.content}
              </div>
            )
          default:
            return null
        }
      })}

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
          <span className="text-sm text-muted-foreground">{t('chat.thinking')}</span>
        </div>
      )}
    </div>
  )
}
