import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DollarSign, Hash, RefreshCw } from 'lucide-react'
import { api } from '../../api'
import { StatCard } from './StatCard'
import { UsageTable } from './UsageTable'
import {
  getHistorySummaryColumnCount,
  USAGE_STAT_CARD_WIDTH,
  useUsageCardColumns,
} from './usage-card-layout'
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

function getTodayDateRange(): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10)
  return { from: today, to: today }
}

export function HistoryStats({ isActive }: HistoryStatsProps) {
  const { t } = useTranslation()
  const [todayData, setTodayData] = useState<UsageHistoryResponse | null>(null)
  const [tableData, setTableData] = useState<UsageHistoryResponse | null>(null)
  const [isTodayLoading, setIsTodayLoading] = useState(false)
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [datePreset, setDatePreset] = useState<DateRangePreset>('7d')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const summaryContainerRef = useRef<HTMLDivElement | null>(null)
  const summaryColumnCount = useUsageCardColumns(summaryContainerRef, getHistorySummaryColumnCount, 2)

  const fetchTodayData = useCallback(async (forceRefresh = false) => {
    setIsTodayLoading(true)
    try {
      const query: UsageHistoryQuery = {
        granularity: 'day',
        dateRange: getTodayDateRange(),
        forceRefresh
      }
      const res = await api.getUsageHistory(query)
      if (res.success && res.data) {
        setTodayData(res.data as UsageHistoryResponse)
      }
    } finally {
      setIsTodayLoading(false)
    }
  }, [])

  const fetchTableData = useCallback(async (forceRefresh = false) => {
    setIsTableLoading(true)
    try {
      const query: UsageHistoryQuery = {
        granularity,
        dateRange: getDateRange(datePreset),
        forceRefresh
      }
      const res = await api.getUsageHistory(query)
      if (res.success && res.data) {
        setTableData(res.data as UsageHistoryResponse)
      }
    } finally {
      setIsTableLoading(false)
    }
  }, [granularity, datePreset])

  useEffect(() => {
    if (isActive) {
      void fetchTodayData()
    }
  }, [isActive, fetchTodayData])

  useEffect(() => {
    if (isActive) {
      void fetchTableData()
    }
  }, [isActive, fetchTableData])

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

  const hasTableData = (tableData?.periods.length ?? 0) > 0
  const todaySummary = todayData?.summary

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      fetchTodayData(true),
      fetchTableData(true),
    ])
  }, [fetchTableData, fetchTodayData])

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-medium text-foreground">{t("Today's Summary")}</h3>
      </div>

      <div
        ref={summaryContainerRef}
        className="grid justify-start gap-3"
        style={{ gridTemplateColumns: `repeat(${summaryColumnCount}, ${USAGE_STAT_CARD_WIDTH}px)` }}
      >
        <StatCard
          icon={DollarSign}
          label={t("Today's Total Cost")}
          value={todaySummary
            ? formatCost(todaySummary.totalCostUsd)
            : isTodayLoading
              ? '-'
              : formatCost(0)
          }
        />
        <StatCard
          icon={Hash}
          label={t("Today's Total Tokens")}
          value={todaySummary
            ? formatTokenCount(
                todaySummary.totalInputTokens +
                todaySummary.totalOutputTokens +
                todaySummary.totalCacheReadTokens +
                todaySummary.totalCacheCreationTokens
              )
            : isTodayLoading
              ? '-'
              : formatTokenCount(0)
          }
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h4 className="text-sm font-medium text-foreground">{t('History')}</h4>
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
            onClick={() => void handleRefresh()}
            disabled={isTodayLoading || isTableLoading}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={t('Refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(isTodayLoading || isTableLoading) ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isTableLoading && !tableData ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t('Loading usage data...')}
        </div>
      ) : !hasTableData ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Hash className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-sm">{t('No usage data found')}</p>
          <p className="text-xs mt-1">{t('Start a conversation to see usage stats')}</p>
        </div>
      ) : (
        <UsageTable periods={tableData!.periods} />
      )}
    </div>
  )
}
