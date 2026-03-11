/**
 * ToolItem - Inline tool activity display with expandable output
 * Shows single-line status, click to expand tool output (Bash stdout, Edit diff, etc.)
 * Extracted from LinearStream for reuse in TodoCard step grouping
 */

import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, Maximize2 } from 'lucide-react'
import { InlineDiff } from './InlineDiff'
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
    case 'mcp__local-tools__subagent_spawn':
      return getText(
        t('Running {{task}}...', { task: truncate(String(input.task || input.label || 'hosted agent'), 25) }),
        t('Completed {{task}}', { task: truncate(String(input.task || input.label || 'hosted agent'), 25) })
      )
    case 'mcp__local-tools__subagents':
      return getText(
        t('Checking subagents...'),
        t('Checked subagents')
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

// Determine if a tool should auto-expand its output when complete
function shouldAutoExpand(toolName: string, toolOutput?: string, isError?: boolean): boolean {
  if (isError) return true
  if (!toolOutput) return false

  switch (toolName) {
    case 'Bash':
    case 'mcp__local-tools__bash_code_execution': {
      // Auto-expand short Bash output (< 10 lines)
      const lineCount = toolOutput.split('\n').length
      return lineCount <= 10 && toolOutput.length > 0
    }
    case 'Edit':
      // Always auto-expand Edit diffs
      return true
    case 'Write':
    case 'Read':
    case 'Glob':
    case 'Grep':
      // Don't auto-expand these (output can be long)
      return false
    default:
      return false
  }
}

// Check if tool has expandable content
function hasExpandableContent(toolName: string, toolOutput?: string, toolInput?: Record<string, unknown>): boolean {
  // Edit tool always has expandable diff (from toolInput)
  if (toolName === 'Edit' && toolInput?.old_string && toolInput?.new_string) return true
  // Other tools need toolOutput
  return !!toolOutput && toolOutput.trim().length > 0
}

// Count lines in output for display
function countLines(text: string): number {
  return text.split('\n').length
}

// Tool call - single line with expandable output
export const ToolItem = memo(function ToolItem({
  toolName,
  toolInput,
  isComplete,
  isError,
  duration,
  toolOutput,
  onOpenDiffModal,
}: {
  toolName: string
  toolInput?: Record<string, unknown>
  isComplete: boolean
  isError: boolean
  duration?: number
  toolOutput?: string
  onOpenDiffModal?: () => void
}) {
  const { t } = useTranslation()
  const isRunning = !isComplete && !isError
  const outputRef = useRef<HTMLDivElement>(null)

  const expandable = hasExpandableContent(toolName, toolOutput, toolInput)
  const autoExpand = shouldAutoExpand(toolName, toolOutput, isError)
  const [isExpanded, setIsExpanded] = useState(false)

  // Auto-expand when tool completes (only once)
  const hasAutoExpanded = useRef(false)
  useEffect(() => {
    if (isComplete && autoExpand && !hasAutoExpanded.current) {
      hasAutoExpanded.current = true
      setIsExpanded(true)
    }
  }, [isComplete, autoExpand])

  // Auto-scroll output to bottom when content updates
  useEffect(() => {
    if (isExpanded && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [isExpanded, toolOutput])

  const handleClick = useCallback(() => {
    if (expandable) {
      setIsExpanded(prev => !prev)
    }
  }, [expandable])

  const activityText = getActivityText(toolName, toolInput, isComplete, t)

  // Determine what to render in the expanded area
  const isEditTool = toolName === 'Edit'
  const isBashTool = toolName === 'Bash' || toolName === 'mcp__local-tools__bash_code_execution'
  const isWriteTool = toolName === 'Write'

  return (
    <div className="py-0.5">
      {/* Header line - CLI style with text status symbols */}
      <div
        onClick={handleClick}
        className={`flex items-center gap-1.5 text-[13px] ${
          expandable ? 'cursor-pointer hover:text-muted-foreground transition-colors' : ''
        } ${
          isError ? 'text-destructive/70' : isRunning ? 'text-muted-foreground/80' : 'text-muted-foreground'
        }`}
      >
        {/* Expand chevron (only when expandable) */}
        {expandable ? (
          <ChevronRight
            size={12}
            className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        ) : (
          <span className="w-2.5 flex-shrink-0" />
        )}

        {/* CLI status symbol */}
        <span className={`flex-shrink-0 ${
          isError ? 'text-destructive/70' : isRunning ? 'text-orange-400' : 'text-green-500'
        }`}>
          {isError ? '✗' : isRunning ? '⟳' : '✓'}
        </span>

        {/* Activity text */}
        <span className="truncate">{activityText}</span>

        {/* Duration */}
        {isComplete && duration && (
          <span className="text-muted-foreground/60 flex-shrink-0">
            {(duration / 1000).toFixed(1)}s
          </span>
        )}

        {/* Line count hint for collapsed Bash/Write */}
        {isComplete && !isExpanded && toolOutput && (isBashTool || isWriteTool) && (
          <span className="text-muted-foreground/30 flex-shrink-0 text-[10px]">
            {countLines(toolOutput)} lines
          </span>
        )}
      </div>

      {/* Expanded output area - CLI style with border-left */}
      {isExpanded && (
        <div className="ml-5 mt-1 animate-slide-down">
          {/* Edit tool: show inline diff */}
          {isEditTool && toolInput?.old_string && toolInput?.new_string && (
            <div className="relative group/diff">
              <InlineDiff
                oldString={String(toolInput.old_string)}
                newString={String(toolInput.new_string)}
              />
              {onOpenDiffModal && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenDiffModal() }}
                  className="absolute top-1 right-1 p-1 rounded bg-muted/50 opacity-0 group-hover/diff:opacity-100 transition-opacity"
                  title={t('View full diff')}
                >
                  <Maximize2 size={10} className="text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {/* Bash / other tools: output with border-left */}
          {!isEditTool && toolOutput && (
            <div
              ref={outputRef}
              className={`border-l-2 pl-3 py-1 text-[11px] font-mono leading-[1.4] overflow-y-auto max-h-48 whitespace-pre-wrap break-all ${
                isError ? 'border-destructive/40 text-destructive/80' : 'border-muted-foreground/20 text-muted-foreground/60'
              }`}
            >
              {toolOutput}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
