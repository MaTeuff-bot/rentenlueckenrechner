import { useState } from 'react'
import { RESET_NOTICE_KEY } from '../hooks/scenarioState/persistence'
import { InsuranceBreakdown } from './InsuranceBreakdown'
import { InputPanel } from './InputPanel'
import { ScenarioOutcomePanel } from './ScenarioOutcomePanel'
import { SummaryCards } from './SummaryCards'
import { YearlyTable } from './YearlyTable'
import { useScenarioState } from '../hooks/useScenarioState'

export function RentenlueckeCalculator() {
  const {
    input,
    issues,
    childrenAnswer,
    updateChildrenAnswer,
    updateInsuranceTransition,
    calculationError,
    allocation,
    portfolioBuckets,
    retirementIncomeStreams,
    historical,
    historicalValidYears,
    fieldErrors,
    allocationError,
    portfolioBucketError,
    isValid,
    result,
    stochasticSummary,
    updateField,
    updateRetirementInsurance,
    updatePortfolioBucket,
    addPortfolioBucket,
    removePortfolioBucket,
    updateRetirementIncomeStream,
    addRetirementIncomeStream,
    removeRetirementIncomeStream,
    updateInflationSource,
    reset,
  } = useScenarioState()

  const [resetNotice, setResetNotice] = useState(() => localStorage.getItem(RESET_NOTICE_KEY) === '1')
  return (
    <main>
      <header className="hero">
        <div className="page-shell">
          <p className="eyebrow">Persönlicher Ruhestandsplaner</p>
          <h1>Wann möchtest du aufhören zu arbeiten – und reicht dein Geld dafür?</h1>
          <p>
            Plane deinen Ruhestand mit Ausgaben, Einkommen, Vermögen und Versicherung. Du kannst jeden Abschnitt direkt bearbeiten.
          </p>
        </div>
      </header>

      <div className="page-shell content-stack">
        {resetNotice && <section className="panel" role="status">Die bisherigen Eingaben wurden für die überarbeitete Eingabeführung mit einem Zeitplan und einer Kinderliste zurückgesetzt. Bitte neu ergänzen. <button type="button" className="secondary-button" onClick={() => { localStorage.removeItem(RESET_NOTICE_KEY); setResetNotice(false) }}>Hinweis schließen</button></section>}
        <InputPanel
          issues={issues}
          childrenAnswer={childrenAnswer}
          onChildrenChange={updateChildrenAnswer}
          onTransitionChange={updateInsuranceTransition}
          input={input}
          allocation={allocation}
          portfolioBuckets={portfolioBuckets}
          retirementIncomeStreams={retirementIncomeStreams}
          historical={historical}
          historicalValidYears={historicalValidYears}
          errors={fieldErrors}
          allocationError={allocationError}
          portfolioBucketError={portfolioBucketError}
          onChange={updateField}
          onRetirementInsuranceChange={updateRetirementInsurance}
          onPortfolioBucketChange={updatePortfolioBucket}
          onPortfolioBucketAdd={addPortfolioBucket}
          onPortfolioBucketRemove={removePortfolioBucket}
          onRetirementIncomeStreamChange={updateRetirementIncomeStream}
          onRetirementIncomeStreamAdd={addRetirementIncomeStream}
          onRetirementIncomeStreamRemove={removeRetirementIncomeStream}
          onInflationSourceChange={updateInflationSource}
          onReset={reset}
        />

        <section id="ergebnis" tabIndex={-1} className="results-section" aria-labelledby="results-title">
        <h2 id="results-title">Ergebnis</h2>
        {!isValid || !result || !stochasticSummary ? (
          <section className="panel invalid-panel" role="status">
            {calculationError ?? portfolioBucketError ?? allocationError ??
              'Deine Prognose ist noch offen. Ergänze die verlinkten Angaben; danach erscheinen Ergebnisse, Diagramm und Tabelle.'}
            <p><a href="#inputs-title">Zu den offenen Angaben</a></p>
          </section>
        ) : (
          <>
            <SummaryCards result={result} stochasticSummary={stochasticSummary} />
            <p className="source-warning">Investmentsteuern werden nicht automatisch berechnet oder finanziert. Die Ergebnisse sind keine vollständig nach Steuern verfügbare Kaufkraft.</p>
            <details className="panel"><summary>KV/PV-Abrechnung im Detail</summary><InsuranceBreakdown rows={result.retirementRows} streams={retirementIncomeStreams} /></details>
            <ScenarioOutcomePanel
              result={result}
              stochasticSummary={stochasticSummary}
              historicalValidYears={historicalValidYears}
            />
            <details className="panel"><summary>Jährliche Abrechnung anzeigen</summary><YearlyTable rows={result.rows} /></details>
          </>
        )}

        </section>
      </div>
    </main>
  )
}
