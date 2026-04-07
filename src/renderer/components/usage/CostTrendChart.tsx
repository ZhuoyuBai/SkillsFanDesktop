import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useTranslation } from 'react-i18next'
import { getChartColors, formatCost } from '../../utils/chart-colors'
import type { UsagePeriod } from '../../../shared/types/usage'
import { ChartContainer } from './ChartContainer'

interface CostTrendChartProps {
  periods: UsagePeriod[]
}

export function CostTrendChart({ periods }: CostTrendChartProps) {
  const { t } = useTranslation()
  const colors = useMemo(() => getChartColors(), [])

  const data = useMemo(() => {
    return periods.map(p => ({
      period: p.period.length > 7 ? p.period.slice(5) : p.period, // MM-DD or YYYY-MM
      cost: Math.round(p.costUsd * 10000) / 10000,
      fullPeriod: p.period
    }))
  }, [periods])

  if (data.length === 0) return null

  return (
    <div className="w-full min-w-0">
      <h4 className="text-sm font-medium text-foreground mb-3">{t('Cost Trend')}</h4>
      <ChartContainer className="h-[200px] min-h-[200px]">
        {({ width, height }) => (
          <AreaChart width={width} height={height} data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={(v) => formatCost(v)}
              width={55}
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
              formatter={(value: number) => [formatCost(value), t('Cost')]}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload
                return item?.fullPeriod || label
              }}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke={colors.primary}
              fill="url(#costGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        )}
      </ChartContainer>
    </div>
  )
}
