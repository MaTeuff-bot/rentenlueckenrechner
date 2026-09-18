import { useState } from 'react'
import { LIFECYCLE_RESET_NOTICE_KEY, RESET_NOTICE_KEY } from '../hooks/scenarioState/persistence'
import { InputPanel } from './InputPanel'
import { LifecycleChart } from './LifecycleChart'
import { LifecycleMilestones } from './LifecycleMilestones'
import { LifecycleResults } from './LifecycleResults'
import { LifecycleTaxSetup } from './LifecycleTaxSetup'
import { LifecycleYearlyTable } from './LifecycleYearlyTable'
import { useScenarioState } from '../hooks/useScenarioState'
import { calculatePortfolioBucketTotal } from '../model/portfolioBuckets'

export function RentenlueckeCalculator() {
  const {
    input,
    issues,
    insuranceCoverageAnswers, updateInsuranceCoverage,
    childrenAnswer,
    updateChildrenAnswer,
    updateInsuranceTransition,
    allocation,
    portfolioBuckets,
    retirementIncomeStreams,
    historical,
    historicalValidYears,
    fieldErrors,
    allocationError,
    portfolioBucketError,
    lifecycleClassification,
    lifecycleAcquisitionCost,
    lifecycleTaxCashId,
    lifecycleTaxSettings,
    lifecycleMilestones,
    lifecycleTransitions,
    lifecycleIssues,
    lifecycleValid,
    lifecycleRun,
    lifecycleError,
    updateLifecycleClassification,
    updateLifecycleAcquisitionCost,
    updateLifecycleTaxCashId,
    updateLifecycleTaxSettings,
    initLifecycleMilestones,
    rePrefillLifecycleMilestones,
    updateLifecycleMilestone,
    updateLifecycleTarget,
    addLifecycleTransition,
    updateLifecycleTransition,
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
  const [lifecycleNotice, setLifecycleNotice] = useState(() => localStorage.getItem(LIFECYCLE_RESET_NOTICE_KEY) === '1')
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
        {resetNotice && <section className="panel" role="status">Die bisherigen Eingaben wurden für die überarbeitete Versicherungsplanung zurückgesetzt. Bitte neu ergänzen. <button type="button" className="secondary-button" onClick={() => { localStorage.removeItem(RESET_NOTICE_KEY); setResetNotice(false) }}>Hinweis schließen</button></section>}
        {lifecycleNotice && <section className="panel" role="status">Lebenszyklus-Release: Vorversionen ohne Migration zurückgesetzt. Steuerklassen, Anschaffungskosten, Cash-Konto, Meilensteine und Basiszins ausdrücklich ergänzen. <button type="button" className="secondary-button" onClick={() => { localStorage.removeItem(LIFECYCLE_RESET_NOTICE_KEY); setLifecycleNotice(false) }}>Lebenszyklus-Hinweis schließen</button></section>}
        <InputPanel
          issues={issues}
          insuranceCoverageAnswers={insuranceCoverageAnswers} onInsuranceCoverageChange={updateInsuranceCoverage}
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

        <section aria-labelledby="lifecycle-setup-title" className="panel">
          <h2 id="lifecycle-setup-title">Lebenszyklus mit Investmentsteuern</h2>
          <LifecycleTaxSetup
            buckets={portfolioBuckets}
            classification={lifecycleClassification}
            acquisitionCost={lifecycleAcquisitionCost}
            taxCashId={lifecycleTaxCashId}
            taxSettings={lifecycleTaxSettings}
            onClassification={updateLifecycleClassification}
            onAcquisitionCost={updateLifecycleAcquisitionCost}
            onTaxCashId={updateLifecycleTaxCashId}
            onTaxSettings={updateLifecycleTaxSettings}
          />
          <LifecycleMilestones
            buckets={portfolioBuckets}
            milestones={lifecycleMilestones}
            transitions={lifecycleTransitions}
            totalToday={calculatePortfolioBucketTotal(portfolioBuckets)}
            onInit={initLifecycleMilestones}
            onRePrefill={rePrefillLifecycleMilestones}
            onUpdateMilestone={updateLifecycleMilestone}
            onUpdateTarget={updateLifecycleTarget}
            onAddTransition={addLifecycleTransition}
            onUpdateTransition={updateLifecycleTransition}
          />
          {lifecycleIssues.length ? (
            <div role="status">
              <p>Noch offen für Lebenszyklus:</p>
              <ul>
                {lifecycleIssues.map((issue, index) => <li key={index}>{issue}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        <section id="ergebnis" tabIndex={-1} className="results-section" aria-labelledby="results-title">
          <h2 id="results-title">Ergebnis</h2>
          {!lifecycleValid || !lifecycleRun ? (
            <section className="panel invalid-panel" role="status">
              {lifecycleError ?? portfolioBucketError ?? allocationError ?? 'Deine Prognose ist noch offen. Ergänze die verlinkten Angaben; danach erscheinen Ergebnisse, Diagramm und Tabelle.'}
              {lifecycleIssues.length ? (
                <ul>
                  {lifecycleIssues.map((issue, index) => <li key={index}>{issue}</li>)}
                </ul>
              ) : null}
              <p><a href="#inputs-title">Zu den offenen Angaben</a></p>
            </section>
          ) : (
            <>
              <LifecycleResults lifecycleRun={lifecycleRun} />
              <LifecycleChart lifecycleRun={lifecycleRun} />
              <details className="panel"><summary>Jährliche Abrechnung anzeigen</summary><LifecycleYearlyTable lifecycleRun={lifecycleRun} /></details>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
