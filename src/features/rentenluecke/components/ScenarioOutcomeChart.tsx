import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatPercent, formatWholeNumber } from '../model/format'

export type ScenarioOutcomeChartRow = {
  ageStart: number
  ageEnd: number
  deterministicCapitalToday: number
  p10CapitalToday: number
  p50CapitalToday: number
  p90CapitalToday: number
  p10ToP90CapitalToday: [number, number]
  survivalProbabilityEnd: number
  depletionProbability: number
}

type ScenarioOutcomeChartProps = {
  rows: ScenarioOutcomeChartRow[]
  retirementAge: number
  depletionAgeEnd: number | null
  showSurvivalProbability: boolean
  useLogCapitalScale: boolean
}

type ChartDisplayRow = ScenarioOutcomeChartRow & {
  chartDeterministicCapitalToday: number
  chartP10CapitalToday: number
  chartP50CapitalToday: number
  chartP90CapitalToday: number
  chartP10ToP90CapitalToday: [number, number]
}

type ChartTooltipPayload = {
  dataKey?: string | number
  value?: number | string | [number, number]
  payload?: ScenarioOutcomeChartRow
}

type ChartTooltipProps = {
  active?: boolean
  label?: number | string
  payload?: ChartTooltipPayload[]
}

function formatTooltipCurrency(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatCurrency(value, 100) : formatCurrency(0, 100)
}

function toLogScaleCapital(value: number): number {
  return Math.max(1, value)
}

function buildDisplayRows(rows: ScenarioOutcomeChartRow[], useLogCapitalScale: boolean): ChartDisplayRow[] {
  return rows.map((row) => {
    const chartP10CapitalToday = useLogCapitalScale ? toLogScaleCapital(row.p10CapitalToday) : row.p10CapitalToday
    const chartP50CapitalToday = useLogCapitalScale ? toLogScaleCapital(row.p50CapitalToday) : row.p50CapitalToday
    const chartP90CapitalToday = useLogCapitalScale ? toLogScaleCapital(row.p90CapitalToday) : row.p90CapitalToday
    const chartDeterministicCapitalToday = useLogCapitalScale
      ? toLogScaleCapital(row.deterministicCapitalToday)
      : row.deterministicCapitalToday

    return {
      ...row,
      chartDeterministicCapitalToday,
      chartP10CapitalToday,
      chartP50CapitalToday,
      chartP90CapitalToday,
      chartP10ToP90CapitalToday: [chartP10CapitalToday, chartP90CapitalToday],
    }
  })
}

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const row = payload[0]?.payload
  const ageEnd = Number(label)
  const ageStart = row?.ageStart ?? ageEnd - 1
  const values = new Map(payload.map((item) => [item.dataKey, item.value]))
  const survivalProbability = row?.survivalProbabilityEnd ?? Number(values.get('survivalProbabilityEnd'))
  const depletionProbability = row?.depletionProbability ?? 0

  return (
    <div className="chart-tooltip">
      <strong>
        Alter {ageStart}-{ageEnd}
      </strong>
      <span>P10: {formatTooltipCurrency(row?.p10CapitalToday)}</span>
      <span>P50: {formatTooltipCurrency(row?.p50CapitalToday ?? values.get('p50CapitalToday'))}</span>
      <span>P90: {formatTooltipCurrency(row?.p90CapitalToday)}</span>
      <span>
        Deterministisch: {formatTooltipCurrency(row?.deterministicCapitalToday ?? values.get('deterministicCapitalToday'))}
      </span>
      <span>Kapital aufgebraucht: {formatPercent(depletionProbability)}</span>
      {Number.isFinite(survivalProbability) ? (
        <span>
          Überleben bis Alter {ageEnd}: {formatPercent(survivalProbability)}
        </span>
      ) : null}
    </div>
  )
}

export function ScenarioOutcomeChart({
  rows,
  retirementAge,
  depletionAgeEnd,
  showSurvivalProbability,
  useLogCapitalScale,
}: ScenarioOutcomeChartProps) {
  const displayRows = buildDisplayRows(rows, useLogCapitalScale)

  return (
    <div className="chart-shell outcome-chart-shell">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={displayRows} margin={{ top: 12, right: 34, bottom: 8, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d7dde5" />
          <XAxis
            dataKey="ageEnd"
            tickFormatter={(value) => `${value}`}
            label={{ value: 'Alter am Jahresende', position: 'insideBottom', offset: -4 }}
          />
          <YAxis
            yAxisId="capital"
            scale={useLogCapitalScale ? 'log' : 'auto'}
            domain={useLogCapitalScale ? [1, 'auto'] : ['auto', 'auto']}
            tickFormatter={(value) => formatWholeNumber(Number(value))}
            width={76}
            label={{
              value: useLogCapitalScale ? 'Kapital heutige Kaufkraft (log)' : 'Kapital heutige Kaufkraft',
              angle: -90,
              position: 'insideLeft',
            }}
          />
          {showSurvivalProbability ? (
            <YAxis
              yAxisId="survival"
              orientation="right"
              domain={[0, 1]}
              tickFormatter={(value) => formatPercent(Number(value))}
              width={62}
            />
          ) : null}
          <Tooltip content={<ChartTooltip />} />
          <Legend verticalAlign="top" height={36} />
          <ReferenceLine x={retirementAge} stroke="#6b7280" strokeDasharray="4 4" label="Rentenbeginn" />
          {depletionAgeEnd ? (
            <ReferenceLine x={depletionAgeEnd} stroke="#b91c1c" strokeDasharray="4 4" label="Aufgebraucht" />
          ) : null}
          <Area
            yAxisId="capital"
            type="monotone"
            dataKey="chartP10ToP90CapitalToday"
            name="P10–P90"
            fill="#7db7c7"
            fillOpacity={0.22}
            stroke="#7db7c7"
            strokeOpacity={0.45}
            dot={false}
            activeDot={false}
          />
          <Line
            yAxisId="capital"
            type="monotone"
            dataKey="chartP50CapitalToday"
            name="P50 mittlerer Verlauf"
            stroke="#1f6f8b"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            yAxisId="capital"
            type="monotone"
            dataKey="chartDeterministicCapitalToday"
            name="Deterministisch"
            stroke="#6b7280"
            strokeWidth={1.8}
            strokeDasharray="5 5"
            dot={false}
          />
          {showSurvivalProbability ? (
            <Line
              yAxisId="survival"
              type="monotone"
              dataKey="survivalProbabilityEnd"
              name="Überlebenswahrscheinlichkeit"
              stroke="#6d5bd0"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
