import { getInsuranceRateError } from '../../model/inputSchema'
import { PercentInput } from '../../../../shared/components/PercentInput'
import { formatPercent } from '../../model/format'
import { getInsuranceTreatment, getStreamInsuranceRates, INSURANCE_DEFAULT_MATRIX, INSURANCE_REFERENCE, type InsuranceTreatment, type RetirementInsurance } from '../../model/retirementInsurance'
import type { RetirementIncomeStream } from '../../model/types'

const TREATMENT_LABELS: Record<InsuranceTreatment, string> = { include: 'Einbeziehen', exclude: 'Nicht einbeziehen', review: 'Prüfen' }
const CATEGORY_REASONS = {
  'gesetzliche-rente': 'Gesetzliche Renten gehören grundsätzlich zur Beitragsbasis. Der angenommene Rentenversicherungsanteil ist im KV-Eigensatz enthalten.',
  betriebsrente: 'Versorgungsbezüge sind grundsätzlich relevant und werden selbst belastet. Tatsächliche Freibeträge und Sonderfälle bildet die Schätzung nicht ab.',
  'private-rente': 'Die Vertragsart und der Versicherungsstatus sind entscheidend. Freiwillige GKV berücksichtigt grundsätzlich alle Einnahmen; bei KVdR bleibt diese breite Kategorie zur Prüfung offen.',
  'rental-income': 'Miete zählt bei freiwilliger GKV grundsätzlich mit. Für KVdR schlägt die App keine Einbeziehung vor.',
  'side-income': 'Nebenjob kann Beschäftigung, Minijob oder selbstständige Tätigkeit bedeuten. Neben einer Rente erzieltes selbstständiges Arbeitseinkommen kann auch bei KVdR relevant sein. Die App klärt weder Beschäftigungsart noch Arbeitgeberanteile.',
  'bridge-income': 'Brückeneinkommen bezeichnet keine eindeutige rechtliche Einkommensart. Zeitraum, Status und tatsächliche Zahlungsart müssen geprüft werden.',
  other: 'Diese Sammelkategorie erlaubt keine eindeutige Zuordnung. Kläre die konkrete Einkommensart und deinen Status.',
}

export function StreamInsuranceControls({ stream, label, insurance, onUpdate }: {
  stream: RetirementIncomeStream
  label: string
  insurance: RetirementInsurance
  onUpdate: (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => void
}) {
  const proposed = INSURANCE_DEFAULT_MATRIX[insurance.status][stream.kind ?? 'other']
  const treatment = getInsuranceTreatment(stream, insurance.status)
  const rates = getStreamInsuranceRates(stream, insurance.rates)
  const isNet = stream.amountBasis === 'net'
  return <div className="retirement-income-row-note">
    <label className="field">
      <span className="field-label">KV/PV-Zuordnung von {label}</span>
      <select value={stream.insuranceTreatment ?? 'default'} onChange={(event) => onUpdate(stream.id, {
        insuranceTreatment: event.target.value === 'default' ? undefined : event.target.value as InsuranceTreatment,
      })}>
        <option value="default">Statusvorschlag: {TREATMENT_LABELS[proposed]}</option>
        {Object.entries(TREATMENT_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
    <p>{stream.insuranceTreatment ? `Eigene Überschreibung: ${TREATMENT_LABELS[treatment]} (Statusvorschlag: ${TREATMENT_LABELS[proposed]}).` : `Statusvorschlag aktiv: ${TREATMENT_LABELS[treatment]}.`}</p>
    {treatment === 'review' && <p className="source-warning">Unvollständig: „Prüfen“ bleibt ohne zusätzliche KV/PV in der Rechnung.</p>}
    <details><summary>Warum? – {label}</summary>
      <p>Stand {INSURANCE_REFERENCE.verifiedOn}: {CATEGORY_REASONS[stream.kind ?? 'other']}</p>
      {insurance.status === 'unknown' && <p>Ohne geklärten Status schlägt die App für alle Kategorien „Prüfen“ vor.</p>}
      <p>Dies ist ein änderbarer Planungsvorschlag, keine Feststellung der Beitragspflicht. Eigene Überschreibungen bleiben auch bei Status- oder Kategoriewechsel bestehen; bitte erneut prüfen.</p>
      <a href={INSURANCE_REFERENCE.sources.bmgContributions}>BMG: rechtlicher Hintergrund zu Beiträgen</a>
    </details>
    {isNet ? <p>Netto ist vollständig verfügbar: keine zusätzlichen KV/PV- oder sonstigen Abzüge, unabhängig von der Zuordnung. Für die Schätzung bitte Brutto verwenden.</p> : <>
      {!stream.separateDeductions ? <>
        <p className="source-warning">Bisheriger Gesamtabzug bleibt aktiv ({formatPercent(stream.deductionMode === 'effectiveHaircut' ? stream.effectiveDeductionRate : 0)}). Zusätzliche KV/PV ist bis zur ausdrücklichen Prüfung gesperrt.</p>
        <button type="button" className="secondary-button" onClick={() => onUpdate(stream.id, { separateDeductions: { otherRate: 0 } })}>Gesamtabzug für {label} geprüft: durch separate Abzüge mit zunächst 0 % sonstigen Abzügen ersetzen</button>
      </> : <>
        <PercentInput step={0.01} id={`insurance-other-${stream.id}`} label={`Sonstige Abzüge ohne KV/PV von ${label}`} value={stream.separateDeductions.otherRate} error={getInsuranceRateError(stream.separateDeductions.otherRate)} min={0} max={100}
          onChange={(otherRate) => onUpdate(stream.id, { separateDeductions: { otherRate } })} />
        <p>Separater Modus aktiv. Sonstige Abzüge selbst neu eintragen, ohne KV/PV. Beim Abschalten der Schätzung gilt wieder der gespeicherte Gesamtabzug von {formatPercent(stream.deductionMode === 'effectiveHaircut' ? stream.effectiveDeductionRate : 0)}.</p>
        <button type="button" className="secondary-button" onClick={() => onUpdate(stream.id, { separateDeductions: undefined })}>Für {label} zum Gesamtabzug zurückkehren</button>
      </>}
      <PercentInput step={0.01} id={`insurance-kv-${stream.id}`} label={`KV-Eigenanteil von ${label}`} value={rates.kv} error={getInsuranceRateError(rates.kv)} min={0} max={100}
        onChange={(kvRateOverride) => onUpdate(stream.id, { kvRateOverride })} />
      <PercentInput step={0.01} id={`insurance-pv-${stream.id}`} label={`PV-Eigenanteil von ${label}`} value={rates.pv} error={getInsuranceRateError(rates.pv)} min={0} max={100}
        onChange={(pvRateOverride) => onUpdate(stream.id, { pvRateOverride })} />
      <p>{stream.kvRateOverride !== undefined || stream.pvRateOverride !== undefined ? 'Eigene Satzüberschreibung aktiv.' : 'Referenzannahmen aktiv.'} Sätze wirken nur bei „Einbeziehen“ und geprüftem Gesamtabzug, jeweils auf den Bruttobetrag.</p>
      {(stream.kvRateOverride !== undefined || stream.pvRateOverride !== undefined) && <button type="button" className="secondary-button" onClick={() => onUpdate(stream.id, { kvRateOverride: undefined, pvRateOverride: undefined })}>Für {label} wieder Referenzannahmen verwenden</button>}
    </>}
  </div>
}
