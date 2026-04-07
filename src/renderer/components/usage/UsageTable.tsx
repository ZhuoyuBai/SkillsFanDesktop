import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTokenCount, formatCost } from '../../utils/chart-colors'
import type { UsagePeriod } from '../../../shared/types/usage'

interface UsageTableProps {
  periods: UsagePeriod[]
}

export function UsageTable({ periods }: UsageTableProps) {
  const { t } = useTranslation()

  const totals = useMemo(() => {
    return periods.reduce(
      (acc, p) => ({
        inputTokens: acc.inputTokens + p.inputTokens,
        outputTokens: acc.outputTokens + p.outputTokens,
        cacheReadTokens: acc.cacheReadTokens + p.cacheReadTokens,
        cacheCreationTokens: acc.cacheCreationTokens + p.cacheCreationTokens,
        costUsd: acc.costUsd + p.costUsd,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 }
    )
  }, [periods])

  // Show periods in reverse chronological order
  const sortedPeriods = useMemo(() => [...periods].reverse(), [periods])

  if (periods.length === 0) return null

  // Format date as two-line: YYYY\nMM-DD (ccusage style)
  const formatDate = (period: string) => {
    if (period.length === 10) {
      // YYYY-MM-DD
      return { year: period.slice(0, 4), rest: period.slice(5) }
    }
    if (period.length === 7) {
      // YYYY-MM
      return { year: period.slice(0, 4), rest: period.slice(5) }
    }
    return { year: '', rest: period }
  }

  const tokenCell = (n: number) => {
    if (n === 0) return <span className="text-muted-foreground">-</span>
    return formatTokenCount(n)
  }

  return (
    <div className="w-full">
      <h4 className="text-sm font-medium text-foreground mb-3">{t('Usage Details')}</h4>
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-accent/30">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('Date')}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('Models')}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t('Input')}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t('Output')}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t('Cache Create')}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t('Cache Read')}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t('Total Tokens')}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t('Cost (USD)')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedPeriods.map((p) => {
              const { year, rest } = formatDate(p.period)
              return (
                <tr key={p.period} className="border-b border-border/30 hover:bg-accent/20">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-xs text-muted-foreground">{year}</div>
                    <div className="font-medium">{rest}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      {p.modelsUsed.map(m => (
                        <div key={m} className="text-xs text-muted-foreground">
                          • {m}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">{tokenCell(p.inputTokens)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">{tokenCell(p.outputTokens)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">{tokenCell(p.cacheCreationTokens)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">{tokenCell(p.cacheReadTokens)}</td>
                  <td className="text-right px-3 py-2 tabular-nums font-medium">{tokenCell(p.inputTokens + p.outputTokens + p.cacheCreationTokens + p.cacheReadTokens)}</td>
                  <td className="text-right px-3 py-2 tabular-nums font-medium">{formatCost(p.costUsd)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-accent/40 font-semibold">
              <td className="px-3 py-2">{t('Total')}</td>
              <td className="px-3 py-2"></td>
              <td className="text-right px-3 py-2 tabular-nums">{tokenCell(totals.inputTokens)}</td>
              <td className="text-right px-3 py-2 tabular-nums">{tokenCell(totals.outputTokens)}</td>
              <td className="text-right px-3 py-2 tabular-nums">{tokenCell(totals.cacheCreationTokens)}</td>
              <td className="text-right px-3 py-2 tabular-nums">{tokenCell(totals.cacheReadTokens)}</td>
              <td className="text-right px-3 py-2 tabular-nums">{tokenCell(totals.inputTokens + totals.outputTokens + totals.cacheCreationTokens + totals.cacheReadTokens)}</td>
              <td className="text-right px-3 py-2 tabular-nums">{formatCost(totals.costUsd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
