import { AssumptionsPanel } from './AssumptionsPanel'
import { CapitalChart } from './CapitalChart'
import { InputPanel } from './InputPanel'
import { StochasticSimulationPanel } from './StochasticSimulationPanel'
import { SummaryCards } from './SummaryCards'
import { YearlyTable } from './YearlyTable'
import { useScenarioState } from '../hooks/useScenarioState'

export function RentenlueckeCalculator() {
  const {
    input,
    allocation,
    fieldErrors,
    allocationError,
    isValid,
    result,
    stochasticSummary,
    updateField,
    updateAllocation,
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
          errors={fieldErrors}
          allocationError={allocationError}
          onChange={updateField}
          onAllocationChange={updateAllocation}
          onReset={reset}
        />

        {!isValid || !result || !stochasticSummary ? (
          <section className="panel invalid-panel" role="status">
            {allocationError ??
              'Bitte korrigiere die markierten Eingaben. Ergebnisse, Diagramm und Tabelle werden erst mit gültigen Annahmen berechnet.'}
          </section>
        ) : (
          <>
            <SummaryCards result={result} />
            <StochasticSimulationPanel deterministicResult={result} summary={stochasticSummary} />
            <CapitalChart result={result} />
            <YearlyTable rows={result.rows} />
          </>
        )}

        <AssumptionsPanel />
      </div>
    </main>
  )
}
