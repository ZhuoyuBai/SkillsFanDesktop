/**
 * CreditsDisplay - Shows SkillsFan credit balance
 *
 * Only visible when current AI source is 'skillsfan-credits'.
 * Auto-refreshes after agent completes a conversation turn.
 */

import { useState, useEffect, useCallback } from 'react'
import { Coins, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import { useTranslation } from '../../i18n'

export function CreditsDisplay() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const currentSource = config?.aiSources?.current

  const fetchCredits = useCallback(async () => {
    if (currentSource !== 'skillsfan-credits') return
    setLoading(true)
    try {
      const res = await api.skillsfanGetCredits()
      if (res.success && res.data !== undefined) {
        setCredits(res.data as number)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [currentSource])

  const handleRefresh = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await api.skillsfanRefreshCredits()
      if (res.success && res.data !== undefined) {
        setCredits(res.data as number)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [loading])

  // Fetch credits on mount and when source changes
  useEffect(() => {
    fetchCredits()
  }, [fetchCredits])

  // Auto-refresh after agent completes
  useEffect(() => {
    if (currentSource !== 'skillsfan-credits') return

    const cleanup = api.onAgentComplete(() => {
      // Delay slightly to allow backend to process credit deduction
      setTimeout(() => {
        handleRefresh()
      }, 1500)
    })

    return cleanup
  }, [currentSource, handleRefresh])

  // Don't render if not using skillsfan-credits
  if (currentSource !== 'skillsfan-credits') return null

  const formatCredits = (value: number): string => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}w`
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toFixed(0)
  }

  return (
    <div className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs text-muted-foreground border border-border/60">
      <Coins className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      <span className="tabular-nums">
        {credits !== null ? formatCredits(credits) : '--'}
      </span>
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="p-0.5 hover:text-foreground transition-colors disabled:opacity-50"
        title={t('Refresh credits')}
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
