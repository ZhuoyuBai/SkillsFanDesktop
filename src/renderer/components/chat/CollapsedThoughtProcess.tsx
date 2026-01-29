/**
 * CollapsedThoughtProcess - Unified thought process display
 * Supports both realtime (during execution) and completed modes
 *
 * Structure:
 * - Header button (expand/collapse entire section)
 * - TodoCard at top (with its own collapse)
 * - Tool calls list (InlineActivity style)
 */

import { useState, useMemo } from 'react'
import {
  Lightbulb,
  Loader2,
  XCircle,
  ChevronRight,
} from 'lucide-react'
import { TodoCard, parseTodoInput } from '../tool/TodoCard'
import { InlineActivity } from './InlineActivity'
import type { Thought } from '../../types'
import { useTranslation } from '../../i18n'

interface CollapsedThoughtProcessProps {
  thoughts: Thought[]
  isThinking?: boolean  // Realtime mode flag
  // Collapse states for TodoCard
  todoCollapsed?: boolean
  onToggleTodo?: () => void
  taskStatusHistory?: Map<string, string[]>
}

export function CollapsedThoughtProcess({
  thoughts,
  isThinking = false,
  todoCollapsed = false,
  onToggleTodo,
  taskStatusHistory
}: CollapsedThoughtProcessProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)  // Default collapsed

  // Get summary preview from last thinking content
  const thinkingSummary = useMemo(() => {
    const thinkingThoughts = thoughts.filter(t => t.type === 'thinking')
    if (thinkingThoughts.length === 0) return ''
    const lastThinking = thinkingThoughts[thinkingThoughts.length - 1]
    const content = lastThinking.content || ''
    if (content.length <= 60) return content
    return content.substring(0, 60) + '...'
  }, [thoughts])

  // Get latest todo data
  const latestTodos = useMemo(() => {
    const todoThoughts = thoughts.filter(
      t => t.type === 'tool_use' && t.toolName === 'TodoWrite' && t.toolInput
    )
    if (todoThoughts.length === 0) return null

    const latest = todoThoughts[todoThoughts.length - 1]
    return parseTodoInput(latest.toolInput!)
  }, [thoughts])

  // Check if there's any activity (non-TodoWrite tool calls)
  const hasActivity = useMemo(() => {
    return thoughts.some(t =>
      t.type === 'tool_use' &&
      !t.parentToolId &&
      t.toolName !== 'TodoWrite'
    )
  }, [thoughts])

  // Check if there's anything to show
  const hasTodos = latestTodos && latestTodos.length > 0
  const hasContent = hasActivity || hasTodos || isThinking

  if (!hasContent) return null

  // Count errors
  const errorCount = thoughts.filter(t => t.type === 'error').length

  // Calculate stats
  const stats = useMemo(() => {
    const toolUses = thoughts.filter(t => t.type === 'tool_use' && !t.parentToolId && t.toolName !== 'TodoWrite')
    const completed = toolUses.filter(toolUse => {
      return thoughts.some(t =>
        t.type === 'tool_result' &&
        t.id.includes(toolUse.id.replace('tool_use_', ''))
      )
    }).length
    const running = toolUses.length - completed

    // Calculate duration
    let duration = 0
    if (thoughts.length >= 1) {
      const first = new Date(thoughts[0].timestamp).getTime()
      const last = new Date(thoughts[thoughts.length - 1].timestamp).getTime()
      duration = (last - first) / 1000
    }

    return { running, completed, duration }
  }, [thoughts])

  return (
    <div className="mb-2">
      {/* Header button - toggle entire section */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
          transition-all duration-200 w-full
          ${isExpanded
            ? 'bg-muted/20 border border-border/30'
            : 'bg-muted/10 hover:bg-muted/20 border border-transparent'
          }
        `}
      >
        {/* Expand icon */}
        <ChevronRight
          size={12}
          className={`text-muted-foreground/60 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
        />

        {/* Icon - spinner when thinking, lightbulb when done */}
        {isThinking ? (
          <Loader2 size={14} className="text-muted-foreground/70 animate-spin flex-shrink-0" />
        ) : errorCount > 0 ? (
          <XCircle size={14} className="text-destructive/70 flex-shrink-0" />
        ) : (
          <Lightbulb size={14} className="text-muted-foreground/60 flex-shrink-0" />
        )}

        {/* Label */}
        <span className="text-muted-foreground/70">{t('Thought process')}</span>

        {/* Summary preview when collapsed */}
        {!isExpanded && thinkingSummary && (
          <span className="text-muted-foreground/40 truncate max-w-[200px] text-[10px]">
            {thinkingSummary}
          </span>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2 text-muted-foreground/50 ml-auto flex-shrink-0">
          {stats.running > 0 && (
            <span className="text-muted-foreground/60">{t('{{count}} running', { count: stats.running })}</span>
          )}
          {stats.completed > 0 && (
            <span>{t('{{count}} completed', { count: stats.completed })}</span>
          )}
          {!isThinking && stats.duration > 0 && (
            <span>{stats.duration.toFixed(1)}s</span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1 px-3 py-2 bg-muted/10 rounded-lg border border-border/20 animate-slide-down">
          {/* TodoCard at top - with its own collapse */}
          {hasTodos && (
            <div className="mb-2">
              <TodoCard
                todos={latestTodos}
                isCollapsed={todoCollapsed}
                onToggleCollapse={onToggleTodo}
                taskStatusHistory={taskStatusHistory}
              />
            </div>
          )}

          {/* Tool calls list - using InlineActivity */}
          {hasActivity && (
            <div className={hasTodos ? 'pt-2 border-t border-border/20' : ''}>
              <InlineActivity
                thoughts={thoughts}
                isThinking={isThinking}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
