import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatWholeNumber } from '../model/format'
import type { StochasticPercentileRow } from '../model/stochasticReturns'

type StochasticCapitalChartProps = {
  rows: StochasticPercentileRow[]
  retirementAge: number
}

type ChartTooltipPayload = {
  dataKey?: string | number
  value?: number | string
  payload?: StochasticPercentileRow
}

type ChartTooltipProps = {
  active?: boolean
  label?: number | string
  payload?: ChartTooltipPayload[]
}

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const row = payload[0]?.payload
  const ageEnd = Number(label)
  const ageStart = row?.ageStart ?? ageEnd - 1
  const values = new Map(payload.map((item) => [item.dataKey, Number(item.value)]))

  return (
    <div className="chart-tooltip">
      <strong>
        Alter {ageStart}-{ageEnd}
      </strong>
      <span>Deterministisch: {formatCurrency(values.get('deterministicCapitalToday') ?? 0, 100)}</span>
      <span>P10: {formatCurrency(values.get('p10CapitalToday') ?? 0, 100)}</span>
      <span>P50: {formatCurrency(values.get('p50CapitalToday') ?? 0, 100)}</span>
      <span>P90: {formatCurrency(values.get('p90CapitalToday') ?? 0, 100)}</span>
      <span>Aufgebraucht: {Math.round((row?.depletionProbability ?? 0) * 100)} %</span>
    </div>
  )
}

export function StochasticCapitalChart({ rows, retirementAge }: StochasticCapitalChartProps) {
  const chartData = rows.map((row) => ({
    ...row,
    deterministicCapitalToday: Math.round(row.deterministicCapitalToday),
    p10CapitalToday: Math.round(row.p10CapitalToday),
    p50CapitalToday: Math.round(row.p50CapitalToday),
    p90CapitalToday: Math.round(row.p90CapitalToday),
  }))

  return (
    <div className="chart-shell stochastic-chart-shell">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 34, bottom: 8, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d7dde5" />
          <XAxis
            dataKey="ageEnd"
            tickFormatter={(value) => `${value}`}
            label={{ value: 'Alter am Jahresende', position: 'insideBottom', offset: -4 }}
          />
          <YAxis tickFormatter={(value) => formatWholeNumber(Number(value))} width={76} />
          <Tooltip content={<ChartTooltip />} />
          <Legend verticalAlign="top" height={36} />
          <ReferenceLine x={retirementAge} stroke="#6b7280" strokeDasharray="4 4" label="Rentenbeginn" />
          <Line
            type="monotone"
            dataKey="deterministicCapitalToday"
            name="Deterministisch"
            stroke="#1f6f8b"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p10CapitalToday"
            name="P10"
            stroke="#b45309"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p50CapitalToday"
            name="P50"
            stroke="#246b3d"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p90CapitalToday"
            name="P90"
            stroke="#6d5bd0"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
