import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { UsageRealtimeData } from '../../../shared/types/usage'
import {
  type PetActivityState,
  PET_THRESHOLDS,
  HYSTERESIS_COUNT,
  LIVE_OUTPUT_HOLD_MS,
  POLL_INTERVAL_MS,
} from './petConstants'

type UsageRealtimeApiResponse = {
  success: boolean
  data?: UsageRealtimeData
}

type PetSpeedSample = {
  tokensPerMinute: number
  nonCacheTokensPerMinute?: number
}

function getIndicatorTokensPerMinute(sample: PetSpeedSample): number {
  return sample.nonCacheTokensPerMinute ?? sample.tokensPerMinute
}

export function determineRawState(
  speedSamples: PetSpeedSample[]
): PetActivityState {
  if (!speedSamples.length) return 'sleeping'

  const recent = speedSamples.slice(-3)
  const weights = [0.2, 0.3, 0.5].slice(3 - recent.length)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  const weightedAvg = recent.reduce(
    (sum, sample, i) => sum + getIndicatorTokensPerMinute(sample) * (weights[i] / totalWeight),
    0
  )

  if (weightedAvg < PET_THRESHOLDS.sleeping) return 'sleeping'
  if (weightedAvg <= PET_THRESHOLDS.busy) return 'normal'
  if (weightedAvg <= PET_THRESHOLDS.overwhelmed) return 'busy'
  return 'overwhelmed'
}

export function unwrapUsageRealtimeData(
  response: UsageRealtimeApiResponse | UsageRealtimeData | null | undefined
): UsageRealtimeData | null {
  if (!response) return null

  if ('success' in response) {
    return response.success && response.data ? response.data : null
  }

  return response
}

export function mergeLiveOutputState(
  rawState: PetActivityState,
  hasLiveOutput: boolean
): PetActivityState {
  if (!hasLiveOutput || rawState !== 'sleeping') {
    return rawState
  }

  return 'normal'
}

export interface PetUsageStats {
  tokensPerMinute: number
  costPerMinute: number
}

export interface PetStateResult {
  activityState: PetActivityState
  usageStats: PetUsageStats | null
}

export function usePetState(): PetStateResult {
  const [activityState, setActivityState] = useState<PetActivityState>('sleeping')
  const [usageStats, setUsageStats] = useState<PetUsageStats | null>(null)
  const [hasLiveOutput, setHasLiveOutput] = useState(false)
  const pendingState = useRef<PetActivityState>('sleeping')
  const pendingCount = useRef(0)
  const lastSessionStartedAt = useRef<string | null>(null)
  const lastTotalTokens = useRef<number | null>(null)
  const liveOutputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true

    const clearLiveOutputTimeout = () => {
      if (liveOutputTimeoutRef.current !== null) {
        clearTimeout(liveOutputTimeoutRef.current)
        liveOutputTimeoutRef.current = null
      }
    }

    const poll = async () => {
      try {
        const response = await api.getUsageRealtime()
        if (!mounted) return

        const data = unwrapUsageRealtimeData(response)
        if (!data) return

        const lastSample = data.speedSamples.length
          ? data.speedSamples[data.speedSamples.length - 1]
          : null
        setUsageStats(
          lastSample
            ? { tokensPerMinute: lastSample.tokensPerMinute, costPerMinute: lastSample.costPerMinute }
            : null
        )

        const rawState = determineRawState(data.speedSamples)
        const sessionStartedAt = data.currentSession.startedAt
        const totalTokens = data.currentSession.totalTokens

        if (lastSessionStartedAt.current !== sessionStartedAt) {
          lastSessionStartedAt.current = sessionStartedAt
          lastTotalTokens.current = totalTokens
          setHasLiveOutput(false)
          clearLiveOutputTimeout()
        } else if (
          lastTotalTokens.current !== null &&
          totalTokens > lastTotalTokens.current
        ) {
          setHasLiveOutput(true)
          clearLiveOutputTimeout()
          liveOutputTimeoutRef.current = setTimeout(() => {
            setHasLiveOutput(false)
            liveOutputTimeoutRef.current = null
          }, LIVE_OUTPUT_HOLD_MS)
        }

        lastTotalTokens.current = totalTokens

        if (rawState === pendingState.current) {
          pendingCount.current++
        } else {
          pendingState.current = rawState
          pendingCount.current = 1
        }

        if (pendingCount.current >= HYSTERESIS_COUNT) {
          setActivityState(rawState)
        }
      } catch {
        // Silently ignore polling errors
      }
    }

    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      mounted = false
      clearLiveOutputTimeout()
      clearInterval(timer)
    }
  }, [])

  return {
    activityState: mergeLiveOutputState(activityState, hasLiveOutput),
    usageStats,
  }
}
