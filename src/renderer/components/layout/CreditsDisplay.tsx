/**
 * CreditsDisplay - Shows SkillsFan credit balance
 *
 * Always visible. Shows "--" when not using skillsfan-credits source.
 * Auto-refreshes after agent completes a conversation turn.
 * Shows cached credits from disk immediately on startup, then refreshes in background.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Gem } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import type { SkillsFanAuthState } from '../../../shared/types/skillsfan'

export function CreditsDisplay() {
  const config = useAppStore((s) => s.config)
  const hostedAiEnabled = useAppStore((s) => s.productFeatures.skillsfanHostedAiEnabled)
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const initialized = useRef(false)

  const currentSource = config?.aiSources?.current
  // All providers that consume SkillsFan credits via proxy
  const isCreditsProvider = hostedAiEnabled && new Set(['skillsfan-credits', 'glm', 'minimax-oauth']).has(currentSource || '')

  // On first mount, load cached credits from auth state for instant display
  useEffect(() => {
    if (!isCreditsProvider || initialized.current) return
    initialized.current = true

    api.skillsfanGetAuthState().then((res) => {
      if (res.success && res.data) {
        const state = res.data as SkillsFanAuthState
        setIsLoggedIn(state.isLoggedIn)
        if (state.lastKnownCredits !== undefined) {
          setCredits(state.lastKnownCredits)
        }
      }
    }).catch(() => {
      // Silently fail
    })
  }, [currentSource])

  const fetchCredits = useCallback(async () => {
    if (!isCreditsProvider) return
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
    if (!isCreditsProvider) return

    const cleanup = api.onAgentComplete(() => {
      // Delay slightly to allow backend to process credit deduction
      setTimeout(() => {
        handleRefresh()
      }, 1500)
    })

    return cleanup
  }, [currentSource, handleRefresh])

  const formatCredits = (value: number): string => {
    return Math.round(value).toString()
  }

  if (!isLoggedIn) return null

  return (
    <div className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs text-muted-foreground cursor-default">
      <Gem className="w-3.5 h-3.5 flex-shrink-0 text-primary/80" />
      <span className="tabular-nums">
        {credits !== null ? formatCredits(credits) : '--'}
      </span>
    </div>
  )
}
