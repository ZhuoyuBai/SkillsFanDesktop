import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useTranslation } from 'react-i18next'
import { getChartColors, formatTokenCount } from '../../utils/chart-colors'
import type { UsagePeriod } from '../../../shared/types/usage'
import { ChartContainer } from './ChartContainer'

interface TokenStackedBarProps {
  periods: UsagePeriod[]
}

export function TokenStackedBar({ periods }: TokenStackedBarProps) {
  const { t } = useTranslation()
  const colors = useMemo(() => getChartColors(), [])

  const data = useMemo(() => {
    return periods.map(p => ({
      period: p.period.length > 7 ? p.period.slice(5) : p.period,
      tokens: p.inputTokens + p.outputTokens,
      fullPeriod: p.period
    }))
  }, [periods])

  // Check if all token values are 0 (e.g., GLM provider)
  const hasTokenData = periods.some(p =>
    p.inputTokens > 0 || p.outputTokens > 0
  )

  if (data.length === 0 || !hasTokenData) return null

  return (
    <div className="w-full min-w-0">
      <h4 className="text-sm font-medium text-foreground mb-3">{t('Daily Token Usage')}</h4>
      <ChartContainer className="h-[220px] min-h-[220px]">
        {({ width, height }) => (
          <BarChart width={width} height={height} data={data} maxBarSize={32} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.5} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: colors.mutedForeground }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: colors.mutedForeground }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatTokenCount(v)}
              width={50}
            />
            <Tooltip
              cursor={false}
              wrapperStyle={{ outline: 'none', boxShadow: 'none' }}
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                color: colors.tooltipFg,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                boxShadow: 'none',
              }}
              itemStyle={{ color: colors.tooltipFg }}
              labelStyle={{ color: colors.tooltipFg }}
              formatter={(value: number) => [formatTokenCount(value), t('Tokens')]}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload
                return item?.fullPeriod || label
              }}
            />
            <Bar dataKey="tokens" name={t('Tokens')} fill={colors.palette[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ChartContainer>
    </div>
  )
}
