import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, MessageSquare, Clock } from 'lucide-react'
import { api } from '../../api'
import { StatCard } from './StatCard'
import { SpeedChart } from './SpeedChart'
import { formatTokenCount, formatCost } from '../../utils/chart-colors'
import type { UsageRealtimeData } from '../../../shared/types/usage'

interface RealtimeMonitorProps {
  isActive: boolean // whether the Usage tab is currently visible
}

export function RealtimeMonitor({ isActive }: RealtimeMonitorProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<UsageRealtimeData | null>(null)

  const fetchData = useCallback(async () => {
    const res = await api.getUsageRealtime()
    if (res.success && res.data) {
      setData(res.data as UsageRealtimeData)
    }
  }, [])

  useEffect(() => {
    if (!isActive) return
    fetchData()
    const timer = setInterval(fetchData, 5000)
    return () => clearInterval(timer)
  }, [isActive, fetchData])

  const currentSpeed = data?.speedSamples?.length
    ? data.speedSamples[data.speedSamples.length - 1]
    : null

  return (
    <div className="w-full min-w-0 space-y-4">
      <h3 className="text-sm font-medium text-foreground">{t('Realtime Usage')}</h3>

      <div className="flex flex-wrap gap-3">
        <StatCard
          className="w-full flex-none sm:w-[240px] lg:w-[260px]"
          icon={Activity}
          label={t('Current Speed')}
          value={currentSpeed ? `${formatTokenCount(currentSpeed.tokensPerMinute)} tok/min` : '-'}
          subValue={currentSpeed ? `${formatCost(currentSpeed.costPerMinute)}/min` : undefined}
        />
        <StatCard
          className="w-full flex-none sm:w-[240px] lg:w-[260px]"
          icon={MessageSquare}
          label={t('Current Session')}
          value={data?.currentSession.startedAt
            ? formatTokenCount(data.currentSession.totalTokens)
            : '-'
          }
          subValue={data?.currentSession.startedAt
            ? formatCost(data.currentSession.costUsd)
            : t('No active session')
          }
        />
        <StatCard
          className="w-full flex-none sm:w-[240px] lg:w-[260px]"
          icon={Clock}
          label={t('Today')}
          value={data ? formatCost(data.today.costUsd) : '-'}
          subValue={data ? `${formatTokenCount(data.today.totalTokens)} tokens` : undefined}
        />
      </div>

      <div className="w-full min-w-0">
        <div className="text-xs text-muted-foreground mb-2">
          {t('Token Speed (last 5 min)')}
        </div>
        <SpeedChart samples={data?.speedSamples || []} />
      </div>
    </div>
  )
}
