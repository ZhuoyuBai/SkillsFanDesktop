/**
 * AgentTaskCard - CLI-style sub-agent task display with expandable step history
 *
 * Design:
 * - Left colored border-l for agent identification
 * - Expandable step history showing each tool call with operation details
 * - Consecutive same-tool calls merged with ×N count
 * - CLI-style status symbols (✓/⟳/✗)
 * - Completed agents show expandable result output
 */

import { memo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useTypewriter } from '../../hooks/useTypewriter'
import type { TaskStepEntry } from '../../stores/chat.store'

// Color palette for distinguishing parallel sub-agents (CLI style: border + text only)
const AGENT_COLORS = [
  { border: 'border-teal-400', text: 'text-teal-400', dim: 'text-teal-400/60' },
  { border: 'border-violet-400', text: 'text-violet-400', dim: 'text-violet-400/60' },
  { border: 'border-amber-400', text: 'text-amber-400', dim: 'text-amber-400/60' },
  { border: 'border-emerald-400', text: 'text-emerald-400', dim: 'text-emerald-400/60' },
  { border: 'border-rose-400', text: 'text-rose-400', dim: 'text-rose-400/60' },
  { border: 'border-sky-400', text: 'text-sky-400', dim: 'text-sky-400/60' },
]

// Merge consecutive same-tool entries for compact display
function mergeSteps(steps: TaskStepEntry[]): Array<TaskStepEntry & { count: number }> {
  const merged: Array<TaskStepEntry & { count: number }> = []
  for (const step of steps) {
    const last = merged[merged.length - 1]
    if (last && last.toolName === step.toolName) {
      last.count++
      last.summary = step.summary // keep latest summary
    } else {
      merged.push({ ...step, count: 1 })
    }
  }
  return merged
}

interface AgentTaskCardProps {
  description: string
  subagentType?: string
  isRunning: boolean
  isComplete: boolean
  isError: boolean
  duration?: number
  colorIndex?: number
  summary?: string
  lastToolName?: string
  toolUses?: number
  stepHistory?: TaskStepEntry[]
  resultSummary?: string
}

export const AgentTaskCard = memo(function AgentTaskCard({
  description,
  subagentType,
  isRunning,
  isComplete,
  isError,
  duration,
  colorIndex = 0,
  summary,
  lastToolName,
  toolUses,
  stepHistory = [],
  resultSummary,
}: AgentTaskCardProps) {
  const { t } = useTranslation()
  const colors = AGENT_COLORS[colorIndex % AGENT_COLORS.length]
  const [isExpanded, setIsExpanded] = useState(isRunning)

  const hasSteps = stepHistory.length > 0
  const hasContent = hasSteps || (!isRunning && isComplete && resultSummary)
  const mergedSteps = hasSteps ? mergeSteps(stepHistory) : []

  // Typewriter for result summary (arrives all at once when agent completes)
  const showResult = !isRunning && isComplete && !!resultSummary && isExpanded
  const { displayText: resultDisplayText, isAnimating: resultAnimating } = useTypewriter(
    resultSummary || '',
    { enabled: showResult, charsPerFrame: 8 }
  )

  return (
    <div
      className={`my-1 border-l-2 ${colors.border} pl-3 cursor-pointer hover:bg-muted/5 transition-colors`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 py-0.5 text-[13px]">
        {/* Expand chevron */}
        {hasContent && (
          <ChevronRight
            size={10}
            className={`flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        )}

        {/* Status symbol */}
        <span className={`flex-shrink-0 ${
          isError ? 'text-destructive/70' : isRunning ? colors.text : 'text-green-500'
        }`}>
          {isError ? '✗' : isRunning ? '⟳' : '✓'}
        </span>

        {/* Status label */}
        <span className={`font-medium ${colors.text}`}>
          {isRunning ? t('Agent running') : isError ? t('Agent failed') : t('Agent completed')}
        </span>

        {/* Subagent type badge */}
        {subagentType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
            {subagentType}
          </span>
        )}

        {/* Tool count */}
        {toolUses != null && toolUses > 0 && (
          <span className="text-[10px] text-muted-foreground/60">
            {toolUses} {t('tools')}
          </span>
        )}

        {/* Duration */}
        {!isRunning && duration ? (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">
            {(duration / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>

      {/* Description */}
      <p className="text-[13px] text-muted-foreground truncate">
        {description}
      </p>

      {/* Real-time progress — no truncation */}
      {isRunning && summary && (
        <p className={`text-[13px] ${colors.dim}`}>
          {summary}
        </p>
      )}

      {/* Expanded step history with tool details */}
      {isExpanded && hasSteps && (
        <div className="py-1 space-y-0.5">
          {mergedSteps.map((step, idx) => {
            const isLast = idx === mergedSteps.length - 1
            const isActive = isLast && isRunning
            return (
              <div key={idx} className="flex items-center gap-1.5 text-[13px] text-muted-foreground min-w-0">
                <span className={`flex-shrink-0 ${
                  isActive ? `${colors.text} animate-pulse` : 'text-green-500'
                }`}>
                  {isActive ? '●' : '✓'}
                </span>
                <span className="text-indigo-400 flex-shrink-0">{step.toolName}</span>
                {step.count > 1 && (
                  <span className="text-[10px] text-muted-foreground/50 bg-muted/30 px-1 rounded flex-shrink-0">
                    ×{step.count}
                  </span>
                )}
                {step.summary && (
                  <span className="text-muted-foreground/60 text-[12px] truncate">
                    — {step.summary}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Result output — shown when completed and expanded, with typewriter */}
      {showResult && (
        <div className="mt-1 mb-1 p-2 bg-muted/10 border border-border/50 rounded text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto">
          {resultDisplayText}
          {resultAnimating && (
            <span className="inline-block w-0.5 h-3 bg-muted-foreground/50 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}
    </div>
  )
})
