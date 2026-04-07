import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { useTranslation } from 'react-i18next'
import { getChartColors, formatCost } from '../../utils/chart-colors'
import { getModelLogo } from '../layout/ModelSelector'
import type { UsageByModel } from '../../../shared/types/usage'
import { ChartContainer } from './ChartContainer'

interface ModelBarChartProps {
  byModel: UsageByModel[]
}

// Unique clip path ID counter
let clipIdCounter = 0

// Custom YAxis tick that renders model logo (rounded) + name
function ModelTick({ x, y, payload, colors }: any) {
  const modelName = payload.value as string
  const logo = getModelLogo(modelName, modelName)
  const clipId = useMemo(() => `model-logo-clip-${++clipIdCounter}`, [])
  return (
    <g transform={`translate(${x},${y})`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={-148} y={-8} width={16} height={16} rx={4} />
        </clipPath>
      </defs>
      {logo ? (
        <image
          href={logo}
          x={-148}
          y={-8}
          width={16}
          height={16}
          clipPath={`url(#${clipId})`}
        />
      ) : (
        <rect x={-148} y={-8} width={16} height={16} rx={4} fill={colors.muted} />
      )}
      <text
        x={-128}
        y={4}
        textAnchor="start"
        fontSize={11}
        fill={colors.mutedForeground}
      >
        {modelName.length > 16 ? modelName.slice(0, 16) + '…' : modelName}
      </text>
    </g>
  )
}

export function ModelBarChart({ byModel }: ModelBarChartProps) {
  const { t } = useTranslation()
  const colors = useMemo(() => getChartColors(), [])

  const data = useMemo(() => {
    return byModel.slice(0, 8).map(m => ({
      model: m.model.length > 20 ? m.model.slice(0, 20) + '…' : m.model,
      cost: Math.round(m.costUsd * 10000) / 10000,
      fullModel: m.model
    }))
  }, [byModel])

  if (data.length === 0) return null

  return (
    <div className="w-full min-w-0">
      <h4 className="text-sm font-medium text-foreground mb-3">{t('Model Cost Distribution')}</h4>
      <ChartContainer className="h-[200px] min-h-[200px]">
        {({ width, height }) => (
          <BarChart
            width={width}
            height={height}
            data={data}
            layout="vertical"
            barSize={20}
            margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: colors.mutedForeground }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCost(v)}
            />
            <YAxis
              type="category"
              dataKey="model"
              tick={(props: any) => <ModelTick {...props} colors={colors} />}
              axisLine={false}
              tickLine={false}
              width={150}
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
              labelFormatter={(_, payload) => {
                const item = payload?.[0]?.payload
                return item?.fullModel || ''
              }}
            />
            <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell key={index} fill={colors.palette[index % colors.palette.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ChartContainer>
    </div>
  )
}
