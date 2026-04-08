import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, DollarSign, Hash, Clock } from 'lucide-react'
import { api } from '../../api'
import { StatCard } from './StatCard'
import { SpeedChart } from './SpeedChart'
import { formatTokenCount, formatCost } from '../../utils/chart-colors'
import type { UsageRealtimeData } from '../../../shared/types/usage'

interface RealtimeMonitorProps {
  isActive: boolean // whether the Usage tab is currently visible
}

const FIVE_HOURS_IN_MINUTES = 5 * 60

export function projectFiveHourTokens(tokensPerMinute?: number | null): number | null {
  if (tokensPerMinute == null) return null
  return tokensPerMinute * FIVE_HOURS_IN_MINUTES
}

export function projectFiveHourCost(costPerMinute?: number | null): number | null {
  if (costPerMinute == null) return null
  return costPerMinute * FIVE_HOURS_IN_MINUTES
}

export function RealtimeMonitor({ isActive }: RealtimeMonitorProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<UsageRealtimeData | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.getUsageRealtime()
      if (res.success && res.data) {
        setData(res.data as UsageRealtimeData)
      }
    } catch {
      // Silently ignore fetch errors until the panel is reopened
    }
  }, [])

  useEffect(() => {
    if (!isActive) return
    fetchData()
  }, [isActive, fetchData])

  const currentSpeed = data?.speedSamples?.length
    ? data.speedSamples[data.speedSamples.length - 1]
    : null
  const hasActiveSession = data?.currentSession.startedAt != null
  const projectedFiveHourTokens = hasActiveSession
    ? projectFiveHourTokens(currentSpeed?.tokensPerMinute)
    : null
  const projectedFiveHourCost = hasActiveSession
    ? projectFiveHourCost(currentSpeed?.costPerMinute)
    : null

  return (
    <div className="w-full min-w-0 space-y-4">
      <h3 className="text-sm font-medium text-foreground">{t('Realtime Usage')}</h3>

      <div className="flex flex-wrap gap-3">
        <StatCard
          className="w-full flex-none sm:w-[240px] lg:w-[260px]"
          icon={Activity}
          label={t('Current Speed')}
          value={currentSpeed ? `${formatTokenCount(currentSpeed.tokensPerMinute)} tok/min` : '0 tok/min'}
        />
        <StatCard
          className="w-full flex-none sm:w-[240px] lg:w-[260px]"
          icon={DollarSign}
          label={t('Current Cost')}
          value={currentSpeed ? `${formatCost(currentSpeed.costPerMinute)}/min` : `${formatCost(0)}/min`}
        />
        <StatCard
          className="w-full flex-none sm:w-[240px] lg:w-[260px]"
          icon={Hash}
          label={t('Projected 5h Usage')}
          value={projectedFiveHourTokens != null
            ? formatTokenCount(projectedFiveHourTokens)
            : formatTokenCount(0)
          }
        />
        <StatCard
          className="w-full flex-none sm:w-[240px] lg:w-[260px]"
          icon={Clock}
          label={t('Projected 5h Cost')}
          value={projectedFiveHourCost != null ? formatCost(projectedFiveHourCost) : formatCost(0)}
        />
      </div>

      <div className="min-w-0">
        <div className="text-xs text-muted-foreground mb-2">
          {t('Token Speed (last 5 min)')}
        </div>
        <SpeedChart samples={data?.speedSamples || []} />
      </div>
    </div>
  )
}
