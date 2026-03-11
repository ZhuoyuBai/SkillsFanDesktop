/**
 * HostedSubagentDetailSheet - Slide-out detail panel for hosted subagent runs
 *
 * Design (user-friendly):
 * - Right-side slide-out panel with backdrop blur overlay
 * - Header: task label + status badge
 * - Primary sections: Task, Result (if completed), Execution Progress
 * - Technical Details: collapsible, hidden by default (model, tokens, IDs)
 * - ESC to close, click backdrop to close
 * - Action buttons: Copy Result, Stop (if running)
 */

import { useEffect, useCallback, useState } from 'react'
import { X, Copy, Check, Square, ChevronRight } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { formatDuration } from '../../lib/utils'
import {
  getStatusConfig,
  isErrorStatus,
  formatTokenCount,
  formatCost,
  formatTime,
} from './subagent-utils'
import type { SubagentRunEntry } from '../../stores/chat.store'

interface HostedSubagentDetailSheetProps {
  isOpen: boolean
  run: SubagentRunEntry | null
  onClose: () => void
  onKill: (runId: string) => void
}

export function HostedSubagentDetailSheet({
  isOpen,
  run,
  onClose,
  onKill,
}: HostedSubagentDetailSheetProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [isTechExpanded, setIsTechExpanded] = useState(false)

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  const handleCopy = useCallback(() => {
    if (!run) return
    const text = run.resultSummary || run.error || run.task
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [run])

  const handleKill = useCallback(() => {
    if (!run) return
    onKill(run.runId)
  }, [run, onKill])

  if (!isOpen || !run) return null

  const config = getStatusConfig(run.status)
  const isRunning = run.status === 'running' || run.status === 'queued' || run.status === 'waiting_announce'
  const isError = isErrorStatus(run.status)
  const hasDuration = run.durationMs != null && run.durationMs > 0
  const hasTokens = run.tokenUsage && (run.tokenUsage.inputTokens > 0 || run.tokenUsage.outputTokens > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-background border-l border-border overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
        style={{ animationDuration: '200ms' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={config.textColor}>{config.symbol}</span>
            <h2 className="text-sm font-semibold text-foreground truncate">
              {run.label || t('Task')}
            </h2>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.bgColor} ${config.textColor}`}>
              {t(config.label)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted/20 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Task */}
          <Section title={t('Task Description')}>
            <div className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap bg-muted/10 border border-border/50 rounded-md p-3 max-h-40 overflow-y-auto">
              {run.task}
            </div>
          </Section>

          {/* Result or Error - shown above progress when available */}
          {(run.resultSummary || run.error) && (
            <Section title={isError ? t('Error Details') : t('Result')}>
              <div className={`text-[13px] leading-relaxed whitespace-pre-wrap rounded-md p-3 max-h-48 overflow-y-auto ${
                isError
                  ? 'bg-red-600/5 border border-red-600/20 text-red-600/80 dark:bg-red-400/5 dark:border-red-400/20 dark:text-red-400/80'
                  : 'bg-muted/10 border border-border/50 text-foreground/80'
              }`}>
                {run.resultSummary || run.error}
              </div>
            </Section>
          )}

          {/* Latest activity (running) */}
          {isRunning && run.latestSummary && (
            <Section title={t('Latest Activity')}>
              <div className="text-[13px] text-blue-600/80 dark:text-blue-400/70 leading-relaxed">
                {run.latestSummary}
              </div>
            </Section>
          )}

          {/* Execution Progress (timeline) */}
          <Section title={t('Execution Progress')}>
            <div className="relative pl-5 space-y-3">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />

              <TimelineItem
                label={t('Created')}
                time={formatTime(run.spawnedAt)}
                active={true}
              />
              <TimelineItem
                label={t('Started')}
                time={formatTime(run.startedAt)}
                active={!!run.startedAt}
                current={isRunning && !!run.startedAt}
              />
              <TimelineItem
                label={isError ? t('Failed') : t('Completed')}
                time={formatTime(run.endedAt)}
                active={!!run.endedAt}
              />
              {run.announcedAt && (
                <TimelineItem
                  label={t('Reported')}
                  time={formatTime(run.announcedAt)}
                  active={true}
                />
              )}
            </div>
          </Section>

          {/* Technical Details - collapsible */}
          {(run.model || hasDuration || hasTokens) && (
            <div>
              <button
                onClick={() => setIsTechExpanded(!isTechExpanded)}
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground/70 transition-colors"
              >
                <ChevronRight
                  size={12}
                  className={`transition-transform ${isTechExpanded ? 'rotate-90' : ''}`}
                />
                {t('Technical Details')}
              </button>

              {isTechExpanded && (
                <div className="space-y-3 animate-fade-in">
                  {/* Token Usage */}
                  {hasTokens && (
                    <div className="grid grid-cols-3 gap-2">
                      <TokenStat
                        label={t('Input')}
                        value={formatTokenCount(run.tokenUsage!.inputTokens)}
                      />
                      <TokenStat
                        label={t('Output')}
                        value={formatTokenCount(run.tokenUsage!.outputTokens)}
                      />
                      <TokenStat
                        label={t('Cost')}
                        value={formatCost(run.tokenUsage!.totalCostUsd) || '-'}
                      />
                    </div>
                  )}

                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {run.model && (
                      <MetaItem label={t('Model')} value={run.model} />
                    )}
                    {hasDuration && (
                      <MetaItem label={t('Duration')} value={formatDuration(run.durationMs!)} />
                    )}
                    {run.modelSource && (
                      <MetaItem label={t('Provider')} value={run.modelSource} />
                    )}
                    {run.thinkingEffort && (
                      <MetaItem label={t('Thinking Depth')} value={run.thinkingEffort} />
                    )}
                    <MetaItem label={t('Task ID')} value={run.runId.slice(0, 8)} mono />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="sticky bottom-0 bg-background border-t border-border px-5 py-3 flex gap-2">
          {(run.resultSummary || run.error) && (
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border border-border
                text-sm text-muted-foreground hover:bg-muted/20 transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t('Copied') : t('Copy Result')}
            </button>
          )}
          {isRunning && run.status !== 'queued' && (
            <button
              onClick={handleKill}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border border-red-600/30 dark:border-red-400/30
                text-sm text-red-600 hover:bg-red-600/10 dark:text-red-400 dark:hover:bg-red-400/10 transition-colors"
            >
              <Square size={14} />
              {t('Stop Task')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Sub-components

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}

function TimelineItem({
  label,
  time,
  active,
  current,
}: {
  label: string
  time: string
  active: boolean
  current?: boolean
}) {
  return (
    <div className="relative flex items-center gap-2 text-[12px]">
      <div className={`absolute -left-5 w-[11px] h-[11px] rounded-full border-2 ${
        current
          ? 'border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400 animate-pulse'
          : active
          ? 'border-green-600 bg-green-600 dark:border-green-400 dark:bg-green-400'
          : 'border-border bg-background'
      }`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/70">{time}</span>
    </div>
  )
}

function TokenStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-2 bg-muted/10 rounded-md">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-[12px] text-foreground/80 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
