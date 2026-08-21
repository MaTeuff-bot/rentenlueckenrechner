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
    updateHistoricalReturnSeries,
    updateManualCashRealReturn,
    updateInflationSource,
    reset,
  } = useScenarioState()

  return (
    <main>
      <header className="hero">
        <div className="page-shell">
          <p className="eyebrow">Rentenlückenrechner</p>
          <h1>Benötigtes Kapital zum Rentenbeginn</h1>
          <p>
            Schätze mit einer transparenten Jahressimulation, wie viel Kapital zum Renteneintritt benötigt wird,
            um eine monatliche Rentenlücke bis zum Planungshorizont zu decken.
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
          onHistoricalReturnSeriesChange={updateHistoricalReturnSeries}
          onManualCashRealReturnChange={updateManualCashRealReturn}
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
