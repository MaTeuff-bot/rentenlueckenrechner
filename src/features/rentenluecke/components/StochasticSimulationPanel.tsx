import { StochasticCapitalChart } from './StochasticCapitalChart'
import type { StochasticSimulationSummary } from '../model/stochasticReturns'
import type { SimulationResult } from '../model/types'

type StochasticSimulationPanelProps = {
  deterministicResult: SimulationResult
  summary: StochasticSimulationSummary
}

export function StochasticSimulationPanel({ deterministicResult, summary }: StochasticSimulationPanelProps) {
  const planningAge = deterministicResult.rows.at(-1)?.ageEnd ?? 0
  const successPercent = Math.round(summary.successProbability * 100)

  return (
    <section className="panel stochastic-panel" aria-labelledby="simulation-title">
      <div className="panel-heading">
        <div>
          <h2 id="simulation-title">Simulation mit schwankenden Renditen</h2>
          <p>
            In {successPercent} % der simulierten Verläufe reichte das Vermögen bis Alter {planningAge}.
          </p>
        </div>
        <div className="simulation-badge">{summary.simulations.toLocaleString('de-DE')} Verläufe</div>
      </div>
      <StochasticCapitalChart rows={summary.rows} retirementAge={deterministicResult.retirementRows[0]?.ageStart ?? 0} />
      <p className="chart-note">
        Die Simulation nutzt 1.000 zufällige Renditeverläufe auf Basis vereinfachter Annahmen für Aktien,
        Anleihen und Festgeld/Cash. Sie ist keine Prognose und keine Anlageberatung.
      </p>
    </section>
  )
}
