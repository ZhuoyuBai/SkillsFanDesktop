/**
 * ToolItem - Inline single-line tool activity display
 * Extracted from LinearStream for reuse in TodoCard step grouping
 */

import { memo } from 'react'
import { Loader2, Check, XCircle } from 'lucide-react'
import { getToolIcon } from '../icons/ToolIcons'
import { useTranslation } from '../../i18n'

// ============================================
// Utility Functions
// ============================================

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 1) + '…'
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

// Get human-friendly activity text for a tool call
export function getActivityText(
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
    case 'mcp__local-tools__bash_code_execution':
      return getText(
        t('Running {{command}}...', { command: extractCommand(input.command) }),
        t('Ran {{command}}', { command: extractCommand(input.command) })
      )
    case 'mcp__local-tools__code_execution':
      return getText(
        t('Running {{command}}...', { command: truncate(String(input.language || 'code'), 20) }),
        t('Ran {{command}}', { command: truncate(String(input.language || 'code'), 20) })
      )
    case 'WebFetch':
    case 'mcp__web-tools__WebFetch':
      return getText(
        t('Fetching {{url}}...', { url: extractDomain(input.url) }),
        t('Fetched {{url}}', { url: extractDomain(input.url) })
      )
    case 'WebSearch':
    case 'mcp__web-tools__WebSearch':
      return getText(
        t('Searching {{query}}...', { query: truncate(String(input.query || ''), 20) }),
        t('Searched {{query}}', { query: truncate(String(input.query || ''), 20) })
      )
    case 'mcp__local-tools__memory':
      return getText(
        t('Searching {{query}}...', { query: truncate(String(input.query || input.path || 'memory'), 20) }),
        t('Searched {{query}}', { query: truncate(String(input.query || input.path || 'memory'), 20) })
      )
    case 'mcp__local-tools__text_editor_code_execution':
      return getText(
        t('Editing {{file}}...', { file: extractFileName(input.path) }),
        t('Edited {{file}}', { file: extractFileName(input.path) })
      )
    case 'mcp__local-tools__tool_search_tool_regex':
    case 'mcp__local-tools__tool_search_tool_bm25':
      return getText(
        t('Searching {{pattern}}...', { pattern: truncate(String(input.pattern || input.query || ''), 20) }),
        t('Searched {{pattern}}', { pattern: truncate(String(input.pattern || input.query || ''), 20) })
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

// ============================================
// Component
// ============================================

// Tool call - single line with status
export const ToolItem = memo(function ToolItem({
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
