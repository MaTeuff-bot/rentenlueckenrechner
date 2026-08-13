import { formatApproxCurrency } from '../model/format'
import type { SimulationResult } from '../model/types'

type SummaryCardsProps = {
  result: SimulationResult
}

export function SummaryCards({ result }: SummaryCardsProps) {
  const { summary } = result
  const hasShortfall = summary.capitalShortfallAtRetirement > 0

  return (
    <section aria-labelledby="results-title">
      <h2 id="results-title">Ergebnis</h2>
      <div className="summary-grid">
        <article className="result-card result-card-primary">
          <span>Benötigtes Kapital zum Rentenbeginn</span>
          <strong>{formatApproxCurrency(summary.requiredCapitalAtRetirement)}</strong>
        </article>
        <article className="result-card">
          <span>Voraussichtliches Kapital zum Rentenbeginn</span>
          <strong>{formatApproxCurrency(summary.projectedCapitalAtRetirement)}</strong>
        </article>
        <article className={`result-card ${hasShortfall ? 'warning-card' : 'success-card'}`}>
          <span>
            {hasShortfall
              ? 'Kapital-Lücke zum Rentenbeginn'
              : 'Voraussichtlicher Überschuss zum Rentenbeginn'}
          </span>
          <strong>
            {formatApproxCurrency(
              hasShortfall ? summary.capitalShortfallAtRetirement : summary.capitalSurplusAtRetirement,
            )}
          </strong>
        </article>
        <article className="result-card">
          <span>Monatliche Rentenlücke in heutiger Kaufkraft</span>
          <strong>{formatApproxCurrency(summary.monthlyGapToday, 50)}</strong>
        </article>
      </div>
      {summary.depletionAge !== null && summary.depletionAgeEnd !== null ? (
        <p className="depletion-note">
          Kapital reicht nicht vollständig im Jahr {summary.depletionAge}-{summary.depletionAgeEnd}.
        </p>
      ) : (
        <p className="survival-note">Das projizierte Kapital deckt die Entnahmen bis zum Planungshorizont.</p>
      )}
    </section>
  )
}
