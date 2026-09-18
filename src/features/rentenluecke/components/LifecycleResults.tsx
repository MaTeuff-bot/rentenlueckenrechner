import { useMemo, useState } from 'react'
import { searchLifecycleCapital } from '../model/lifecycleScenario'
import type { LifecycleRun } from '../model/lifecycleScenario'

type Props = {
  lifecycleRun: LifecycleRun
}

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const currencyPrecise = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

export function LifecycleResults({ lifecycleRun }: Props) {
  const [searchRequested, setSearchRequested] = useState(false)
  const summary = lifecycleRun.summary
  const bootstrap = lifecycleRun.bootstrap
  const search = useMemo(() => {
    if (!searchRequested) return null
    try {
      return searchLifecycleCapital(lifecycleRun)
    } catch (error) {
      return { status: 'nonconverged', reason: error instanceof Error ? error.message : String(error) }
    }
  }, [searchRequested, lifecycleRun])

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
          ) : summary.depleted || summary.nonconverged ? (
            <p>Referenz aufgebraucht. {bootstrap.paths.filter((p) => p.status === 'survived').length} von {bootstrap.paths.length} Pfaden überlebt, {bootstrap.depletionCount} aufgebraucht.</p>
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
        <p className="portfolio-note">Bank-only-Suche: ein Topf (Deposit), Einzahlung und Abwicklung gleiche ID, 100%-Ziele ohne feste Reserven, monotoner Faktor F, Eröffnung &gt; 0; nur kapitalunabhängige KV/PV (manuell, KVdR oder manuelle Kapitalbewertung). Fonds, mehrere Töpfe, automatische freiwillige Kapitalbewertung, feste Reserven, Nullstart und nicht monotone Pfade bleiben explizit unsupported. Negativzins-(Cash-/Deposit-)Proxy mindert nur den Cash-Bestand; aus diesem Proxy entsteht kein Steuerverlust/Verlusttopf. Fonds-Verluste bleiben nach §20 Abs.6 gesondert prüfbar.</p>
        <p className="portfolio-note">Ausgewählte Proxys sind keine vertraglichen Sparprognosen; ein negativer Proxy-Verlauf belegt keine abzugsfähige Gebühr und keinen Ausfall. Nachgewiesene GKV-Ausgaben können abweichen.</p>
        {search ? (
          search.status === 'converged' && search.requiredCapital !== undefined ? (
            <p>Benötigtes Startkapital heute (Eröffnung, proportional skaliert): {currency.format(search.requiredCapital)} (Euro-Bracket).</p>
          ) : (
            <p role="status" className="field-error">Keine Kapitalzahl: {search.reason ?? search.status}. Nur Bank-only (ein Deposit, 100% ohne Reserven, monotone F, Eröffnung &gt; 0, kapitalunabhängige Versicherung) konvergiert; sonst explizit unsupported, kein Bypass.</p>
          )
        ) : null}
      </div>
    </section>
  )
}
