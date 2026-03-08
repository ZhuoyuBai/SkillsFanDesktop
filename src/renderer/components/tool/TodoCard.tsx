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
  Circle,
  CheckCircle2,
  Loader2,
  ListTodo,
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

// Get icon and style for todo status
function getTodoStatusDisplay(status: TodoStatus) {
  switch (status) {
    case 'pending':
      return {
        Icon: Circle,
        color: 'text-muted-foreground/50',
        bgColor: 'bg-transparent',
        textStyle: 'text-muted-foreground',
      }
    case 'in_progress':
      return {
        Icon: Loader2,
        color: 'text-primary',
        bgColor: 'bg-primary/10 border-l-2 border-l-primary',
        textStyle: 'text-foreground font-medium',
        spin: true,
      }
    case 'completed':
      return {
        Icon: CheckCircle2,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
        textStyle: 'text-muted-foreground line-through',
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
  const Icon = display.Icon
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
          flex items-start gap-3 px-3 py-2 rounded-lg transition-all duration-200
          ${display.bgColor}
          ${item.status === 'in_progress' ? 'animate-fade-in' : ''}
          ${hasExpandable ? 'cursor-pointer hover:bg-muted/30' : ''}
        `}
        onClick={() => hasExpandable && setIsExpanded(!isExpanded)}
      >
        <Icon
          size={16}
          className={`
            flex-shrink-0 mt-0.5
            ${display.color}
            ${display.spin ? 'animate-spin' : ''}
          `}
        />
        <span className={`text-sm leading-relaxed flex-1 ${display.textStyle}`}>
          {displayText}
        </span>

        {/* Tool count badge */}
        {toolCount > 0 && (
          <span className="text-[10px] bg-muted/60 text-muted-foreground/70 px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 min-w-[20px] text-center">
            {toolCount}
          </span>
        )}

        {/* Expand/collapse chevron */}
        {hasExpandable && (
          <ChevronRight
            size={14}
            className={`
              text-muted-foreground/40 flex-shrink-0 mt-0.5 transition-transform
              ${isExpanded ? 'rotate-90' : ''}
            `}
          />
        )}
      </div>

      {/* Expanded: tool calls list */}
      {isExpanded && toolCount > 0 && (
        <div className="ml-9 mt-1 mb-2 pl-3 border-l-2 border-primary/20 space-y-0.5">
          {toolItems!.map((tool) => {
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
                  colorIndex={0}
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
              />
            )
          })}
        </div>
      )}

      {/* Status history (when expanded) */}
      {isExpanded && hasHistory && (
        <div className="ml-9 mt-1 mb-2 pl-3 border-l-2 border-border/30 space-y-1">
          {statusHistory!.map((status, idx) => (
            <div key={idx} className="text-xs text-muted-foreground/70">
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
      <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
        {/* Header */}
        <div
          className={`
            flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/20
            ${canCollapse ? 'cursor-pointer hover:bg-secondary/30 transition-colors' : ''}
          `}
          onClick={onToggleCollapse}
        >
          <div className="flex items-center gap-2">
            <ListTodo size={16} className="text-primary" />
            <span className="text-sm font-medium text-foreground">{t('Task progress')}</span>
            {/* Progress indicator (n/m) */}
            <span className="text-xs text-muted-foreground">
              ({stats.completed}/{stats.total})
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {stats.inProgress > 0 && (
              <span className="text-primary font-medium">{t('{{count}} in progress', { count: stats.inProgress })}</span>
            )}
            {stats.pending > 0 && (
              <span>{t('{{count}} pending', { count: stats.pending })}</span>
            )}
            {canCollapse && (
              <ChevronDown
                size={16}
                className={`text-muted-foreground transition-transform duration-200 ml-1 ${
                  isCollapsed ? '-rotate-90' : ''
                }`}
              />
            )}
          </div>
        </div>

        {/* Progress bar - always visible */}
        {stats.total > 0 && (
          <div className="h-1.5 bg-secondary/30">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
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
          {/* Todo items - scrollable when list is long */}
          <div className="p-2 space-y-1 max-h-[600px] overflow-y-auto">
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
