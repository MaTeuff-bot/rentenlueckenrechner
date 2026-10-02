const SIMULATIONS_OPTIONS = [100, 250, 500, 1000, 2000] as const

export function SimulationsAssumptions({ simulations, onChange }: {
  simulations: number
  onChange: (simulations: number) => void
}) {
  const isNonStandard = !SIMULATIONS_OPTIONS.includes(simulations as (typeof SIMULATIONS_OPTIONS)[number])
  return (
    <fieldset className="wide-fieldset"><legend>Simulationsumfang</legend>
      <div className="field">
        <label htmlFor="simulations-count">Anzahl simulierter Verläufe (Monte Carlo)</label>
        <select
          id="simulations-count"
          value={simulations}
          onChange={event => onChange(Number(event.target.value))}
        >
          {SIMULATIONS_OPTIONS.map(count => <option key={count} value={count}>{count.toLocaleString('de-DE')}</option>)}
          {isNonStandard ? <option value={simulations}>{simulations.toLocaleString('de-DE')}</option> : null}
        </select>
      </div>
      <p>Mehr Verläufe machen die Bandbreiten (P10/P50/P90) und die Überlebenswahrscheinlichkeit stabiler, kosten aber Rechenzeit. Weniger Verläufe liefern schnellere, aber unruhigere Schätzungen: Insbesondere die P10-Schwelle wird bei kleinen Anzahlen ungenauer. Standard sind 1.000 Verläufe.</p>
      <p>Die Auswahl betrifft nur die Bandbreiten und Wahrscheinlichkeiten im Ergebnis. Der Referenzpfad (Planwert) und die benötigte Kapitalsuche sind davon unabhängig.</p>
    </fieldset>
  )
}
