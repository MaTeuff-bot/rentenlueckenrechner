import { useMemo, useState } from 'react'
import { ScenarioOutcomeChart, type ScenarioOutcomeChartRow } from './ScenarioOutcomeChart'
import { formatCurrency, formatPercent } from '../model/format'
import type { StochasticPercentileRow, StochasticSimulationSummary } from '../model/stochasticReturns'
import type { SimulationResult } from '../model/types'
import {
  DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE,
  getSurvivalProbabilityForAgeEnd,
  type LifeTableSex,
} from '../mortality/mortality'

type ScenarioOutcomePanelProps = {
  result: SimulationResult
  stochasticSummary: StochasticSimulationSummary
}

type DepletionRiskChip = {
  key: string
  label: string
  ageEnd: number
  survivalProbabilityEnd: number
  depletionProbability: number
}

const survivalThresholds = [
  { key: 'survival-20', threshold: 0.2, label: 'Wenn noch ≤20 % leben' },
  { key: 'survival-10', threshold: 0.1, label: 'Wenn noch ≤10 % leben' },
  { key: 'survival-5', threshold: 0.05, label: 'Wenn noch ≤5 % leben' },
]

const sexOptions: { value: LifeTableSex; label: string }[] = [
  { value: 'conservative', label: 'Keine Angabe / konservativ' },
  { value: 'female', label: 'Weiblich' },
  { value: 'male', label: 'Männlich' },
]

function roundCapital(value: number): number {
  return Math.round(value)
}

function buildScenarioOutcomeRows(
  result: SimulationResult,
  stochasticRows: StochasticPercentileRow[],
  lifeTableSex: LifeTableSex,
): ScenarioOutcomeChartRow[] {
  const currentAge = result.rows[0]?.ageStart ?? 0

  return result.rows.map((deterministicRow, rowIndex) => {
    const stochasticRow = stochasticRows[rowIndex]
    const p10CapitalToday = roundCapital(stochasticRow?.p10CapitalToday ?? deterministicRow.closingCapitalToday)
    const p50CapitalToday = roundCapital(stochasticRow?.p50CapitalToday ?? deterministicRow.closingCapitalToday)
    const p90CapitalToday = roundCapital(stochasticRow?.p90CapitalToday ?? deterministicRow.closingCapitalToday)

    return {
      ageStart: deterministicRow.ageStart,
      ageEnd: deterministicRow.ageEnd,
      deterministicCapitalToday: roundCapital(stochasticRow?.deterministicCapitalToday ?? deterministicRow.closingCapitalToday),
      p10CapitalToday,
      p50CapitalToday,
      p90CapitalToday,
      p10ToP90CapitalToday: [p10CapitalToday, p90CapitalToday],
      survivalProbabilityEnd: getSurvivalProbabilityForAgeEnd(currentAge, deterministicRow.ageEnd, lifeTableSex),
      depletionProbability: stochasticRow?.depletionProbability ?? (deterministicRow.depleted ? 1 : 0),
    }
  })
}

function buildRiskChips(rows: ScenarioOutcomeChartRow[]): DepletionRiskChip[] {
  const chips: DepletionRiskChip[] = []
  const usedAges = new Set<number>()

  for (const threshold of survivalThresholds) {
    const row = rows.find((row) => row.survivalProbabilityEnd <= threshold.threshold)
    if (!row || usedAges.has(row.ageEnd)) {
      continue
    }

    chips.push({
      key: threshold.key,
      label: threshold.label,
      ageEnd: row.ageEnd,
      survivalProbabilityEnd: row.survivalProbabilityEnd,
      depletionProbability: row.depletionProbability,
    })
    usedAges.add(row.ageEnd)
  }

  const planningHorizonRow = rows.at(-1)
  if (planningHorizonRow && !usedAges.has(planningHorizonRow.ageEnd)) {
    chips.push({
      key: 'planning-horizon',
      label: 'Bis Planungshorizont',
      ageEnd: planningHorizonRow.ageEnd,
      survivalProbabilityEnd: planningHorizonRow.survivalProbabilityEnd,
      depletionProbability: planningHorizonRow.depletionProbability,
    })
  }

  return chips
}

function RiskChip({ chip }: { chip: DepletionRiskChip }) {
  return (
    <div className="outcome-risk-card">
      <span>{chip.label}</span>
      <strong>{formatPercent(chip.depletionProbability)}</strong>
      <small>
        Alter {chip.ageEnd} · Überleben {formatPercent(chip.survivalProbabilityEnd)}
      </small>
    </div>
  )
}

export function ScenarioOutcomePanel({ result, stochasticSummary }: ScenarioOutcomePanelProps) {
  const [showSurvivalProbability, setShowSurvivalProbability] = useState(true)
  const [useLogCapitalScale, setUseLogCapitalScale] = useState(false)
  const [lifeTableSex, setLifeTableSex] = useState<LifeTableSex>('conservative')
  const planningAge = result.rows.at(-1)?.ageEnd ?? 0
  const successPercent = Math.round(stochasticSummary.successProbability * 100)
  const chartRows = useMemo(
    () => buildScenarioOutcomeRows(result, stochasticSummary.rows, lifeTableSex),
    [lifeTableSex, result, stochasticSummary.rows],
  )
  const riskChips = useMemo(() => buildRiskChips(chartRows), [chartRows])
  const reachesDestatisAgeLimit = chartRows.some((row) => row.ageEnd >= DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE)

  return (
    <section className="panel outcome-panel" aria-labelledby="outcome-title">
      <div className="panel-heading chart-heading">
        <div>
          <h2 id="outcome-title">Kapitalverlauf und Überlebenswahrscheinlichkeit</h2>
          <p>
            In {successPercent} % der simulierten Verläufe reichte das Vermögen bis Alter {planningAge}. Alle
            Kapitalwerte sind in heutiger Kaufkraft dargestellt.
          </p>
        </div>
        <div className="simulation-badge">{stochasticSummary.simulations.toLocaleString('de-DE')} Verläufe</div>
      </div>

      <div className="chart-controls outcome-controls" aria-label="Einstellungen zur Überlebenswahrscheinlichkeit">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showSurvivalProbability}
            onChange={(event) => setShowSurvivalProbability(event.target.checked)}
          />
          Überlebenswahrscheinlichkeit anzeigen
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={useLogCapitalScale}
            onChange={(event) => setUseLogCapitalScale(event.target.checked)}
          />
          Kapital logarithmisch skalieren
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

      <div className="outcome-risk-grid" aria-label="Aufbrauchrisiko nach Überlebenswahrscheinlichkeit">
        {riskChips.map((chip) => (
          <RiskChip key={chip.key} chip={chip} />
        ))}
      </div>
      <p className="chart-note outcome-risk-note">
        Die Risiko-Karten zeigen das Aufbrauchrisiko zu Altersstufen, an denen die ausgewählte Sterbetafel höchstens
        20 %, 10 % bzw. 5 % Überleben ausweist. „Aufgebraucht“ bedeutet: Kapital von {formatCurrency(0)} oder weniger
        in der Simulation.
      </p>

      <ScenarioOutcomeChart
        rows={chartRows}
        retirementAge={result.retirementRows[0]?.ageStart ?? 0}
        depletionAgeEnd={result.summary.depletionAgeEnd}
        showSurvivalProbability={showSurvivalProbability}
        useLogCapitalScale={useLogCapitalScale}
      />

      <p className="chart-note">
        Die Simulation nutzt {stochasticSummary.simulations.toLocaleString('de-DE')} zufällige Renditeverläufe auf Basis
        vereinfachter Annahmen für Aktien, Anleihen und Festgeld/Cash. Die Überlebenswahrscheinlichkeit basiert auf der
        Periodensterbetafel 2023/2025 des Statistischen Bundesamts (Destatis) für Deutschland und ist bedingt auf das
        aktuelle Alter. Sie ist keine individuelle Prognose und keine Anlageberatung.
      </p>
      {useLogCapitalScale ? (
        <p className="chart-note">
          Hinweis: Bei logarithmischer Skalierung werden Kapitalwerte von 0 € oder weniger am unteren Rand der
          Kapitalachse dargestellt. Tooltip und Risiko-Karten zeigen weiterhin die echten Simulationswerte.
        </p>
      ) : null}
      {reachesDestatisAgeLimit ? (
        <p className="chart-note">
          Hinweis: Die Destatis-Sterbetafel enthält Einzelalter bis 100. Höhere Alter werden im Diagramm nicht weiter
          aufgeschlüsselt.
        </p>
      ) : null}
    </section>
  )
}
