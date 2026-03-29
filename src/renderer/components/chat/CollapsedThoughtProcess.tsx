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

  // Count errors
  const errorCount = thoughts.filter(t => t.type === 'error').length

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
    <div className="mb-2 rounded-xl border border-border/20 bg-card/25">
      {/* Header - subtle summary rail */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px]
          text-muted-foreground/70 transition-colors hover:text-foreground/80"
      >
        <span className={`flex-shrink-0 ${
          isThinking ? 'text-orange-400' : errorCount > 0 ? 'text-destructive/70' : 'text-muted-foreground/45'
        }`}>
          {isThinking ? '⟳' : errorCount > 0 ? '✗' : '⏺'}
        </span>

        <span className="font-medium text-foreground/80">{t('Thought process')}</span>

        {!isExpanded && thinkingSummary && (
          <span className="truncate text-xs text-muted-foreground/45 max-w-[18rem] md:max-w-[24rem]">
            {thinkingSummary}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground/45 flex-shrink-0">
          {stats.completed > 0 && (
            <span>{stats.completed} {t('tools')}</span>
          )}
          {!isThinking && stats.duration > 0 && (
            <span>{stats.duration.toFixed(1)}s</span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="animate-slide-down border-t border-border/15 px-4 pb-3 pt-3">
          {hasTodos && (
            <div className="mb-3">
              <TodoCard
                todos={latestTodos}
                isCollapsed={todoCollapsed}
                onToggleCollapse={onToggleTodo}
                taskStatusHistory={taskStatusHistory}
              />
            </div>
          )}

          {hasActivity && (
            <div className={`${hasTodos ? 'border-t border-border/10 pt-2' : ''}`}>
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
