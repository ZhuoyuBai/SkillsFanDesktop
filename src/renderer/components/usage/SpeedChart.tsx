import { useId, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { useTranslation } from 'react-i18next'
import { useChartColors, formatTokenCount } from '../../utils/chart-colors'
import { ChartContainer } from './ChartContainer'

interface SpeedSample {
  timestamp: number
  tokensPerMinute: number
  costPerMinute: number
}

interface SpeedChartProps {
  samples: SpeedSample[]
}

export function SpeedChart({ samples }: SpeedChartProps) {
  const { t } = useTranslation()
  const gradientId = useId()
  const colors = useChartColors()

  const data = useMemo(() => {
    if (samples.length === 0) {
      // Generate a flat zero line spanning the last 5 completed minutes
      const currentMinuteStart = Math.floor(Date.now() / 60_000) * 60_000
      return Array.from({ length: 5 }, (_, i) => ({
        time: new Date(currentMinuteStart - (5 - i) * 60_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tokensPerMin: 0,
      }))
    }
    return samples.map(s => ({
      time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tokensPerMin: s.tokensPerMinute,
    }))
  }, [samples])

  return (
    <ChartContainer className="h-[120px] min-h-[120px]">
      {({ width, height }) => (
        <AreaChart width={width} height={height} data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: colors.mutedForeground }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: colors.mutedForeground }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatTokenCount(v)}
            width={45}
          />
          <Tooltip
            cursor={false}
            wrapperStyle={{ outline: 'none', boxShadow: 'none' }}
            contentStyle={{
              backgroundColor: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              boxShadow: 'none'
            }}
            formatter={(value: number) => [`${formatTokenCount(value)} tok/min`, t('Speed')]}
          />
          <Area
            type="monotone"
            dataKey="tokensPerMin"
            stroke={colors.primary}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            connectNulls
          />
        </AreaChart>
      )}
    </ChartContainer>
  )
}
