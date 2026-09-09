import { useState } from 'react'
import { RESET_NOTICE_KEY } from '../hooks/scenarioState/persistence'
import { InsuranceBreakdown } from './InsuranceBreakdown'
import { AssumptionsPanel } from './AssumptionsPanel'
import { InputPanel } from './InputPanel'
import { ScenarioOutcomePanel } from './ScenarioOutcomePanel'
import { SummaryCards } from './SummaryCards'
import { YearlyTable } from './YearlyTable'
import { useScenarioState } from '../hooks/useScenarioState'

export function RentenlueckeCalculator() {
  const {
    input,
    insuranceIssues,
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
          <h1>Dein benötigtes Kapital zum Rentenbeginn</h1>
          <p>
            Ordne deine benannten Portfolio-Bausteine den Rollen Aktien, Anleihen oder Cash zu und schätze mit
            einer transparenten Jahressimulation, wie viel Kapital deine Rentenlücke bis zum Planungshorizont deckt.
          </p>
        </div>
      </header>

      <div className="page-shell content-stack">
        {resetNotice && <section className="panel" role="status">Die bisherigen Eingaben wurden für die neue KV/PV-Berechnung zurückgesetzt. Bitte neu ergänzen. <button type="button" className="secondary-button" onClick={() => { localStorage.removeItem(RESET_NOTICE_KEY); setResetNotice(false) }}>Hinweis schließen</button></section>}
        <InputPanel
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

        {insuranceIssues.length > 0 && <section className="panel source-warning" aria-label="KV/PV-Angaben ergänzen" role="status"><strong>KV/PV-Angaben fehlen oder widersprechen sich. Noch keine Prognose.</strong><ul>{insuranceIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></section>}

        {!isValid || !result || !stochasticSummary ? (
          <section className="panel invalid-panel" role="status">
            {portfolioBucketError ?? allocationError ??
              'Bitte korrigiere die markierten Eingaben. Ergebnisse, Diagramm und Tabelle werden erst mit gültigen Annahmen berechnet.'}
          </section>
        ) : (
          <>
            <InsuranceBreakdown rows={result.retirementRows} streams={retirementIncomeStreams} />
            <SummaryCards result={result} stochasticSummary={stochasticSummary} />
            <ScenarioOutcomePanel
              result={result}
              stochasticSummary={stochasticSummary}
              historicalValidYears={historicalValidYears}
            />
            <YearlyTable rows={result.rows} />
          </>
        )}

        <AssumptionsPanel />
      </div>
    </main>
  )
}
