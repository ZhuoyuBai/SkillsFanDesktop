import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DollarSign, Hash, MessageSquare, RefreshCw } from 'lucide-react'
import { api } from '../../api'
import { StatCard } from './StatCard'
import { UsageTable } from './UsageTable'
import { formatTokenCount, formatCost } from '../../utils/chart-colors'
import type { UsageHistoryResponse, UsageHistoryQuery } from '../../../shared/types/usage'

type DateRangePreset = '7d' | '30d' | '90d' | 'all'
type Granularity = 'day' | 'week' | 'month'

interface HistoryStatsProps {
  isActive: boolean
}

function getDateRange(preset: DateRangePreset): { from: string; to: string } | undefined {
  if (preset === 'all') return undefined
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { from, to }
}

export function HistoryStats({ isActive }: HistoryStatsProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<UsageHistoryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [datePreset, setDatePreset] = useState<DateRangePreset>('7d')
  const [granularity, setGranularity] = useState<Granularity>('day')

  const fetchData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    try {
      const query: UsageHistoryQuery = {
        granularity,
        dateRange: getDateRange(datePreset),
        forceRefresh
      }
      const res = await api.getUsageHistory(query)
      if (res.success && res.data) {
        setData(res.data as UsageHistoryResponse)
      }
    } finally {
      setIsLoading(false)
    }
  }, [granularity, datePreset])

  useEffect(() => {
    if (isActive) {
      fetchData()
    }
  }, [isActive, fetchData])

  const presetOptions: { value: DateRangePreset; label: string }[] = useMemo(() => [
    { value: '7d', label: t('Last 7 days') },
    { value: '30d', label: t('Last 30 days') },
    { value: '90d', label: t('Last 90 days') },
    { value: 'all', label: t('All time') },
  ], [t])

  const granularityOptions: { value: Granularity; label: string }[] = useMemo(() => [
    { value: 'day', label: t('Day') },
    { value: 'week', label: t('Week') },
    { value: 'month', label: t('Month') },
  ], [t])

  const hasData = data && data.summary.totalMessages > 0

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-medium text-foreground">{t('History')}</h3>
        <div className="flex items-center gap-2">
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
            className="text-xs px-2 py-1.5 rounded-md border border-border/50 bg-background text-foreground"
          >
            {presetOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className="text-xs px-2 py-1.5 rounded-md border border-border/50 bg-background text-foreground"
          >
            {granularityOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => fetchData(true)}
            disabled={isLoading}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={t('Refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t('Loading usage data...')}
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Hash className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-sm">{t('No usage data found')}</p>
          <p className="text-xs mt-1">{t('Start a conversation to see usage stats')}</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="flex flex-wrap gap-3">
            <StatCard
              icon={DollarSign}
              label={t('Total Cost')}
              value={formatCost(data!.summary.totalCostUsd)}
            />
            <StatCard
              icon={Hash}
              label={t('Total Tokens')}
              value={formatTokenCount(
                data!.summary.totalInputTokens +
                data!.summary.totalOutputTokens +
                data!.summary.totalCacheReadTokens +
                data!.summary.totalCacheCreationTokens
              )}
            />
            <StatCard
              icon={MessageSquare}
              label={t('Messages')}
              value={data!.summary.totalMessages.toLocaleString()}
            />
          </div>

          {/* Detailed Table */}
          <UsageTable periods={data!.periods} />
        </>
      )}
    </div>
  )
}
