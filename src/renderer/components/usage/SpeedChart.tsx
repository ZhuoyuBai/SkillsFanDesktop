import { useId, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { useTranslation } from 'react-i18next'
import { useChartColors, formatTokenCount } from '../../utils/chart-colors'

interface SpeedSample {
  timestamp: number
  tokensPerMinute: number
  costPerMinute: number
}

interface SpeedChartProps {
  samples: SpeedSample[]
}

const FIXED_CHART_WIDTH = 720
const CHART_HEIGHT = 120

export function SpeedChart({ samples }: SpeedChartProps) {
  const { t } = useTranslation()
  const gradientId = useId()
  const colors = useChartColors()
  const [snapshotMinuteStart] = useState(() => Math.floor(Date.now() / 60_000) * 60_000)

  const data = useMemo(() => {
    if (samples.length === 0) {
      // Freeze the empty-state timeline at panel entry instead of animating it forward.
      return Array.from({ length: 5 }, (_, i) => ({
        time: new Date(snapshotMinuteStart - (4 - i) * 60_000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }),
        tokensPerMin: 0,
      }))
    }
    return samples.map(s => ({
      time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tokensPerMin: s.tokensPerMinute,
    }))
  }, [samples, snapshotMinuteStart])

  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-fit">
        <AreaChart
          width={FIXED_CHART_WIDTH}
          height={CHART_HEIGHT}
          data={data}
          margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
        >
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
      </div>
    </div>
  )
}
