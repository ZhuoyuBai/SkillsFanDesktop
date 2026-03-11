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
import { TodoCard, parseTodoInput } from '../tool/TodoCard'
import { InlineActivity } from './InlineActivity'
import type { Thought } from '../../types'
import { useTranslation } from '../../i18n'
import { getMatchingToolResult } from '../../../shared/utils/thought-dedupe'

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

  // Calculate stats
  const stats = useMemo(() => {
    const toolUses = thoughts.filter(t => t.type === 'tool_use' && !t.parentToolId && t.toolName !== 'TodoWrite')
    const completed = toolUses.filter(toolUse => {
      return !!getMatchingToolResult(thoughts, toolUse)
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
    <div className="mb-1 px-3">
      {/* Header - minimal CLI style */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2.5 py-0.5 text-[13px] w-full text-left
          text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        <span className={`flex-shrink-0 text-[13px] leading-relaxed select-none transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>
          ❯
        </span>

        <span>{t('Thought process')}</span>

        {/* Summary preview when collapsed */}
        {!isExpanded && thinkingSummary && (
          <span className="text-muted-foreground/50 truncate max-w-[200px]">
            {thinkingSummary}
          </span>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2 text-muted-foreground/50 ml-auto flex-shrink-0">
          {stats.completed > 0 && (
            <span>{stats.completed} {t('tools')}</span>
          )}
          {!isThinking && stats.duration > 0 && (
            <span>{stats.duration.toFixed(1)}s</span>
          )}
        </div>
      </button>

      {/* Expanded content - border-left style */}
      {isExpanded && (
        <div className="ml-3 pl-3 border-l-2 border-muted-foreground/15 py-1 animate-slide-down">
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

          {hasActivity && (
            <div className={hasTodos ? 'pt-1' : ''}>
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
