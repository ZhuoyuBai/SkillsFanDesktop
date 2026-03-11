/**
 * HostedSubagentCard - First-class card for hosted subagent runs
 *
 * Design:
 * - Status-colored left border (green=completed, blue=running, red=failed, etc.)
 * - Header: status icon + label + model badge + duration
 * - Body: progress summary or result preview (expandable)
 * - Footer: token usage stats
 * - Actions: Stop (running), Copy Result (completed), View Details (all)
 */

import { memo, useState, useCallback } from 'react'
import { ChevronRight, Square, Copy, ExternalLink, Check } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useTypewriter } from '../../hooks/useTypewriter'
import { formatDuration } from '../../lib/utils'
import {
  getStatusConfig,
  isTerminalStatus,
  isErrorStatus,
  formatTokenCount,
  formatCost,
} from './subagent-utils'
import type { SubagentRunEntry } from '../../stores/chat.store'

interface HostedSubagentCardProps {
  run: SubagentRunEntry
  colorIndex: number
  onViewDetails: (runId: string) => void
  onKill: (runId: string) => void
}

export const HostedSubagentCard = memo(function HostedSubagentCard({
  run,
  colorIndex,
  onViewDetails,
  onKill,
}: HostedSubagentCardProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(!isTerminalStatus(run.status))
  const [copied, setCopied] = useState(false)

  const config = getStatusConfig(run.status)
  const isRunning = run.status === 'running' || run.status === 'queued' || run.status === 'waiting_announce'
  const isComplete = run.status === 'completed'
  const isError = isErrorStatus(run.status)
  const hasResult = !!(run.resultSummary || run.error)

  // Typewriter for result when first shown
  const showResult = isTerminalStatus(run.status) && isExpanded && hasResult
  const resultText = run.resultSummary || run.error || ''
  const { displayText: resultDisplayText, isAnimating } = useTypewriter(
    resultText,
    { enabled: showResult, charsPerFrame: 8 }
  )

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const text = run.resultSummary || run.error || ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [run.resultSummary, run.error])

  const handleKill = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onKill(run.runId)
  }, [onKill, run.runId])

  const handleViewDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onViewDetails(run.runId)
  }, [onViewDetails, run.runId])

  return (
    <div
      className={`my-1.5 border-l-2 ${config.borderColor} pl-3 cursor-pointer
        hover:bg-muted/5 transition-colors rounded-r ${config.animate || ''}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 py-0.5 text-[13px]">
        {/* Expand chevron */}
        {hasResult && (
          <ChevronRight
            size={12}
            className={`flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        )}

        {/* Status symbol */}
        <span className={`flex-shrink-0 ${config.textColor}`}>
          {config.symbol}
        </span>

        {/* Label */}
        <span className={`font-medium ${config.textColor} truncate`}>
          {run.label || t('Task')}
        </span>

        {/* Model badge */}
        {run.model && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-600/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400 flex-shrink-0">
            {run.model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}
          </span>
        )}

        {/* Duration */}
        {run.durationMs != null && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
            {formatDuration(run.durationMs)}
          </span>
        )}
        {isRunning && run.startedAt && !run.durationMs && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
            {t('Running')}...
          </span>
        )}
      </div>

      {/* Task description */}
      <p className="text-[13px] text-muted-foreground truncate">
        {run.task}
      </p>

      {/* Real-time progress */}
      {isRunning && run.latestSummary && (
        <p className="text-[12px] text-blue-600/70 dark:text-blue-400/60 mt-0.5">
          {run.latestSummary}
        </p>
      )}

      {/* Queued state */}
      {run.status === 'queued' && (
        <p className="text-[12px] text-muted-foreground/50 mt-0.5">
          {t('Queued')}
        </p>
      )}

      {/* Result preview (expanded) */}
      {showResult && (
        <div className={`mt-1 mb-1 p-2 border rounded text-[12px] leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto ${
          isError
            ? 'bg-red-600/5 border-red-600/20 text-red-600/80 dark:bg-red-400/5 dark:border-red-400/20 dark:text-red-400/80'
            : 'bg-muted/10 border-border/50 text-muted-foreground'
        }`}>
          {resultDisplayText}
          {isAnimating && (
            <span className="inline-block w-0.5 h-3 bg-muted-foreground/50 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}

      {/* Token usage - only show when there's actual data */}
      {run.tokenUsage && (run.tokenUsage.inputTokens > 0 || run.tokenUsage.outputTokens > 0) && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50 mt-0.5">
          <span>↓ {formatTokenCount(run.tokenUsage.inputTokens)}</span>
          <span>↑ {formatTokenCount(run.tokenUsage.outputTokens)}</span>
          {run.tokenUsage.totalCostUsd != null && run.tokenUsage.totalCostUsd > 0 && (
            <span>{formatCost(run.tokenUsage.totalCostUsd)}</span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 mt-1 mb-0.5">
        {/* Stop button (running) */}
        {isRunning && run.status !== 'queued' && (
          <button
            onClick={handleKill}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded
              border border-red-600/30 text-red-600 hover:bg-red-600/10 dark:border-red-400/30 dark:text-red-400 dark:hover:bg-red-400/10 transition-colors"
          >
            <Square size={8} />
            {t('Stop')}
          </button>
        )}

        {/* Copy result (completed) */}
        {isComplete && run.resultSummary && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded
              border border-border text-muted-foreground hover:bg-muted/20 transition-colors"
          >
            {copied ? <Check size={8} /> : <Copy size={8} />}
            {copied ? t('Copied') : t('Copy')}
          </button>
        )}

        {/* View details (all states) */}
        <button
          onClick={handleViewDetails}
          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded
            border border-border text-muted-foreground hover:bg-muted/20 transition-colors"
        >
          <ExternalLink size={8} />
          {t('Details')}
        </button>
      </div>
    </div>
  )
})
