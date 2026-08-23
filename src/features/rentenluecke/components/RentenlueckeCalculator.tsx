import { AssumptionsPanel } from './AssumptionsPanel'
import { InputPanel } from './InputPanel'
import { ScenarioOutcomePanel } from './ScenarioOutcomePanel'
import { SummaryCards } from './SummaryCards'
import { YearlyTable } from './YearlyTable'
import { useScenarioState } from '../hooks/useScenarioState'

export function RentenlueckeCalculator() {
  const {
    input,
    allocation,
    portfolioBuckets,
    historical,
    historicalValidYears,
    fieldErrors,
    allocationError,
    portfolioBucketError,
    isValid,
    result,
    stochasticSummary,
    updateField,
    updatePortfolioBucket,
    addPortfolioBucket,
    removePortfolioBucket,
    updateInflationSource,
    reset,
  } = useScenarioState()

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
        <InputPanel
          input={input}
          allocation={allocation}
          portfolioBuckets={portfolioBuckets}
          historical={historical}
          historicalValidYears={historicalValidYears}
          errors={fieldErrors}
          allocationError={allocationError}
          portfolioBucketError={portfolioBucketError}
          onChange={updateField}
          onPortfolioBucketChange={updatePortfolioBucket}
          onPortfolioBucketAdd={addPortfolioBucket}
          onPortfolioBucketRemove={removePortfolioBucket}
          onInflationSourceChange={updateInflationSource}
          onReset={reset}
        />

        {!isValid || !result || !stochasticSummary ? (
          <section className="panel invalid-panel" role="status">
            {portfolioBucketError ?? allocationError ??
              'Bitte korrigiere die markierten Eingaben. Ergebnisse, Diagramm und Tabelle werden erst mit gültigen Annahmen berechnet.'}
          </section>
        ) : (
          <>
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
