import { useState } from 'react'
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
import {
  DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE,
  getSurvivalProbabilityForAgeEnd,
  type LifeTableSex,
} from '../mortality/mortality'

type CapitalChartProps = {
  result: SimulationResult
}

type ChartRow = {
  ageStart: number
  ageEnd: number
  closingCapital: number
  closingCapitalToday: number
  survivalProbabilityEnd: number
}

type ChartTooltipPayload = {
  dataKey?: string | number
  value?: number | string
  payload?: ChartRow
}

type ChartTooltipProps = {
  active?: boolean
  label?: number | string
  payload?: ChartTooltipPayload[]
}

const sexOptions: { value: LifeTableSex; label: string }[] = [
  { value: 'conservative', label: 'Keine Angabe / konservativ' },
  { value: 'female', label: 'Weiblich' },
  { value: 'male', label: 'Männlich' },
]

function formatSurvivalPercent(value: number): string {
  return `${Math.round(value * 100)} %`
}

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const row = payload[0]?.payload
  const ageEnd = Number(label)
  const ageStart = row?.ageStart ?? ageEnd - 1
  const values = new Map(payload.map((item) => [item.dataKey, Number(item.value)]))
  const survivalProbability = values.get('survivalProbabilityEnd')

  return (
    <div className="chart-tooltip">
      <strong>
        Alter {ageStart}-{ageEnd}
      </strong>
      <span>Endkapital nominal: {formatCurrency(values.get('closingCapital') ?? 0, 100)}</span>
      <span>
        Endkapital heutige Kaufkraft: {formatCurrency(values.get('closingCapitalToday') ?? 0, 100)}
      </span>
      {typeof survivalProbability === 'number' && !Number.isNaN(survivalProbability) ? (
        <span>
          Überlebenswahrscheinlichkeit bis Alter {Math.min(ageEnd, DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE)}:{' '}
          {formatSurvivalPercent(survivalProbability)}
        </span>
      ) : null}
    </div>
  )
}

export function CapitalChart({ result }: CapitalChartProps) {
  const [showSurvivalProbability, setShowSurvivalProbability] = useState(true)
  const [lifeTableSex, setLifeTableSex] = useState<LifeTableSex>('conservative')
  const depletionAgeEnd = result.summary.depletionAgeEnd
  const currentAge = result.rows[0]?.ageStart ?? 0
  const chartData = result.rows.map((row) => ({
    ageStart: row.ageStart,
    ageEnd: row.ageEnd,
    closingCapital: Math.round(row.closingCapital),
    closingCapitalToday: Math.round(row.closingCapitalToday),
    survivalProbabilityEnd: getSurvivalProbabilityForAgeEnd(currentAge, row.ageEnd, lifeTableSex),
  }))
  const reachesDestatisAgeLimit = chartData.some((row) => row.ageEnd >= DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE)

  return (
    <section className="panel" aria-labelledby="chart-title">
      <div className="panel-heading chart-heading">
        <div>
          <h2 id="chart-title">Kapitalverlauf und Überlebenswahrscheinlichkeit</h2>
          <p>
            Die Überlebenswahrscheinlichkeit basiert auf der Periodensterbetafel 2023/2025 des Statistischen
            Bundesamts (Destatis) für Deutschland und ist bedingt auf das aktuelle Alter. Sie ist keine
            individuelle Prognose.
          </p>
        </div>
        <div className="chart-controls" aria-label="Einstellungen zur Überlebenswahrscheinlichkeit">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showSurvivalProbability}
              onChange={(event) => setShowSurvivalProbability(event.target.checked)}
            />
            Überlebenswahrscheinlichkeit anzeigen
          </label>
          <label className="field chart-sex-field">
            <span className="field-label">Geschlecht für Sterbetafel</span>
            <select value={lifeTableSex} onChange={(event) => setLifeTableSex(event.target.value as LifeTableSex)}>
              {sexOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 34, bottom: 8, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d7dde5" />
            <XAxis
              dataKey="ageEnd"
              tickFormatter={(value) => `${value}`}
              label={{ value: 'Alter am Jahresende', position: 'insideBottom', offset: -4 }}
            />
            <YAxis yAxisId="capital" tickFormatter={(value) => formatWholeNumber(Number(value))} width={76} />
            {showSurvivalProbability ? (
              <YAxis
                yAxisId="survival"
                orientation="right"
                domain={[0, 1]}
                tickFormatter={(value) => formatSurvivalPercent(Number(value))}
                width={58}
              />
            ) : null}
            <Tooltip content={<ChartTooltip />} />
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
              yAxisId="capital"
              type="monotone"
              dataKey="closingCapital"
              name="Endkapital nominal"
              stroke="#1f6f8b"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="capital"
              type="monotone"
              dataKey="closingCapitalToday"
              name="Endkapital heutige Kaufkraft"
              stroke="#7a5c17"
              strokeWidth={2}
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
                strokeDasharray="5 5"
                dot={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {reachesDestatisAgeLimit ? (
        <p className="chart-note">
          Hinweis: Die Destatis-Sterbetafel enthält Einzelalter bis 100. Höhere Alter werden im Diagramm nicht
          weiter aufgeschlüsselt.
        </p>
      ) : null}
    </section>
  )
}
