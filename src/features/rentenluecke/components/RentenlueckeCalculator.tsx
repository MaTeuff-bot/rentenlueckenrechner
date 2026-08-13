import { AssumptionsPanel } from './AssumptionsPanel'
import { CapitalChart } from './CapitalChart'
import { InputPanel } from './InputPanel'
import { SummaryCards } from './SummaryCards'
import { YearlyTable } from './YearlyTable'
import { useScenarioState } from '../hooks/useScenarioState'

export function RentenlueckeCalculator() {
  const { input, fieldErrors, isValid, result, updateField, reset } = useScenarioState()

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
        <InputPanel input={input} errors={fieldErrors} onChange={updateField} onReset={reset} />

        {!isValid || !result ? (
          <section className="panel invalid-panel" role="status">
            Bitte korrigiere die markierten Eingaben. Ergebnisse, Diagramm und Tabelle werden erst mit gültigen
            Annahmen berechnet.
          </section>
        ) : (
          <>
            <SummaryCards result={result} />
            <CapitalChart result={result} />
            <YearlyTable rows={result.rows} />
          </>
        )}

        <AssumptionsPanel />
      </div>
    </main>
  )
}
