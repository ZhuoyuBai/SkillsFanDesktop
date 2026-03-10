/**
 * Subagent utility functions - status mapping, formatting helpers
 */

import type { SubagentRunEntry } from '../../stores/chat.store'

export type SubagentStatus = SubagentRunEntry['status']

interface StatusConfig {
  borderColor: string
  textColor: string
  bgColor: string
  label: string
  symbol: string
  animate?: string
}

const STATUS_MAP: Record<SubagentStatus, StatusConfig> = {
  queued: {
    borderColor: 'border-muted-foreground/60 dark:border-muted-foreground/40',
    textColor: 'text-muted-foreground',
    bgColor: 'bg-muted-foreground/15 dark:bg-muted-foreground/10',
    label: 'Queued',
    symbol: '⏳',
  },
  running: {
    borderColor: 'border-blue-600 dark:border-blue-400',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-600/10 dark:bg-blue-400/10',
    label: 'Running',
    symbol: '⟳',
    animate: 'animate-pulse',
  },
  waiting_announce: {
    borderColor: 'border-blue-600 dark:border-blue-400',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-600/10 dark:bg-blue-400/10',
    label: 'Finishing',
    symbol: '⟳',
  },
  completed: {
    borderColor: 'border-green-600 dark:border-green-400',
    textColor: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-600/10 dark:bg-green-400/10',
    label: 'Done',
    symbol: '✓',
  },
  failed: {
    borderColor: 'border-red-600 dark:border-red-400',
    textColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-600/10 dark:bg-red-400/10',
    label: 'Failed',
    symbol: '✗',
  },
  killed: {
    borderColor: 'border-orange-600 dark:border-orange-400',
    textColor: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-600/10 dark:bg-orange-400/10',
    label: 'Stopped',
    symbol: '⊘',
  },
  timeout: {
    borderColor: 'border-yellow-600 dark:border-yellow-400',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-600/10 dark:bg-yellow-400/10',
    label: 'Timeout',
    symbol: '⏱',
  },
}

export function getStatusConfig(status: SubagentStatus): StatusConfig {
  return STATUS_MAP[status] || STATUS_MAP.failed
}

export function isTerminalStatus(status: SubagentStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed' || status === 'timeout'
}

export function isErrorStatus(status: SubagentStatus): boolean {
  return status === 'failed' || status === 'killed' || status === 'timeout'
}

export function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

export function formatCost(usd?: number): string {
  if (usd == null) return ''
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

export function formatTime(iso?: string): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '-'
  }
}
