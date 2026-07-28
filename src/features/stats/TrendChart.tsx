import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import type { TrendPoint } from '@/domain/stats'

interface TrendChartProps {
  data: TrendPoint[]
}

function fmt(v: number): string {
  if (Math.abs(v) < 0.05) return 'E'
  const rounded = Math.round(v * 10) / 10
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

/**
 * Score-trend line chart (last 10 rounds), plotting 18-hole-equivalent
 * score-to-par. Par is the zero reference line; lower is better.
 */
export function TrendChart({ data }: TrendChartProps) {
  const values = data.map((d) => d.vsPar18)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const pad = Math.max(1, Math.round((max - min) * 0.15))

  const summary = `Score trend over the last ${data.length} rounds, in strokes versus par per 18 holes.`

  return (
    <div role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickFormatter={fmt}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
          <Tooltip
            formatter={(value: number) => [fmt(value), 'vs par (per 18)']}
            labelStyle={{ color: '#334155', fontWeight: 600 }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
          <Line
            type="monotone"
            dataKey="vsPar18"
            stroke="#15803d"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#15803d' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
