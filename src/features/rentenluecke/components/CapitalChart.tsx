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
import type { SimulationResult } from '../model/types'

type CapitalChartProps = {
  result: SimulationResult
}

export function CapitalChart({ result }: CapitalChartProps) {
  const depletionAgeEnd = result.summary.depletionAgeEnd
  const chartData = result.rows.map((row) => ({
    ageEnd: row.ageEnd,
    closingCapital: Math.round(row.closingCapital),
    closingCapitalToday: Math.round(row.closingCapitalToday),
  }))

  return (
    <section className="panel" aria-labelledby="chart-title">
      <h2 id="chart-title">Kapitalverlauf</h2>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 8, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d7dde5" />
            <XAxis
              dataKey="ageEnd"
              tickFormatter={(value) => `${value}`}
              label={{ value: 'Alter am Jahresende', position: 'insideBottom', offset: -4 }}
            />
            <YAxis tickFormatter={(value) => formatWholeNumber(Number(value))} width={76} />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(Number(value), 100),
                name === 'closingCapital' ? 'Endkapital nominal' : 'Endkapital heutige Kaufkraft',
              ]}
              labelFormatter={(age) => `Alter ${age}`}
            />
            <Legend verticalAlign="top" height={36} />
            <ReferenceLine
              x={result.accumulationRows.at(-1)?.ageEnd ?? result.retirementRows[0]?.ageStart}
              stroke="#6b7280"
              strokeDasharray="4 4"
              label="Rentenbeginn"
            />
            {depletionAgeEnd ? (
              <ReferenceLine x={depletionAgeEnd} stroke="#b91c1c" strokeDasharray="4 4" label="Aufgebraucht" />
            ) : null}
            <Line
              type="monotone"
              dataKey="closingCapital"
              name="Endkapital nominal"
              stroke="#1f6f8b"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="closingCapitalToday"
              name="Endkapital heutige Kaufkraft"
              stroke="#7a5c17"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
