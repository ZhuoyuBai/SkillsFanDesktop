/**
 * FloatingTodoIndicator - Floating task progress indicator
 *
 * Renders as a small pill badge (collapsed) or full TodoCard panel (expanded)
 * in the top-right corner of the chat message area, without affecting message flow.
 */

import { useMemo } from 'react'
import { ListTodo } from 'lucide-react'
import { cn } from '../../lib/utils'
import { TodoCard } from './TodoCard'
import { useTranslation } from '../../i18n'
import type { TimelineItem } from '../../types'

type TodoStatus = 'pending' | 'in_progress' | 'completed'

interface TodoItem {
  content: string
  status: TodoStatus
  activeForm?: string
}

interface FloatingTodoIndicatorProps {
  todos: TodoItem[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  taskStatusHistory?: Map<string, string[]>
  stepToolItems?: Map<string, TimelineItem[]>
  visible: boolean
}

export function FloatingTodoIndicator({
  todos,
  isCollapsed,
  onToggleCollapse,
  taskStatusHistory,
  stepToolItems,
  visible,
}: FloatingTodoIndicatorProps) {
  const { t } = useTranslation()

  const stats = useMemo(() => {
    const total = todos.length
    const completed = todos.filter(t => t.status === 'completed').length
    const inProgress = todos.filter(t => t.status === 'in_progress').length
    return { total, completed, inProgress }
  }, [todos])

  if (!visible || todos.length === 0) return null

  // Collapsed: small pill badge
  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className={cn(
          'absolute top-3 right-3 z-20',
          'flex items-center gap-1.5 px-2.5 py-1.5',
          'rounded-full shadow-md',
          'bg-background/80 backdrop-blur-sm',
          'border border-border',
          'text-xs text-foreground/70',
          'hover:bg-background/90 hover:text-foreground',
          'hover:border-border',
          'transition-all duration-200 ease-out',
          'animate-fade-in',
        )}
      >
        <ListTodo size={13} className="text-foreground/60" />
        <span className="text-foreground/80 font-medium">{stats.completed}/{stats.total}</span>
        {stats.inProgress > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        )}
      </button>
    )
  }

  // Expanded: full TodoCard panel
  return (
    <div
      className={cn(
        'absolute top-3 right-3 z-20',
        'w-[360px] max-h-[50vh]',
        'rounded-lg shadow-lg overflow-hidden',
        'bg-background/95 backdrop-blur-sm',
        'border border-border',
        'animate-fade-in',
      )}
    >
      <TodoCard
        todos={todos}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
        taskStatusHistory={taskStatusHistory}
        stepToolItems={stepToolItems}
      />
    </div>
  )
}
