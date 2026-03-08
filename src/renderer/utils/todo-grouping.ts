/**
 * Todo Grouping - Maps tool calls to their corresponding todo steps
 *
 * Uses time-interval inference: each TodoWrite snapshot identifies the currently
 * in_progress step, and tool calls between snapshots are assigned to that step.
 */

import type { Thought, TimelineItem } from '../types'
import { parseTodoInput, type TodoItem } from '../components/tool/TodoCard'

export interface TodoStepWithTools {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
  toolItems: TimelineItem[]
}

export interface TodoGroupingResult {
  hasTodos: boolean
  steps: TodoStepWithTools[]
  /** Timeline items before the first TodoWrite (shown flat above TodoCard) */
  preStepItems: TimelineItem[]
  /** Non-tool timeline items: thinking, text, error (shown flat below TodoCard) */
  ungroupedItems: TimelineItem[]
}

interface TimeInterval {
  startTime: number
  endTime: number
  activeStepContent: string
}

/**
 * Groups tool-call timeline items under their corresponding todo steps.
 * Non-tool items (thinking, text, error) remain ungrouped.
 */
export function groupToolsByTodoSteps(
  thoughts: Thought[],
  timelineItems: TimelineItem[]
): TodoGroupingResult {
  // 1. Collect all TodoWrite thoughts in chronological order
  const todoSnapshots = thoughts.filter(
    t => t.type === 'tool_use' && t.toolName === 'TodoWrite' && t.toolInput
  )

  if (todoSnapshots.length === 0) {
    return {
      hasTodos: false,
      steps: [],
      preStepItems: [],
      ungroupedItems: timelineItems,
    }
  }

  const firstTodoTime = new Date(todoSnapshots[0].timestamp).getTime()

  // 2. Build time intervals mapping to active step
  const intervals: TimeInterval[] = []
  for (let i = 0; i < todoSnapshots.length; i++) {
    const todos = parseTodoInput(todoSnapshots[i].toolInput!)
    const activeStep = todos.find(t => t.status === 'in_progress')
    if (!activeStep) continue

    const startTime = new Date(todoSnapshots[i].timestamp).getTime()
    const endTime = i + 1 < todoSnapshots.length
      ? new Date(todoSnapshots[i + 1].timestamp).getTime()
      : Infinity

    intervals.push({
      startTime,
      endTime,
      activeStepContent: activeStep.content,
    })
  }

  // 3. Categorize timeline items
  const preStepItems: TimelineItem[] = []
  const ungroupedItems: TimelineItem[] = []
  const stepToolMap = new Map<string, TimelineItem[]>()

  for (const item of timelineItems) {
    // Non-tool items stay flat (thinking, text, error)
    if (item.type !== 'tool_use' && item.type !== 'skill') {
      ungroupedItems.push(item)
      continue
    }

    const itemTime = new Date(item.timestamp).getTime()

    // Tools before first TodoWrite stay flat
    if (itemTime < firstTodoTime) {
      preStepItems.push(item)
      continue
    }

    // Find which interval this tool belongs to (last interval whose start <= item time)
    let matchedInterval: TimeInterval | null = null
    for (let i = intervals.length - 1; i >= 0; i--) {
      if (itemTime >= intervals[i].startTime) {
        matchedInterval = intervals[i]
        break
      }
    }

    if (matchedInterval) {
      const key = matchedInterval.activeStepContent
      if (!stepToolMap.has(key)) {
        stepToolMap.set(key, [])
      }
      stepToolMap.get(key)!.push(item)
    } else {
      // Fallback: tool between firstTodoTime and first interval start
      preStepItems.push(item)
    }
  }

  // 4. Build final steps from latest TodoWrite snapshot
  const latestTodos = parseTodoInput(todoSnapshots[todoSnapshots.length - 1].toolInput!)
  const steps: TodoStepWithTools[] = latestTodos.map(todo => ({
    content: todo.content,
    status: todo.status,
    activeForm: todo.activeForm,
    toolItems: stepToolMap.get(todo.content) || [],
  }))

  return {
    hasTodos: true,
    steps,
    preStepItems,
    ungroupedItems,
  }
}
