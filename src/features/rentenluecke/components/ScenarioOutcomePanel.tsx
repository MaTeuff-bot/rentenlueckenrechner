import { useMemo, useState } from 'react'
import {
  buildRiskChips,
  buildScenarioOutcomeRows,
  calculateCapitalDisplayCap,
  isCapitalDisplayCapped,
  type DepletionRiskChip,
} from '../charting/scenarioOutcomeData'
import { ScenarioOutcomeChart } from './ScenarioOutcomeChart'
import { formatCurrency, formatPercent } from '../model/format'
import type { StochasticSimulationSummary } from '../model/stochasticReturns'
import type { SimulationResult } from '../model/types'
import { DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE, type LifeTableSex } from '../mortality/mortality'

type ScenarioOutcomePanelProps = {
  result: SimulationResult
  stochasticSummary: StochasticSimulationSummary
  historicalValidYears: number[]
}

const sexOptions: { value: LifeTableSex; label: string }[] = [
  { value: 'conservative', label: 'Keine Angabe / konservativ' },
  { value: 'female', label: 'Weiblich' },
  { value: 'male', label: 'Männlich' },
]

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

export function ScenarioOutcomePanel({
  result,
  stochasticSummary,
  historicalValidYears,
}: ScenarioOutcomePanelProps) {
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
  const capitalDisplayCap = calculateCapitalDisplayCap(chartRows)
  const hasCapitalDisplayCap = isCapitalDisplayCapped(chartRows, capitalDisplayCap)
  const reachesDestatisAgeLimit = chartRows.some((row) => row.ageEnd >= DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE)
  const historicalYearLabel =
    historicalValidYears.length > 0
      ? `${historicalValidYears[0]}-${historicalValidYears[historicalValidYears.length - 1]}`
      : 'den verfügbaren historischen Jahren'

  return (
    <section className="panel outcome-panel" aria-labelledby="outcome-title">
      <div className="panel-heading chart-heading">
        <div>
          <h2 id="outcome-title">Kapitalverlauf und Überlebenswahrscheinlichkeit</h2>
          <p>
            In {successPercent} % der simulierten Verläufe reichte das Vermögen bis Alter {planningAge}. Die zentrale
            Linie zeigt P50, die gestrichelte Linie den Planwert mit Erwartungswert der Auswahl. Alle Kapitalwerte sind in heutiger
            Kaufkraft dargestellt.
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
        capitalDisplayCap={capitalDisplayCap}
      />

      <p className="chart-note">
        {`P10, P50 und P90 sind Perzentile aus ${stochasticSummary.simulations.toLocaleString(
          'de-DE',
        )} Bootstrap-Verläufen. Historische Quellen ziehen Jahre mit Zurücklegen aus ${historicalYearLabel}; synthetische Quellen ziehen eigene Renditepfade je Anlageklasse. Das ist kein Backtest eines konkreten Kalenderzeitraums.`}{' '}
        Die Überlebenswahrscheinlichkeit basiert auf der Periodensterbetafel 2023/2025 des Statistischen Bundesamts
        (Destatis) für Deutschland und ist bedingt auf das aktuelle Alter. Sie ist keine individuelle Prognose und keine
        Anlageberatung.
      </p>
      {hasCapitalDisplayCap ? (
        <p className="chart-note">
          Hinweis: Einzelne hohe P90-Ausreißer werden im Diagramm bei {formatCurrency(capitalDisplayCap, 100)} begrenzt,
          damit P10, P50 und Planwert lesbar bleiben. Tooltip und Risiko-Karten zeigen weiterhin die echten
          Simulationswerte.
        </p>
      ) : null}
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
