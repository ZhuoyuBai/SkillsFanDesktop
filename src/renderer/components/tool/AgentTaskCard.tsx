/**
 * AgentTaskCard - Visual representation of Task (sub-agent) execution
 *
 * Distinct from TodoCard (task planning) and ToolItem (generic tool call).
 * Each sub-agent gets a unique color from a rotating palette for easy identification.
 *
 * Design:
 * - Compact card with colored border accent
 * - Agent icon with animated indicator when running
 * - Description text + optional subagent type badge
 * - Duration display when completed
 * - Colors optimized for dark mode readability
 */

import { memo } from 'react'
import {
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { useTranslation } from '../../i18n'

// Color palette for distinguishing parallel sub-agents
// Uses 400-level shades for good dark-mode visibility
const AGENT_COLORS = [
  // Teal
  {
    border: 'border-teal-400/40',
    bg: 'bg-teal-400/[0.08]',
    text: 'text-teal-600 dark:text-teal-300',
    badge: 'bg-teal-400/15 text-teal-600/70 dark:text-teal-300/70',
    icon: 'text-teal-500 dark:text-teal-400',
    ping: 'bg-teal-400',
    spinner: 'text-teal-500 dark:text-teal-400',
  },
  // Violet
  {
    border: 'border-violet-400/40',
    bg: 'bg-violet-400/[0.08]',
    text: 'text-violet-600 dark:text-violet-300',
    badge: 'bg-violet-400/15 text-violet-600/70 dark:text-violet-300/70',
    icon: 'text-violet-500 dark:text-violet-400',
    ping: 'bg-violet-400',
    spinner: 'text-violet-500 dark:text-violet-400',
  },
  // Amber
  {
    border: 'border-amber-400/40',
    bg: 'bg-amber-400/[0.08]',
    text: 'text-amber-600 dark:text-amber-300',
    badge: 'bg-amber-400/15 text-amber-600/70 dark:text-amber-300/70',
    icon: 'text-amber-500 dark:text-amber-400',
    ping: 'bg-amber-400',
    spinner: 'text-amber-500 dark:text-amber-400',
  },
  // Emerald
  {
    border: 'border-emerald-400/40',
    bg: 'bg-emerald-400/[0.08]',
    text: 'text-emerald-600 dark:text-emerald-300',
    badge: 'bg-emerald-400/15 text-emerald-600/70 dark:text-emerald-300/70',
    icon: 'text-emerald-500 dark:text-emerald-400',
    ping: 'bg-emerald-400',
    spinner: 'text-emerald-500 dark:text-emerald-400',
  },
  // Rose
  {
    border: 'border-rose-400/40',
    bg: 'bg-rose-400/[0.08]',
    text: 'text-rose-600 dark:text-rose-300',
    badge: 'bg-rose-400/15 text-rose-600/70 dark:text-rose-300/70',
    icon: 'text-rose-500 dark:text-rose-400',
    ping: 'bg-rose-400',
    spinner: 'text-rose-500 dark:text-rose-400',
  },
  // Sky
  {
    border: 'border-sky-400/40',
    bg: 'bg-sky-400/[0.08]',
    text: 'text-sky-600 dark:text-sky-300',
    badge: 'bg-sky-400/15 text-sky-600/70 dark:text-sky-300/70',
    icon: 'text-sky-500 dark:text-sky-400',
    ping: 'bg-sky-400',
    spinner: 'text-sky-500 dark:text-sky-400',
  },
]

interface AgentTaskCardProps {
  description: string
  subagentType?: string
  isRunning: boolean
  isComplete: boolean
  isError: boolean
  duration?: number
  /** Index for color cycling (0-based) */
  colorIndex?: number
}

export const AgentTaskCard = memo(function AgentTaskCard({
  description,
  subagentType,
  isRunning,
  isComplete,
  isError,
  duration,
  colorIndex = 0,
}: AgentTaskCardProps) {
  const { t } = useTranslation()
  const colors = AGENT_COLORS[colorIndex % AGENT_COLORS.length]

  return (
    <div className={`my-1 rounded-lg border ${colors.border} ${colors.bg} overflow-hidden`}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* Status icon */}
        <div className="relative flex-shrink-0">
          {isError ? (
            <XCircle size={16} className="text-destructive" />
          ) : isRunning ? (
            <div className="relative">
              <Zap size={16} className={`${colors.icon} animate-pulse`} />
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 ${colors.ping} rounded-full animate-ping`} />
            </div>
          ) : (
            <CheckCircle2 size={16} className={colors.icon} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium ${colors.text}`}>
              {isRunning ? t('Agent running') : isError ? t('Agent failed') : t('Agent completed')}
            </span>
            {subagentType && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                {subagentType}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {description}
          </p>
        </div>

        {/* Duration / spinner */}
        <div className="flex-shrink-0">
          {isRunning ? (
            <Loader2 size={14} className={`${colors.spinner} animate-spin`} />
          ) : duration ? (
            <span className="text-[10px] text-muted-foreground/60">
              {(duration / 1000).toFixed(1)}s
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
})
