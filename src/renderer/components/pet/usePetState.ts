import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { UsageRealtimeData } from '../../../shared/types/usage'
import {
  type PetActivityState,
  PET_THRESHOLDS,
  HYSTERESIS_COUNT,
  POLL_INTERVAL_MS,
} from './petConstants'

type UsageRealtimeApiResponse = {
  success: boolean
  data?: UsageRealtimeData
}

export function determineRawState(
  speedSamples: Array<{ tokensPerMinute: number }>
): PetActivityState {
  if (!speedSamples.length) return 'sleeping'

  const recent = speedSamples.slice(-3)
  const weights = [0.2, 0.3, 0.5].slice(3 - recent.length)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  const weightedAvg = recent.reduce(
    (sum, s, i) => sum + s.tokensPerMinute * (weights[i] / totalWeight),
    0
  )

  if (weightedAvg < PET_THRESHOLDS.normal) return 'sleeping'
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

export function usePetState(): PetActivityState {
  const [activityState, setActivityState] = useState<PetActivityState>('sleeping')
  const pendingState = useRef<PetActivityState>('sleeping')
  const pendingCount = useRef(0)

  useEffect(() => {
    let mounted = true

    const poll = async () => {
      try {
        const response = await api.getUsageRealtime()
        if (!mounted) return

        const data = unwrapUsageRealtimeData(response)
        if (!data) return

        const rawState = determineRawState(data.speedSamples)

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
      clearInterval(timer)
    }
  }, [])

  return activityState
}
