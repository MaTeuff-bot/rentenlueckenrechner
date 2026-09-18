import { useMemo, useState } from 'react'
import { calculatePortfolioBucketTotal } from '../model/portfolioBuckets'
import type { PortfolioBucket } from '../model/portfolioBuckets'
import { searchLifecycleCapital } from '../model/lifecycleScenario'
import type { LifecycleRun } from '../model/lifecycleScenario'

type Props = {
  lifecycleRun: LifecycleRun
  portfolioBuckets: PortfolioBucket[]
  acquisitionCost: Record<string, number | undefined>
}

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const currencyPrecise = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

export function LifecycleResults({ lifecycleRun, portfolioBuckets, acquisitionCost }: Props) {
  const [searchRequested, setSearchRequested] = useState(false)
  const summary = lifecycleRun.summary
  const bootstrap = lifecycleRun.bootstrap
  const search = useMemo(() => {
    if (!searchRequested) return null
    const total = calculatePortfolioBucketTotal(portfolioBuckets)
    try {
      return searchLifecycleCapital(lifecycleRun, (capital: number) => {
        if (total <= 0) {
          return {
            portfolioBuckets: portfolioBuckets.map((b) => ({ ...b, value: 0 })),
            acquisitionCost: { ...acquisitionCost },
          }
        }
        const scale = capital / total
        return {
          portfolioBuckets: portfolioBuckets.map((b) => ({ ...b, value: Math.max(0, b.value * scale) })),
          acquisitionCost: Object.fromEntries(
            Object.entries(acquisitionCost).map(([id, cost]) => {
              const bucket = portfolioBuckets.find((b) => b.id === id)
              const oldValue = bucket ? Math.max(0, bucket.value) : 0
              const newValue = bucket ? Math.max(0, bucket.value * scale) : 0
              if (oldValue <= 0) return [id, cost ?? 0]
              const ratio = newValue / oldValue
              return [id, (cost ?? 0) * ratio]
            }),
          ),
        }
      })
    } catch (error) {
      return { status: 'nonconverged', reason: error instanceof Error ? error.message : String(error) }
    }
  }, [searchRequested, lifecycleRun, portfolioBuckets, acquisitionCost])

  const depleted = summary.depleted
  const nonconverged = summary.nonconverged
  return (
    <section className="panel" aria-labelledby="lifecycle-results-title">
      <h3 id="lifecycle-results-title">Lebenszyklus-Ergebnis (mit Investmentsteuern, KV/PV)</h3>
      {nonconverged ? (
        <p role="status" className="field-error">Nicht konvergiert: Solver hat das Iterationsbudget ausgeschöpft. Kein erfolgreich wirkendes Teilergebnis. Annahmen prüfen (Reserven, Entnahmen, Steuern).</p>
      ) : null}
      {depleted && !nonconverged ? (
        <p role="status" className="field-error">Entnahmelücke: Vermögen reicht nicht. {summary.depletionAge !== null ? `Erste Lücke mit Alter ${summary.depletionAge}.` : ''} Ungedeckte Entnahme {currencyPrecise.format(summary.unfundedWithdrawalTotal)}, ungedeckte KV/PV {currencyPrecise.format(summary.unfundedInsuranceTotal)}, offene Steuer {currencyPrecise.format(summary.remainingLiabilitiesTotal)}.</p>
      ) : null}
      {!depleted && !nonconverged ? <p role="status">Tragfähig bis Planungshorizont. Entnahmen und laufende KV/PV aus liquiden Mitteln gedeckt.</p> : null}
      <dl>
        <div><dt>Schlusswert nominal (vor Abwicklung)</dt><dd>{currency.format(summary.closingNominal)}</dd></div>
        <div><dt>Nach Abwicklung nominal (nach Liquidationssteuer, offenen Verbindlichkeiten und zusätzlicher KV/PV, ohne Doppelabzug)</dt><dd>{currency.format(summary.liquidationNominal)}</dd></div>
        <div><dt>Nach Abwicklung real (heutige Kaufkraft)</dt><dd>{currency.format(summary.liquidationReal)}</dd></div>
        <div><dt>Steuern laufend + Nachzahlungen gesamt</dt><dd>{currency.format(summary.taxPaidTotal)}</dd></div>
        <div><dt>Offene Steuerverbindlichkeiten</dt><dd>{currency.format(summary.remainingLiabilitiesTotal)}</dd></div>
        <div><dt>Zusätzliche KV/PV aus Abwicklung p.a.</dt><dd>{currency.format(summary.incrementalInsuranceAnnual)} ({summary.terminalAssumption})</dd></div>
        <div><dt>Abwicklungs-Restschuld</dt><dd>{currency.format(summary.liquidationOutstandingLiability)}</dd></div>
      </dl>
      {bootstrap ? (
        <div>
          <h4>Bootstrap (Jahres-Resampling, gleiche Ledger-Engine)</h4>
          {bootstrap.summaryBlocked ? (
            <p role="status" className="field-error">Bootstrap blockiert: {bootstrap.failureCount} Pfade nicht konvergiert/fehlerhaft. Keine Erfolgswahrscheinlichkeit. Referenz bleibt sichtbar, Teilsummen werden nicht als Erfolg dargestellt.</p>
          ) : (
            <p>Referenz tragfähig. {bootstrap.paths.filter((p) => p.status === 'survived').length} von {bootstrap.paths.length} Pfaden überlebt, {bootstrap.depletionCount} aufgebraucht.</p>
          )}
          <p>Referenz-Schlusswert {currency.format(bootstrap.reference.reports.at(-1)?.closingValue ?? 0)}. Pfade: {bootstrap.failureCount} fehlerhaft, {bootstrap.depletionCount} aufgebraucht.</p>
        </div>
      ) : null}
      <div>
        <h4>Benötigtes Kapital</h4>
        {!searchRequested ? (
          <button type="button" className="secondary-button" onClick={() => setSearchRequested(true)}>Benötigtes Kapital berechnen</button>
        ) : null}
        {search ? (
          search.status === 'converged' && search.requiredCapital !== undefined ? (
            <p>Benötigtes Startkapital heute (Eröffnung, skaliert heutige Bestände): {currency.format(search.requiredCapital)} (Euro-Bracket, ohne Beweis-Flags).</p>
          ) : (
            <p role="status" className="field-error">Keine Kapitalzahl: {search.reason ?? search.status}. Feste Reserven, nicht monotone Inflation oder Nullstart ohne Beweis bleiben explizit unsupported; kein Bypass.</p>
          )
        ) : null}
      </div>
    </section>
  )
}
