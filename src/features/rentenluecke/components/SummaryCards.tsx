import { formatApproxCurrency } from '../model/format'
import type { StochasticSimulationSummary } from '../model/stochasticReturns'
import type { SimulationResult } from '../model/types'

type SummaryCardsProps = {
  result: SimulationResult
  stochasticSummary: StochasticSimulationSummary
}

export function SummaryCards({ result, stochasticSummary }: SummaryCardsProps) {
  const { summary } = result
  const retirementAge = result.retirementRows[0]?.ageStart ?? result.rows.at(-1)?.ageEnd
  const retirementPercentileRow = stochasticSummary.rows.find((row) => row.ageStart === retirementAge)
  const planRetirementRow = result.accumulationRows.at(-1)
  const planCapitalAtRetirementToday = planRetirementRow?.closingCapitalToday ?? summary.projectedCapitalAtRetirement
  const retirementCapitalToTodayFactor =
    planRetirementRow && summary.projectedCapitalAtRetirement > 0
      ? planRetirementRow.closingCapitalToday / summary.projectedCapitalAtRetirement
      : 1
  const requiredCapitalAtRetirementToday = summary.requiredCapitalAtRetirement * retirementCapitalToTodayFactor
  const displayedProjectedCapital = retirementPercentileRow?.p50CapitalToday ?? planCapitalAtRetirementToday
  const displayedShortfall = Math.max(0, requiredCapitalAtRetirementToday - displayedProjectedCapital)
  const displayedSurplus = Math.max(0, displayedProjectedCapital - requiredCapitalAtRetirementToday)
  const hasShortfall = displayedShortfall > 0
  const firstMedianDepletionRow =
    result.retirementRows.length > 0
      ? stochasticSummary.rows.find((row) => row.ageStart >= result.retirementRows[0].ageStart && row.p50CapitalToday <= 0)
      : null

  return (
    <section aria-labelledby="results-title">
      <h2 id="results-title">Ergebnis</h2>
      <div className="summary-grid">
        <article className="result-card result-card-primary">
          <span>Benötigtes Kapital zum Rentenbeginn, heutige Kaufkraft</span>
          <strong>{formatApproxCurrency(requiredCapitalAtRetirementToday)}</strong>
        </article>
        <article className="result-card">
          <span>Median-Kapital zum Rentenbeginn (P50)</span>
          <strong>{formatApproxCurrency(displayedProjectedCapital)}</strong>
        </article>
        <article className={`result-card ${hasShortfall ? 'warning-card' : 'success-card'}`}>
          <span>{hasShortfall ? 'Kapital-Lücke zum Rentenbeginn' : 'Median-Überschuss zum Rentenbeginn'}</span>
          <strong>{formatApproxCurrency(hasShortfall ? displayedShortfall : displayedSurplus)}</strong>
        </article>
        <article className="result-card">
          <span>Monatliche Rentenlücke in heutiger Kaufkraft</span>
          <strong>{formatApproxCurrency(summary.monthlyGapToday, 50)}</strong>
        </article>
      </div>
      {firstMedianDepletionRow ? (
        <p className="depletion-note">
          Im Median-Verlauf ist das Kapital im Jahr {firstMedianDepletionRow.ageStart}-{firstMedianDepletionRow.ageEnd}{' '}
          aufgebraucht.
        </p>
      ) : summary.depletionAge !== null && summary.depletionAgeEnd !== null ? (
        <p className="depletion-note">
          Der Planwert reicht nicht vollständig im Jahr {summary.depletionAge}-{summary.depletionAgeEnd}.
        </p>
      ) : (
        <p className="survival-note">Der Median-Verlauf deckt die Entnahmen bis zum Planungshorizont.</p>
      )}
    </section>
  )
}
