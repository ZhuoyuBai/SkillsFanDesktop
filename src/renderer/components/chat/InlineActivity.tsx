/**
 * InlineActivity - CLI-style inline tool activity display
 * Shows tool calls as single-line items without cards or nested hierarchy
 *
 * Design goals:
 * - Maximum information density (single line per tool call)
 * - Status shown via icon only (spinner → checkmark)
 * - No borders, no cards, no timeline dots
 * - Click to expand details (optional)
 */

import { useState, useMemo, memo } from 'react'
import {
  Loader2,
  Check,
  XCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { getToolIcon } from '../icons/ToolIcons'
import type { Thought } from '../../types'
import { useTranslation } from '../../i18n'

interface InlineActivityProps {
  thoughts: Thought[]
  isThinking: boolean
}

interface ActivityItemProps {
  thought: Thought
  isComplete: boolean
  isError: boolean
}

// Get human-friendly activity text for a tool call
function getActivityText(thought: Thought, t: (key: string, params?: Record<string, unknown>) => string): string {
  const input = thought.toolInput

  switch (thought.toolName) {
    case 'Read':
      return t('Reading {{file}}...', { file: extractFileName(input?.file_path) })
    case 'Write':
      return t('Writing {{file}}...', { file: extractFileName(input?.file_path) })
    case 'Edit':
      return t('Editing {{file}}...', { file: extractFileName(input?.file_path) })
    case 'Grep':
      return t('Searching {{pattern}}...', { pattern: truncate(String(input?.pattern || ''), 20) })
    case 'Glob':
      return t('Matching {{pattern}}...', { pattern: truncate(String(input?.pattern || ''), 20) })
    case 'Bash':
      return t('Running {{command}}...', { command: extractCommand(input?.command) })
    case 'WebFetch':
      return t('Fetching {{url}}...', { url: extractDomain(input?.url) })
    case 'WebSearch':
      return t('Searching {{query}}...', { query: truncate(String(input?.query || ''), 20) })
    case 'TodoWrite':
      return t('Updating tasks...')
    case 'Task':
      return t('Running {{task}}...', { task: truncate(String(input?.description || 'agent'), 25) })
    case 'NotebookEdit':
      return t('Editing notebook...')
    case 'AskUserQuestion':
      return t('Waiting for response...')
    case 'Skill':
      return t('Running {{skill}}...', { skill: String(input?.skill || 'skill') })
    default:
      return thought.toolName ? `${thought.toolName}...` : t('Processing...')
  }
}

// Get completed activity text (past tense)
function getCompletedText(thought: Thought, t: (key: string, params?: Record<string, unknown>) => string): string {
  const input = thought.toolInput

  switch (thought.toolName) {
    case 'Read':
      return t('Read {{file}}', { file: extractFileName(input?.file_path) })
    case 'Write':
      return t('Wrote {{file}}', { file: extractFileName(input?.file_path) })
    case 'Edit':
      return t('Edited {{file}}', { file: extractFileName(input?.file_path) })
    case 'Grep':
      return t('Searched {{pattern}}', { pattern: truncate(String(input?.pattern || ''), 20) })
    case 'Glob':
      return t('Matched {{pattern}}', { pattern: truncate(String(input?.pattern || ''), 20) })
    case 'Bash':
      return t('Ran {{command}}', { command: extractCommand(input?.command) })
    case 'WebFetch':
      return t('Fetched {{url}}', { url: extractDomain(input?.url) })
    case 'WebSearch':
      return t('Searched {{query}}', { query: truncate(String(input?.query || ''), 20) })
    case 'TodoWrite':
      return t('Updated tasks')
    case 'Task':
      return t('Completed {{task}}', { task: truncate(String(input?.description || 'agent'), 25) })
    case 'NotebookEdit':
      return t('Edited notebook')
    case 'AskUserQuestion':
      return t('Got response')
    case 'Skill':
      return t('Ran {{skill}}', { skill: String(input?.skill || 'skill') })
    default:
      return thought.toolName ? `${thought.toolName}` : t('Done')
  }
}

// Extract filename from path
function extractFileName(path: unknown): string {
  if (typeof path !== 'string' || !path) return 'file'
  const name = path.split('/').pop() || path.split('\\').pop() || path
  return truncate(name, 25)
}

// Extract command summary
function extractCommand(cmd: unknown): string {
  if (typeof cmd !== 'string' || !cmd) return 'command'
  const firstPart = cmd.split(' ').slice(0, 2).join(' ')
  return truncate(firstPart, 20)
}

// Extract domain from URL
function extractDomain(url: unknown): string {
  if (typeof url !== 'string' || !url) return 'page'
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    return truncate(domain, 20)
  } catch {
    return truncate(url, 20)
  }
}

// Truncate text with ellipsis
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 1) + '…'
}

// Status icon component
function StatusIcon({ isRunning, isError, isWaiting }: {
  isRunning: boolean
  isError: boolean
  isWaiting: boolean
}) {
  if (isWaiting) {
    return <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
  }
  if (isError) {
    return <XCircle size={14} className="text-destructive flex-shrink-0" />
  }
  if (isRunning) {
    return <Loader2 size={14} className="text-primary animate-spin flex-shrink-0" />
  }
  return <Check size={14} className="text-muted-foreground flex-shrink-0" />
}

// Single activity item - CLI-style single line
const ActivityItem = memo(function ActivityItem({ thought, isComplete, isError }: ActivityItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { t } = useTranslation()

  const ToolIcon = thought.toolName ? getToolIcon(thought.toolName) : null
  const isWaiting = thought.toolName === 'AskUserQuestion' && !isComplete
  const isRunning = !isComplete && !isError

  const activityText = isComplete
    ? getCompletedText(thought, t)
    : getActivityText(thought, t)

  const hasDetails = thought.toolInput && Object.keys(thought.toolInput).length > 0

  return (
    <div className="group">
      {/* Main line - always visible */}
      <div
        className={`
          flex items-center gap-2 py-1 text-sm
          ${hasDetails ? 'cursor-pointer hover:bg-muted/30 rounded -mx-1 px-1' : ''}
          ${isError ? 'text-destructive' : isRunning ? 'text-foreground' : 'text-muted-foreground'}
        `}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        {/* Status icon */}
        <StatusIcon isRunning={isRunning} isError={isError} isWaiting={isWaiting} />

        {/* Tool icon (optional, for visual variety) */}
        {ToolIcon && (
          <ToolIcon size={14} className="text-muted-foreground/60 flex-shrink-0" />
        )}

        {/* Activity text */}
        <span className="truncate">{activityText}</span>

        {/* Duration (if complete) */}
        {isComplete && thought.duration && (
          <span className="text-xs text-muted-foreground/50 flex-shrink-0">
            ({(thought.duration / 1000).toFixed(1)}s)
          </span>
        )}

        {/* Expand indicator (if has details) */}
        {hasDetails && (
          <ChevronRight
            size={12}
            className={`
              text-muted-foreground/40 flex-shrink-0 transition-transform ml-auto
              ${isExpanded ? 'rotate-90' : ''}
              opacity-0 group-hover:opacity-100
            `}
          />
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && thought.toolInput && (
        <div className="ml-6 mt-1 mb-2 p-2 bg-muted/20 rounded text-xs text-muted-foreground overflow-x-auto">
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(thought.toolInput, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
})

export function InlineActivity({ thoughts, isThinking }: InlineActivityProps) {
  // Filter and process thoughts for display
  const activityItems = useMemo(() => {
    // Get all tool_use thoughts (excluding child tools and TodoWrite which is shown separately)
    const toolUseThoughts = thoughts.filter(t =>
      t.type === 'tool_use' &&
      !t.parentToolId &&
      t.toolName !== 'TodoWrite'  // TodoCard is rendered separately
    )

    // For each tool_use, determine if it's complete by checking for corresponding tool_result
    return toolUseThoughts.map(toolUse => {
      // Find the corresponding tool_result
      const toolResult = thoughts.find(t =>
        t.type === 'tool_result' &&
        t.id.includes(toolUse.id.replace('tool_use_', ''))
      )

      return {
        thought: toolUse,
        isComplete: !!toolResult,
        isError: toolResult?.isError || false
      }
    })
  }, [thoughts])

  // Don't render if no activity
  if (activityItems.length === 0 && !isThinking) {
    return null
  }

  return (
    <div className="space-y-0.5">
      {activityItems.map(item => (
        <ActivityItem
          key={item.thought.id}
          thought={item.thought}
          isComplete={item.isComplete}
          isError={item.isError}
        />
      ))}
    </div>
  )
}
