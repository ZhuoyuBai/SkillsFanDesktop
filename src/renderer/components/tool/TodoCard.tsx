/**
 * TodoCard - Visual representation of AI task planning
 * Displays todo items created by TodoWrite tool in a clear, intuitive checklist format
 *
 * Design principles:
 * - Simple and intuitive - users see a familiar task list
 * - Non-intrusive - appears naturally in the thought flow
 * - Real-time updates - status changes animate smoothly
 * - Collapsible - can be collapsed to save space
 * - Tool grouping - each step can expand to show its tool calls
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useTranslation } from '../../i18n'
import { ToolItem } from './ToolItem'
import { AgentTaskCard } from './AgentTaskCard'
import type { TimelineItem } from '../../types'

// Todo item status from Claude Code SDK
type TodoStatus = 'pending' | 'in_progress' | 'completed'

interface TodoItem {
  content: string
  status: TodoStatus
  activeForm?: string  // Present tense form for in_progress display
}

interface TodoCardProps {
  todos: TodoItem[]
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  taskStatusHistory?: Map<string, string[]>  // task content -> status updates
  stepToolItems?: Map<string, TimelineItem[]>  // step content -> tool timeline items
}

// Get CLI-style status display for todo status
function getTodoStatusDisplay(status: TodoStatus) {
  switch (status) {
    case 'pending':
      return {
        symbol: '○',
        symbolColor: 'text-foreground/50',
        bgColor: '',
        textStyle: 'text-foreground/70',
      }
    case 'in_progress':
      return {
        symbol: '●',
        symbolColor: 'text-orange-500',
        bgColor: 'border-l-2 border-l-orange-500',
        textStyle: 'text-foreground font-medium',
      }
    case 'completed':
      return {
        symbol: '✓',
        symbolColor: 'text-green-600',
        bgColor: '',
        textStyle: 'text-foreground/40 line-through',
      }
  }
}

// Single todo item with expandable tool calls
function TodoItemRow({
  item,
  statusHistory,
  toolItems,
}: {
  item: TodoItem
  statusHistory?: string[]
  toolItems?: TimelineItem[]
}) {
  // in_progress steps with tools default expanded; completed default collapsed
  const defaultExpanded = item.status === 'in_progress'
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const prevStatusRef = useRef(item.status)

  // Auto-expand when status changes to in_progress, collapse when completed
  useEffect(() => {
    if (prevStatusRef.current !== item.status) {
      if (item.status === 'in_progress') {
        setIsExpanded(true)
      } else if (item.status === 'completed') {
        setIsExpanded(false)
      }
      prevStatusRef.current = item.status
    }
  }, [item.status])

  const display = getTodoStatusDisplay(item.status)
  const hasHistory = statusHistory && statusHistory.length > 0
  const toolCount = toolItems?.length ?? 0
  const hasExpandable = toolCount > 0 || hasHistory

  // Show activeForm when in progress, otherwise show content
  const displayText = item.status === 'in_progress' && item.activeForm
    ? item.activeForm
    : item.content

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-3 py-1.5 transition-all duration-200
          ${display.bgColor}
          ${item.status === 'in_progress' ? 'animate-fade-in' : ''}
          ${hasExpandable ? 'cursor-pointer hover:bg-muted/10' : ''}
        `}
        onClick={() => hasExpandable && setIsExpanded(!isExpanded)}
      >
        {/* CLI status symbol */}
        <span className={`flex-shrink-0 text-[13px] ${display.symbolColor} ${
          item.status === 'in_progress' ? 'animate-pulse' : ''
        }`}>
          {display.symbol}
        </span>
        <span className={`text-[13px] leading-relaxed flex-1 ${display.textStyle}`}>
          {displayText}
        </span>

        {/* Tool count */}
        {toolCount > 0 && (
          <span className="text-[10px] text-foreground/40 flex-shrink-0">
            {toolCount}
          </span>
        )}

        {/* Expand/collapse chevron */}
        {hasExpandable && (
          <ChevronRight
            size={12}
            className={`
              text-foreground/30 flex-shrink-0 transition-transform
              ${isExpanded ? 'rotate-90' : ''}
            `}
          />
        )}
      </div>

      {/* Expanded: tool calls list */}
      {isExpanded && toolCount > 0 && (
        <div className="ml-9 mt-1 mb-2 pl-3 border-l-2 border-primary/20 space-y-0.5">
          {(() => {
            let taskColorIdx = 0
            return toolItems!.map((tool) => {
            // Task (sub-agent) gets its own card
            if (tool.toolName === 'Task') {
              return (
                <AgentTaskCard
                  key={tool.id}
                  description={String(tool.toolInput?.description || 'agent')}
                  subagentType={String(tool.toolInput?.subagent_type || '')}
                  isRunning={!tool.isComplete && !tool.isError}
                  isComplete={tool.isComplete || false}
                  isError={tool.isError || false}
                  duration={tool.duration}
                  colorIndex={taskColorIdx++}
                />
              )
            }
            return (
              <ToolItem
                key={tool.id}
                toolName={tool.toolName || ''}
                toolInput={tool.toolInput}
                isComplete={tool.isComplete || false}
                isError={tool.isError || false}
                duration={tool.duration}
                toolOutput={tool.toolOutput}
              />
            )
          })
          })()}
        </div>
      )}

      {/* Status history (when expanded) */}
      {isExpanded && hasHistory && (
        <div className="ml-9 mt-1 mb-2 pl-3 border-l-2 border-border space-y-1">
          {statusHistory!.map((status, idx) => (
            <div key={idx} className="text-xs text-foreground/60">
              {status}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TodoCard({
  todos,
  isCollapsed = false,
  onToggleCollapse,
  taskStatusHistory,
  stepToolItems,
}: TodoCardProps) {
  const { t } = useTranslation()

  // Calculate progress stats
  const stats = useMemo(() => {
    const total = todos.length
    const completed = todos.filter(t => t.status === 'completed').length
    const inProgress = todos.filter(t => t.status === 'in_progress').length
    const pending = todos.filter(t => t.status === 'pending').length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, completed, inProgress, pending, progress }
  }, [todos])

  if (todos.length === 0) {
    return null
  }

  const canCollapse = !!onToggleCollapse

  return (
    <div className="animate-fade-in">
      <div className="border border-border rounded overflow-hidden">
        {/* Header - simplified CLI style */}
        <div
          className={`
            flex items-center justify-between px-3 py-2
            ${canCollapse ? 'cursor-pointer hover:bg-muted/10 transition-colors' : ''}
          `}
          onClick={onToggleCollapse}
        >
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-foreground font-medium">{t('Task progress')}</span>
            <span className="text-foreground/70">
              {stats.completed}/{stats.total}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            {stats.inProgress > 0 && (
              <span className="text-orange-500 font-medium">{t('{{count}} in progress', { count: stats.inProgress })}</span>
            )}
            {canCollapse && (
              <ChevronDown
                size={14}
                className={`text-foreground/40 transition-transform duration-200 ${
                  isCollapsed ? '-rotate-90' : ''
                }`}
              />
            )}
          </div>
        </div>

        {/* Thin progress bar */}
        {stats.total > 0 && (
          <div className="h-[3px] bg-foreground/10">
            <div
              className="h-full bg-green-600 transition-all duration-500 ease-out"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        )}

        {/* Collapsible content */}
        <div
          className={`
            transition-all duration-200 ease-out overflow-hidden
            ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[800px] opacity-100'}
          `}
        >
          <div className="py-1 space-y-0 max-h-[600px] overflow-y-auto">
            {todos.map((item, index) => (
              <TodoItemRow
                key={index}
                item={item}
                statusHistory={taskStatusHistory?.get(item.content)}
                toolItems={stepToolItems?.get(item.content)}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// Parse TodoWrite tool input to TodoItem array
export function parseTodoInput(input: Record<string, unknown>): TodoItem[] {
  const todos = input.todos as Array<{
    content: string
    status: string
    activeForm?: string
  }> | undefined

  if (!todos || !Array.isArray(todos)) {
    return []
  }

  return todos.map(t => ({
    content: t.content || '',
    status: (t.status as TodoStatus) || 'pending',
    activeForm: t.activeForm,
  }))
}

export type { TodoItem, TodoStatus }
